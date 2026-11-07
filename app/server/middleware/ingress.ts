/**
 * ingress 的 HTTP 入口：认设备 → 准入 → 转发。只做框架适配，判定与转发都在 `services/ingress/`。
 *
 * 「入口是唯一门」：经中继到达 UCode 的请求等同于本机 owner，所以这里必须「已登录 + 设备属于该用户」
 * 都成立才放行（管理端账号可访问任意设备）。放行后剥掉调用方的凭证与逐跳头、注入来源头；
 * UCode 侧的本地 `serviceToken` 由它自己的中继客户端补上，**hub 不持有任何 UCode 凭证**。
 *
 * `env.baseDomain` 为 null（未配 HUB_BASE_DOMAIN）时子域形态不生效；单域名下的路径形态
 * （`/d/<设备 id>`）不依赖父域，两者都命中不了才让请求落回 admin / 前台路由。
 */
import { defineEventHandler, getRequestHost } from "nitro/h3";

import { env } from "#/env";
import { admitIngress, isIngressDenial } from "#/services/ingress/admission";
import { forwardToTunnel } from "#/services/ingress/forward";
import { isUpgradeRequest, resolveIngressTarget } from "#/services/ingress/request";
import { CANONICAL_REDIRECT_STATUS, INGRESS_REJECTIONS } from "#/services/ingress/status";
import { failJson } from "#/shared-services/http/json-response";
import { logger } from "#/shared-services/logger";
import { tunnelRegistry } from "../tunnel/connections";

export default defineEventHandler(async (event) => {
  const target = resolveIngressTarget(event.url.pathname, getRequestHost(event), env.baseDomain);
  if (!target) return;

  // WebSocket 升级：路径形态交给 `/d/<设备 id>/...` 的专用 route（这一层升不了级），
  // 子域形态暂不支持——带 Upgrade 的请求没有普通响应体可回，只能明确拒绝
  if (isUpgradeRequest(event.req.headers)) {
    if (target.basePath) return;
    return failJson(
      INGRESS_REJECTIONS.upgradeUnsupported.status,
      INGRESS_REJECTIONS.upgradeUnsupported.error,
    );
  }

  const { deviceId, basePath } = target;

  // 路径寻址不带尾斜杠时，页面里的相对资源会以 `/d/` 为基准解析，先纠正到规范地址
  if (basePath && event.url.pathname === basePath) {
    return new Response(null, {
      status: CANONICAL_REDIRECT_STATUS,
      headers: { location: `${basePath}/${event.url.search}` },
    });
  }

  const path = (target.restPath ?? event.url.pathname) + event.url.search;
  const startedAt = Date.now();

  const admission = await admitIngress(deviceId, event.req.headers, (id) => tunnelRegistry.get(id));
  if (isIngressDenial(admission)) {
    return failJson(admission.status, admission.error, admission.code);
  }

  const response = await forwardToTunnel({
    deviceId,
    userId: admission.userId,
    basePath,
    method: event.req.method,
    path,
    headers: event.req.headers,
    body: event.req.body,
    signal: event.req.signal,
    connection: admission.connection,
  });
  logger.debug(
    {
      deviceId,
      userId: admission.userId,
      operatorType: admission.userType,
      method: event.req.method,
      path,
      status: response.status,
      ms: Date.now() - startedAt,
    },
    "ingress 请求",
  );
  return response;
});
