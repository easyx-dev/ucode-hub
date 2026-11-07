/**
 * 隧道多路复用：把帧分发到各条在飞的流上，并维护每条流的收敛状态。
 *
 * 只做协议状态机 + 回调，不碰 WS 与 HTTP：出站经 `transport`，入站把结果交给 `sink`
 * （ingress 侧把它实现成公网响应流）。流号由注入的分配器给出（只增不复用），
 * 并发上限按协议常量收口，超限时 `openStream` 返回 null（由 ingress 回 429）。
 *
 * 收敛规则（对端发错就得让这条流失败，而不是把连接搞崩）：
 * 首帧响应之前的响应体、重复的首帧响应、未开始就结束，都按协议错误收尾。
 *
 * 升级流（`upgrade: true`）是一条 WebSocket：应答必须是 101，之后两端各自持续发自己方向的
 * 数据帧，直到某一方发 `close`——它没有「请求体发完」「响应体发完」的边界。
 */
import {
  type ControlFrame,
  DATA_FRAME_KINDS,
  type DataFrame,
  MAX_CONCURRENT_STREAMS,
  type ResponseFrame,
  TUNNEL_ERROR_CODES,
} from "@ucode/hub-protocol";

import type {
  StreamFailure,
  StreamRequest,
  StreamSink,
  StreamTransport,
} from "#/services/ingress/stream-port";

/** 端口形状由消费方（`services/ingress/stream-port`）定义，本模块实现它；这里转出方便 server 内部引用 */
export type { StreamFailure, StreamRequest, StreamSink, StreamTransport };

/** 一条待转发请求的描述（对应 `request` 控制帧） */
export type PendingStream = {
  id: number;
  sink: StreamSink;
  /** 首帧响应到达前不接受响应体；升级流在 101 到达前也允许上行 */
  phase: "awaitingResponse" | "streaming";
  /** 是否是 WebSocket 升级流 */
  upgrade: boolean;
};

export type StreamTable = {
  get(id: number): PendingStream | undefined;
  has(id: number): boolean;
  size(): number;
  add(stream: PendingStream): void;
  /** 移出并返回；不在表里返回 undefined（收尾幂等靠它） */
  remove(id: number): PendingStream | undefined;
  /** 取出全部并清空（连接收尾用） */
  takeAll(): PendingStream[];
};

export const createStreamTable = (): StreamTable => {
  const streams = new Map<number, PendingStream>();

  return {
    get: (id) => streams.get(id),
    has: (id) => streams.has(id),
    size: () => streams.size,
    add(stream) {
      streams.set(stream.id, stream);
    },
    remove(id) {
      const stream = streams.get(id);
      if (!stream) return undefined;
      streams.delete(id);
      return stream;
    },
    takeAll() {
      const all = [...streams.values()];
      streams.clear();
      return all;
    },
  };
};

export type StreamDispatcher = {
  /** 开一条流并发 `request` 帧；超过并发上限返回 null */
  openStream(request: StreamRequest, sink: StreamSink): number | null;
  /** 送请求体分块；返回 false 表示不必再送（该流已收尾，或对端已开始回包），调用方应停止读上传 */
  sendRequestBody(streamId: number, chunk: Uint8Array, text?: boolean): Promise<boolean>;
  /** 请求体送完（升级流没有这回事，调用无副作用） */
  endRequest(streamId: number): void;
  /** 关闭一条升级流：发 `close` 给对端并移出登记表。浏览器侧已经关了，不再回调 sink */
  closeStream(streamId: number, code: number, reason?: string): void;
  /** hub 侧取消（公网侧断开）：发 `abort` 并移出登记表，不再回调 sink */
  abortStream(streamId: number, reason?: string): void;
  /** 连接级收尾：所有在飞流逐条以失败回调（连接已断，不再发帧） */
  failAllStreams(failure: StreamFailure): void;
  /** 入站控制帧（只处理流级帧，其余返回 undefined 交给宿主） */
  handleControlFrame(frame: ControlFrame): Promise<void>;
  /** 入站数据帧（请求体帧由客户端发来属违规） */
  handleDataFrame(frame: DataFrame): Promise<void>;
  /** 在飞流数（观测用） */
  pendingStreamCount(): number;
};

/** 对端违约（重复首帧、未开始就结束等）：对外一律是 `invalid_request`，词表里没有单独的「协议错」 */
const PROTOCOL_ERROR = (message: string): StreamFailure => ({
  code: TUNNEL_ERROR_CODES.invalidRequest,
  message,
});

/**
 * @param opts.transport - 出站帧的出口。
 * @param opts.allocateStreamId - 流号分配器：从 1 起、只增不复用（见 `connections.ts`）。
 */
export const createStreamDispatcher = (opts: {
  transport: StreamTransport;
  allocateStreamId: () => number;
}): StreamDispatcher => {
  const table = createStreamTable();

  /** 收尾一条流：先移出表再回调，所以重复调用一定是无操作 */
  const failStream = async (stream: PendingStream, failure: StreamFailure): Promise<void> => {
    table.remove(stream.id);
    await stream.sink.onError(failure);
  };

  const respond = async (frame: ResponseFrame): Promise<void> => {
    const stream = table.get(frame.id);
    if (!stream) return;
    if (stream.phase !== "awaitingResponse") {
      await failStream(stream, PROTOCOL_ERROR("同一条流收到重复的响应首帧"));
      return;
    }
    // 升级流只认 101：设备侧连不上本机 WebSocket 时用 `error` 帧，不在这里回普通状态码
    if (stream.upgrade && frame.status !== 101) {
      await failStream(stream, PROTOCOL_ERROR(`升级流收到了 ${frame.status} 应答`));
      return;
    }
    stream.phase = "streaming";
    await stream.sink.onResponse(frame.status, frame.headers);
  };

  const endStream = async (streamId: number): Promise<void> => {
    const stream = table.get(streamId);
    if (!stream) return;
    if (stream.upgrade) {
      await failStream(stream, PROTOCOL_ERROR("升级流不得以 responseEnd 结束"));
      return;
    }
    if (stream.phase !== "streaming") {
      await failStream(stream, PROTOCOL_ERROR("响应体未开始就收到结束帧"));
      return;
    }
    table.remove(streamId);
    await stream.sink.onEnd();
  };

  const handleClose = async (
    id: number,
    code: number,
    reason: string | undefined,
  ): Promise<void> => {
    const stream = table.get(id);
    if (!stream) return;
    if (!stream.upgrade) {
      await failStream(stream, PROTOCOL_ERROR("普通流不得以 close 结束"));
      return;
    }
    table.remove(id);
    await stream.sink.onClose?.(code, reason);
  };

  return {
    openStream(request, sink) {
      if (table.size() >= MAX_CONCURRENT_STREAMS) return null;
      const id = opts.allocateStreamId();
      table.add({ id, sink, phase: "awaitingResponse", upgrade: request.upgrade === true });
      opts.transport.sendControlFrame({
        t: "request",
        id,
        method: request.method,
        path: request.path,
        headers: request.headers,
        hasBody: request.hasBody,
        ...(request.upgrade ? { upgrade: true } : {}),
      });
      return id;
    },
    async sendRequestBody(streamId, chunk, text) {
      const stream = table.get(streamId);
      if (!stream) return false;
      // 普通流早回包就停下上行；升级流是双向的，101 之后还要继续送
      if (!stream.upgrade && stream.phase !== "awaitingResponse") return false;
      await opts.transport.sendRequestBodyFrame(streamId, chunk, text);
      return table.has(streamId);
    },
    /** 请求体送完：早回包的流也要发，客户端据此收尾请求体；升级流没有这个边界 */
    endRequest(streamId) {
      const stream = table.get(streamId);
      if (!stream || stream.upgrade) return;
      opts.transport.sendControlFrame({ t: "requestEnd", id: streamId });
    },
    closeStream(streamId, code, reason) {
      if (!table.remove(streamId)) return;
      opts.transport.sendControlFrame({ t: "close", id: streamId, code, reason });
    },
    abortStream(streamId, reason) {
      if (!table.remove(streamId)) return;
      opts.transport.sendControlFrame({ t: "abort", id: streamId, reason });
    },
    failAllStreams(failure) {
      // 连接已断，不再逐个 await：sink 各自按幂等收尾（起回应流已被消费端撤销）
      for (const stream of table.takeAll()) void stream.sink.onError(failure);
    },
    async handleControlFrame(frame) {
      switch (frame.t) {
        case "response":
          await respond(frame);
          return;
        case "responseEnd":
          await endStream(frame.id);
          return;
        case "close":
          await handleClose(frame.id, frame.code, frame.reason);
          return;
        case "error": {
          const stream = table.get(frame.id);
          if (stream) await failStream(stream, { code: frame.code, message: frame.message });
          return;
        }
        case "abort": {
          const stream = table.get(frame.id);
          if (stream) {
            await failStream(stream, {
              code: TUNNEL_ERROR_CODES.aborted,
              message: frame.reason ?? "对端已取消",
            });
          }
          return;
        }
        default:
          return;
      }
    },
    async handleDataFrame(frame) {
      const stream = table.get(frame.streamId);
      if (!stream) return;
      if (
        frame.kind !== DATA_FRAME_KINDS.responseBody &&
        frame.kind !== DATA_FRAME_KINDS.responseText
      ) {
        await failStream(stream, PROTOCOL_ERROR("客户端不得发送请求体帧"));
        return;
      }
      if (stream.phase !== "streaming") {
        await failStream(stream, PROTOCOL_ERROR("响应首帧之前收到响应体"));
        return;
      }
      await stream.sink.onBody(frame.payload, frame.kind === DATA_FRAME_KINDS.responseText);
    },
    pendingStreamCount() {
      return table.size();
    },
  };
};
