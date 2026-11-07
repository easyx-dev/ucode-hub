/**
 * 路径寻址下的 WebSocket 升级入口：`/d/<设备 id>/<该设备上的路径>`。
 *
 * 浏览器这条 WS 由 hub 终结，字节经隧道上的升级流来回：上行用请求体帧、下行用响应体帧，
 * 关闭时把 WebSocket 关闭码原样带到对端——终端靠它区分「进程结束」「终端已不存在」「凭证失效」。
 *
 * 这里只做三件事：解析路径、准入、把六个回调转给 `ingress/socket.ts`。
 * 非升级的同前缀请求不走这里（由 ingress 中间件按普通 HTTP 回灌）。
 */
import { defineWebSocketHandler } from "nitro/h3";
import { admitIngress, isIngressDenial } from "#/services/ingress/admission";
import { buildIngressRequestHeaders, parseDevicePath } from "#/services/ingress/request";
import { INGRESS_REJECTIONS } from "#/services/ingress/status";
import { failJson } from "#/shared-services/http/json-response";
import { logger } from "#/shared-services/logger";
import { tunnelRegistry } from "../../../tunnel/connections";
import {
  closeIngressSocket,
  forwardSocketMessage,
  getSocketSession,
  INGRESS_CLOSE_CODES,
  type IngressUpgradeContext,
  openIngressSocket,
  setSocketSession,
} from "../../../tunnel/ingress-socket";

export default defineWebSocketHandler({
  /** 升级时鉴权：设备不属于调用方、设备离线都在这里挡下，WS 不建 */
  async upgrade(request) {
    const url = new URL(request.url);
    const match = parseDevicePath(url.pathname);
    if (!match) {
      return failJson(
        INGRESS_REJECTIONS.deviceNotFound.status,
        INGRESS_REJECTIONS.deviceNotFound.error,
      );
    }

    const admission = await admitIngress(match.deviceId, request.headers, (id) =>
      tunnelRegistry.get(id),
    );
    if (isIngressDenial(admission)) {
      return failJson(admission.status, admission.error, admission.code);
    }

    const context: IngressUpgradeContext = {
      deviceId: match.deviceId,
      connectionId: admission.connection.connectionId,
      path: `${match.rest}${url.search}`,
      headers: buildIngressRequestHeaders(request.headers, {
        deviceId: match.deviceId,
        userId: admission.userId,
        basePath: match.basePath,
      }),
    };
    return { context };
  },

  open(peer) {
    const ctx = peer.context as unknown as IngressUpgradeContext | undefined;
    const session = openIngressSocket(peer, ctx);
    if (session) setSocketSession(peer, session);
  },

  message(peer, message) {
    const session = getSocketSession(peer);
    if (session) forwardSocketMessage(session, message);
  },

  close(peer, details) {
    const session = getSocketSession(peer);
    if (session)
      closeIngressSocket(session, details.code ?? INGRESS_CLOSE_CODES.normal, details.reason);
  },

  error(peer, error) {
    logger.warn(
      {
        session: getSocketSession(peer) !== null,
        error: error instanceof Error ? error.message : String(error),
      },
      "ingress WS 出错，交由 close 收尾",
    );
  },
});
