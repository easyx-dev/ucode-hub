/**
 * ingress 的入口准入：解调用方身份、确认设备归属、取出该设备的在线隧道。
 *
 * HTTP 回灌（`middleware/ingress.ts`）与 WebSocket 升级（`routes/d/[deviceId]/[...path].ts`）
 * 共用这一段——「入口是唯一门」的判定只能有一份，否则两条路的放行口径迟早会分叉。
 */

import { TUNNEL_ERROR_CODES } from "@ucode/hub-protocol";
import { canAccessDevice } from "#/services/auth/device-access";
import { authenticateHeaders } from "#/services/auth/session-token.server";
import { findDeviceAccess } from "#/services/device/device.server";
import type { UserRef, UserType } from "#/types/user";
import type { ConnectionLookup, TunnelPeer } from "./stream-port";

/** 准入失败：`status` 与 `error` 直接回给调用方，`code` 仅能在归类时给出 */
export type IngressDenial = {
  status: number;
  error: string;
  code?: string;
};

/** 准入通过：后续转发用这条隧道与该调用方的身份 */
export type IngressAdmission = {
  connection: TunnelPeer;
  userId: string;
  userType: UserType;
};

export const isIngressDenial = (
  result: IngressAdmission | IngressDenial,
): result is IngressDenial => "status" in result;

/**
 * 解出调用方身份：Bearer 令牌优先，其次管理端 / 客户端会话 Cookie。
 *
 * 判定本体在 `services/auth/session-token.server`（与页面中间件、Bearer 守卫、模型端点共用一份）；
 * 这里只把结果收成 ingress 需要的 `UserRef`，并在失败时回 null（调用方统一 401）。
 */
export const resolveIngressUser = async (headers: Headers): Promise<UserRef | null> => {
  const user = await authenticateHeaders(headers);
  return user ? { type: user.type, id: user.id } : null;
};

/**
 * 完整准入：身份 → 设备归属 → 未吊销 → 在线隧道。
 * 已吊销的设备即便隧道还连着也不放行，与「没有隧道」同判定（客户端会自行断线重连）。
 *
 * @param deviceId - 目标设备。
 * @param headers - 公网请求头（Bearer 或会话 Cookie）。
 * @param lookup - 取在线隧道：实现由宿主注入，本层不认识隧道注册表。
 */
export const admitIngress = async (
  deviceId: string,
  headers: Headers,
  lookup: ConnectionLookup,
): Promise<IngressAdmission | IngressDenial> => {
  const user = await resolveIngressUser(headers);
  if (!user) return { status: 401, error: "未认证或凭证无效" };

  const found = await findDeviceAccess(deviceId);
  if (!found || !canAccessDevice(found, user)) {
    return { status: 404, error: "设备不存在或已被删除" };
  }

  const connection = found.status === "active" ? lookup(deviceId) : null;
  if (!connection)
    return { status: 502, error: "设备未连接", code: TUNNEL_ERROR_CODES.deviceOffline };

  return { connection, userId: user.id, userType: user.type };
};
