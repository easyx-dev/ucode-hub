/**
 * 模型端点的鉴权依赖装配：把服务层的两份判定接到可注入的 deps 上。
 *
 * 判定本体在 `services/auth/session-token.server` 与 `services/auth/device-token.server`，
 * 与隧道握手、资产下发、ingress 准入共用——模型端点只是同一份判定的另一个消费方。
 */

import { authorizeDeviceToken } from "#/services/auth/device-token.server";
import { authenticateToken } from "#/services/auth/session-token.server";

import type { ModelEndpointAuthDeps } from "./auth";

export const modelEndpointAuthDeps: ModelEndpointAuthDeps = {
  authorizeDeviceToken,
  authenticateToken,
};
