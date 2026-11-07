/**
 * 隧道端口：**由消费方（ingress）定义，`server/tunnel/` 去实现**。
 *
 * 方向是刻意倒过来的。数据面在内核里只认「请求描述 + 消费端 + 出站出口」这三样东西，
 * 而 ingress 要把一条公网请求塞进隧道——需要定义这些形状的应该是它，不该反过来让服务层
 * 去 import `server/tunnel/*`。这样 `src/` 里不再出现 `server/` 的 import，隧道也能脱离
 * ingress 单独测试（`stream-port` 是纯类型，没有实现）。
 */
import type { ControlFrame, HeaderMap } from "@ucode/hub-protocol";

/** 一条待转发请求的描述（对应协议里的 `request` 控制帧） */
export type StreamRequest = {
  method: string;
  /** 含查询串的原始路径 */
  path: string;
  /** 已剥掉调用方凭证与逐跳头的请求头（同名多值保持数组） */
  headers: HeaderMap;
  hasBody: boolean;
  /** 要转成 WebSocket：应答必须是 101，之后双向发数据帧，直到某一方发 `close` */
  upgrade?: boolean;
};

/** 出站侧的出口：控制帧与请求体分块（编码与背压在实现方之后） */
export type StreamTransport = {
  sendControlFrame(frame: ControlFrame): void;
  /**
   * 请求体分块；返回的 promise 在「可以继续送下一块」时 resolve（背压由实现方负责）。
   * `text` 为真表示这一块是 WebSocket 文本帧的内容。
   */
  sendRequestBodyFrame(streamId: number, chunk: Uint8Array, text?: boolean): Promise<void>;
};

/** 流失败：`code` 取协议词表，ingress 据此回 502 */
export type StreamFailure = {
  code: string;
  message: string;
};

/** 一条流的消费端；回调可返回 promise（响应流按水位线吊住分发即由此实现） */
export type StreamSink = {
  onResponse(status: number, headers: HeaderMap): void | Promise<void>;
  /** `text` 为真表示这一块是 WebSocket 文本帧的内容（普通 HTTP 流转发时不会出现） */
  onBody(chunk: Uint8Array, text?: boolean): void | Promise<void>;
  onEnd(): void | Promise<void>;
  onError(failure: StreamFailure): void | Promise<void>;
  /** 升级流被对端关闭：带 WebSocket 关闭码（普通流不会走到这里） */
  onClose?(code: number, reason: string | undefined): void | Promise<void>;
};

/** ingress 用到的隧道能力子集：内核的实现比这更宽，这里只声明消费方真正依赖的部分 */
export type StreamDispatcherPort = {
  /** 开一条流；并发超限返回 null（ingress 据此回 429） */
  openStream(request: StreamRequest, sink: StreamSink): number | null;
  /** 送请求体分块；返回 false 表示该流已收尾，调用方应停止读上传 */
  sendRequestBody(streamId: number, chunk: Uint8Array, text?: boolean): Promise<boolean>;
  /** 请求体送完 */
  endRequest(streamId: number): void;
  /** 关闭一条升级流 */
  closeStream(streamId: number, code: number, reason?: string): void;
  /** 取消一条流（公网侧断开） */
  abortStream(streamId: number, reason?: string): void;
};

/**
 * 一台设备的在线隧道：ingress 只需要「能开流」与「连接标识」。
 * 具体实现（`server/tunnel/connections.ts` 的 `TunnelConnection`）比这更宽，这里是最小面。
 */
export type TunnelPeer = {
  /** 本次连接的标识：握手到升级之间隧道可能换了一条，用它比对 */
  connectionId: string;
  dispatcher: StreamDispatcherPort;
};

/** 按设备取在线隧道：由宿主注入（`server/` 提供实现），ingress 不 import 注册表 */
export type ConnectionLookup = (deviceId: string) => TunnelPeer | null;
