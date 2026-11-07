/**
 * 一条公网请求 → 隧道：开流、泵请求体、等响应头、把响应体交回公网侧。
 *
 * 入参是普通数据（方法 / 路径 / 头 / 体 / 取消信号）而不是框架事件对象，所以这段编排可以脱 HTTP
 * 运行时单测——「设备离线回 502」「并发超限回 429」「路径过长 414」这些判定不该只活在中间件里。
 */
import { type HeaderMap, headerBytes, MAX_HEADER_BYTES } from "@ucode/hub-protocol";
import { failJson } from "#/shared-services/http/json-response";
import { logger } from "#/shared-services/logger";
import { createIngressExchange, type HeadResult } from "./exchange";
import { pumpRequestBody } from "./pump";
import {
  buildIngressRequestHeaders,
  buildIngressResponseHeaders,
  MAX_INGRESS_PATH_LENGTH,
  toResponseHeaders,
} from "./request";
import { CLIENT_CLOSED_STATUS, INGRESS_REJECTIONS } from "./status";
import type { StreamRequest, TunnelPeer } from "./stream-port";

/** 一次转发所需的全部输入：调用方负责从框架对象里取出来 */
export type IngressForwardInput = {
  deviceId: string;
  userId: string;
  /** 页面挂载前缀（路径寻址才非空）：告诉 UCode 把 `<base href>` 指到哪里 */
  basePath: string | null;
  method: string;
  /** 剥掉前缀后的路径（含查询串） */
  path: string;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
  /** 公网请求的取消信号：连接断开时用它兜底取消隧道上的流 */
  signal: AbortSignal;
  connection: TunnelPeer;
};

/** 限额校验：路径与头超限时直接给出拒绝响应（不建流） */
const rejectByLimit = (path: string, headers: HeaderMap): Response | null => {
  if (path.length > MAX_INGRESS_PATH_LENGTH) {
    return failJson(INGRESS_REJECTIONS.pathTooLong.status, INGRESS_REJECTIONS.pathTooLong.error);
  }
  if (headerBytes(headers) > MAX_HEADER_BYTES) {
    return failJson(
      INGRESS_REJECTIONS.headersTooLarge.status,
      INGRESS_REJECTIONS.headersTooLarge.error,
    );
  }
  return null;
};

/**
 * 首帧没能给出可用响应时的映射：隧道失败 502（带它的错误码）、公网侧走了 499、
 * 设备给了不可用状态码 502。拿到 `head` 的调用方不走这里。
 */
const rejectHead = (head: Exclude<HeadResult, { kind: "head" }>): Response => {
  if (head.kind === "aborted") return new Response(null, { status: CLIENT_CLOSED_STATUS });
  if (head.kind === "failure") {
    return failJson(
      INGRESS_REJECTIONS.forwardFailed.status,
      INGRESS_REJECTIONS.forwardFailed.error,
      head.failure.code,
    );
  }
  return failJson(
    INGRESS_REJECTIONS.invalidStatus.status,
    INGRESS_REJECTIONS.invalidStatus.error,
    INGRESS_REJECTIONS.invalidStatus.code,
  );
};

/**
 * 转发一条请求。
 *
 * @param input - 见 `IngressForwardInput`。
 * @returns 可以直接返回给公网侧的响应（成功时响应体是隧道侧逐帧推来的流）。
 */
export const forwardToTunnel = async (input: IngressForwardInput): Promise<Response> => {
  const { deviceId, userId, basePath, path, headers: requestHeaders, body, signal } = input;

  const headers = buildIngressRequestHeaders(requestHeaders, { deviceId, userId, basePath });
  const rejected = rejectByLimit(path, headers);
  if (rejected) return rejected;

  let streamId: number | null = null;
  const exchange = createIngressExchange({
    signal,
    onAbort: (reason) => {
      if (streamId !== null) input.connection.dispatcher.abortStream(streamId, reason);
    },
  });

  const streamRequest: StreamRequest = {
    method: input.method,
    path,
    headers,
    hasBody: body !== null,
  };
  streamId = input.connection.dispatcher.openStream(streamRequest, exchange.sink);
  if (streamId === null) {
    exchange.discard();
    return failJson(
      INGRESS_REJECTIONS.tunnelBusy.status,
      INGRESS_REJECTIONS.tunnelBusy.error,
      INGRESS_REJECTIONS.tunnelBusy.code,
    );
  }

  if (body) void pumpRequestBody(body, input.connection.dispatcher, streamId);

  const head = await exchange.waitHead();
  if (head.kind !== "head") {
    if (head.kind === "failure") {
      logger.debug({ deviceId, path, code: head.failure.code }, "隧道请求失败，回 502");
    }
    return rejectHead(head);
  }
  // 设备回 1xx 时不能拿来当最终响应：按不可用处理
  if (head.status < 200) {
    return failJson(
      INGRESS_REJECTIONS.invalidStatus.status,
      INGRESS_REJECTIONS.invalidStatus.error,
      INGRESS_REJECTIONS.invalidStatus.code,
    );
  }

  const responseHeaders = toResponseHeaders(buildIngressResponseHeaders(head.headers));
  // 反代侧别缓冲：事件流要逐帧到
  responseHeaders.set("x-accel-buffering", "no");
  return new Response(exchange.stream, { status: head.status, headers: responseHeaders });
};
