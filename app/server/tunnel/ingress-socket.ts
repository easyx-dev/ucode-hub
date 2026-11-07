/**
 * 公网侧 WebSocket ↔ 隧道升级流的桥：浏览器这条 WS 由 hub 终结，字节经隧道来回。
 *
 * 抽出来的原因：这段装配（`StreamSink` 的五个回调 + 关闭码归一 + 会话登记）原先内联在路由里，
 * 路由于是必须知道流语义与关闭码表；抽成函数后路由只剩「升级阶段鉴权 + 转调」，
 * 这段逻辑也能对着假 peer 断言。
 */

import type { HeaderMap } from "@ucode/hub-protocol";
import type { WebSocketMessage, WebSocketPeer } from "nitro/h3";
import { logger } from "#/shared-services/logger";
import { type TunnelConnection, tunnelRegistry } from "./connections";
import type { StreamSink } from "./dispatch";

const UNSENDABLE_CLOSE_CODES = new Set([1004, 1005, 1006, 1015]);

export const normalizeCloseCode = (code: number | undefined): number => {
  if (code === undefined || code < 1000 || code > 4999) return 1000;
  return UNSENDABLE_CLOSE_CODES.has(code) ? 1000 : code;
};

/** 关闭原因的上限：WebSocket 关闭帧的控制帧载荷只有 125 字节，留出编码余量 */
export const MAX_CLOSE_REASON_LENGTH = 100;

export const truncateCloseReason = (reason: string | undefined): string | undefined => {
  if (!reason) return undefined;
  return reason.length > MAX_CLOSE_REASON_LENGTH
    ? reason.slice(0, MAX_CLOSE_REASON_LENGTH)
    : reason;
};

/**
 * WebSocket 侧的关闭码：1011 是「服务端遇到意外」，1013 是「稍后再试」（并发超限）。
 * 终端的 4401/4404 由设备侧给出，不经这里。这张表只在数据面用，所以跟着 WS 桥走。
 */
export const INGRESS_CLOSE_CODES = {
  missingHandshake: 1011,
  deviceOffline: 1011,
  upgradeFailed: 1011,
  tunnelBusy: 1013,
  normal: 1000,
} as const;

/** 会话挂在 `peer.context` 上：连接结束随之释放，不需要额外的 map 与清理 */
const SESSION_KEY = "hubIngressSocket";

export type IngressSocketSession = {
  connection: TunnelConnection;
  streamId: number;
  /** 收尾只做一次：关闭回调与 sink 回调都可能先到 */
  closed: boolean;
};

/** 升级时放进 context 的东西：open 时据此开流 */
export type IngressUpgradeContext = {
  deviceId: string;
  connectionId: string;
  /** 剥掉前缀后的路径（含查询串——终端的握手票在 query 里） */
  path: string;
  headers: HeaderMap;
};

export const getSocketSession = (peer: WebSocketPeer): IngressSocketSession | null =>
  (peer.context[SESSION_KEY] as IngressSocketSession | undefined) ?? null;

/** 登记会话：`open` 里拿到 handle 后挂到 peer 上，连接结束随之释放 */
export const setSocketSession = (peer: WebSocketPeer, session: IngressSocketSession): void => {
  peer.context[SESSION_KEY] = session;
};

/** 关闭浏览器 WS：对端可能已经走了，关闭失败只记 debug */
const closePeer = (peer: WebSocketPeer, code: number, reason?: string): void => {
  try {
    peer.close(normalizeCloseCode(code), truncateCloseReason(reason));
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      "ingress WS 关闭失败（连接可能已关闭）",
    );
  }
};

/**
 * 开一条升级流：设备离线、并发超限、握手信息缺失都在这里就地关掉浏览器侧连接。
 *
 * @param peer - 浏览器侧的 WS 连接。
 * @param context - 升级阶段解出的设备与请求信息。
 * @returns 已登记的会话；失败返回 null（浏览器侧连接已被关闭）。
 */
export const openIngressSocket = (
  peer: WebSocketPeer,
  context: IngressUpgradeContext | undefined,
): IngressSocketSession | null => {
  if (!context?.connectionId) {
    logger.warn({ peerId: peer.id }, "ingress WS 缺少握手信息，直接关闭");
    closePeer(peer, INGRESS_CLOSE_CODES.missingHandshake, "missing_handshake");
    return null;
  }

  // 握手到升级之间隧道可能已经换了一条：连接标识对不上就按离线处理
  const connection = tunnelRegistry.get(context.deviceId);
  if (!connection || connection.connectionId !== context.connectionId) {
    closePeer(peer, INGRESS_CLOSE_CODES.deviceOffline, "device_offline");
    return null;
  }

  const sink: StreamSink = {
    /** 浏览器侧升级已经完成，设备侧的 101 只是「本机连接已建好」的确认 */
    onResponse(status) {
      if (status !== 101) {
        closePeer(peer, INGRESS_CLOSE_CODES.upgradeFailed, "upgrade_failed");
      }
    },
    onBody(chunk, text) {
      try {
        // 文本帧保持文本：终端的下行按原样交给浏览器，二进制/文本的区分不能丢
        peer.send(text ? new TextDecoder().decode(chunk) : chunk);
      } catch (error) {
        logger.debug(
          {
            deviceId: context.deviceId,
            error: error instanceof Error ? error.message : String(error),
          },
          "ingress WS 下行发送失败（浏览器可能已断开）",
        );
      }
    },
    onEnd() {
      closePeer(peer, INGRESS_CLOSE_CODES.normal, "closed");
    },
    onError(failure) {
      closePeer(peer, INGRESS_CLOSE_CODES.upgradeFailed, failure.code);
    },
    onClose(code, reason) {
      closePeer(peer, code, reason);
    },
  };

  const streamId = connection.dispatcher.openStream(
    { method: "GET", path: context.path, headers: context.headers, hasBody: false, upgrade: true },
    sink,
  );
  if (streamId === null) {
    closePeer(peer, INGRESS_CLOSE_CODES.tunnelBusy, "tunnel_busy");
    return null;
  }

  logger.debug({ deviceId: context.deviceId, streamId, path: context.path }, "ingress WS 已开流");
  return { connection, streamId, closed: false };
};

/** 浏览器发来的消息：文本 / 二进制原样带到设备侧（终端的上行约定是文本帧） */
export const forwardSocketMessage = (
  session: IngressSocketSession,
  message: WebSocketMessage,
): void => {
  if (session.closed) return;
  const isText = typeof message.rawData === "string";
  void session.connection.dispatcher.sendRequestBody(
    session.streamId,
    message.uint8Array(),
    isText,
  );
};

/** 浏览器断开：让设备侧关掉本机 WebSocket，带上它的关闭码（1005/1006 归一成正常关闭） */
export const closeIngressSocket = (
  session: IngressSocketSession,
  code: number,
  reason: string | undefined,
): void => {
  if (session.closed) return;
  session.closed = true;
  session.connection.dispatcher.closeStream(
    session.streamId,
    normalizeCloseCode(code),
    truncateCloseReason(reason),
  );
};
