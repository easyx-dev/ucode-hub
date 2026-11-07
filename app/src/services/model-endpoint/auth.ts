/**
 * 模型端点鉴权：`Authorization: Bearer <deviceToken>`（设备身份）或 `<hub 会话 JWT>`（用户身份）。
 *
 * 令牌形态本身就能分流——JWT 恰为三段（两个点），设备令牌是 base64url（不含点），
 * 因此无需「先查设备再验签」串两趟；两种身份收敛成同一份「账号 + 设备」口径，用量一律记到账号上
 * （设备令牌是账号的资产，记账不能记到设备身上，否则换设备就丢账）。
 *
 * 设备查询 / 验签 / 账号校验都以参数注入，判定逻辑因此可脱库单测。
 */

import { parseBearerToken } from "#/shared-services/auth/bearer";
import type { UserType } from "#/types/user";

/** 调用方身份：设备令牌记设备属主，网页会话记本人 */
export type ModelEndpointCaller = {
  accountType: UserType;
  accountId: string;
  /** 只有设备身份有值，用量表的 `device_id` 据此落库 */
  deviceId: string | null;
  kind: "device" | "user";
};

/** 设备记录里鉴权与记账需要的字段 */
export type CallerDevice = {
  id: string;
  ownerType: UserType;
  ownerId: string;
};

/** 鉴权依赖：路由注入真实实现，测试传替身 */
export type ModelEndpointAuthDeps = {
  /** 设备令牌 → 可用设备（已吊销 / 软删一律 null） */
  authorizeDeviceToken: (token: string) => Promise<CallerDevice | null>;
  /** 会话令牌 → 用户（验签 + 可用 + 令牌版本） */
  authenticateToken: (
    token: string,
  ) => Promise<{ ok: true; user: { type: UserType; id: string } } | { ok: false }>;
};

/** JWT 恰为三段；设备令牌是 base64url，不含点 */
export const isJwtShaped = (token: string): boolean => token.split(".").length === 3;

const resolveDeviceCaller = async (
  token: string,
  deps: ModelEndpointAuthDeps,
): Promise<ModelEndpointCaller | null> => {
  // 判定与隧道握手 / 资产下发同一份：吊销、软删、令牌不存在都给 null
  const found = await deps.authorizeDeviceToken(token);
  if (!found) return null;
  return {
    accountType: found.ownerType,
    accountId: found.ownerId,
    deviceId: found.id,
    kind: "device",
  };
};

const resolveUserCaller = async (
  token: string,
  deps: ModelEndpointAuthDeps,
): Promise<ModelEndpointCaller | null> => {
  const result = await deps.authenticateToken(token);
  if (!result.ok) return null;
  return {
    accountType: result.user.type,
    accountId: result.user.id,
    deviceId: null,
    kind: "user",
  };
};

/** 解出调用方身份；缺令牌、形态不符、令牌无效 / 已吊销 / 账号停用一律返回 null（调用方回 401） */
export const resolveModelEndpointCaller = async (
  authorization: string | null | undefined,
  deps: ModelEndpointAuthDeps,
): Promise<ModelEndpointCaller | null> => {
  const token = parseBearerToken(authorization);
  if (!token) return null;
  return isJwtShaped(token)
    ? await resolveUserCaller(token, deps)
    : await resolveDeviceCaller(token, deps);
};
