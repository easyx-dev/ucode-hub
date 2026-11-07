/**
 * 设备令牌 → 设备：`Authorization: Bearer <deviceToken>` 换出设备记录。**这是唯一的判定实现**。
 *
 * 三个入口共用（内置资产下发、模型端点、换隧道票据），差异只在拿到设备之后做什么：
 * 资产要清单、模型端点要「记到哪个账号」、换票要签票据。
 *
 * 判定口径：令牌查不到设备、设备已吊销、设备已软删，一律返回 null，不区分原因——
 * 对外不给任何可探测的线索。
 */
import { DEVICE_AUTH_HEADER } from "@ucode/hub-protocol";

import { type DeviceRecord, findDeviceByToken } from "#/services/device/device.server";
import { parseBearerToken } from "#/shared-services/auth/bearer";

/**
 * 按明文令牌放行设备：只有 `active` 算可用。
 *
 * @param token - 设备令牌明文（不含 `Bearer ` 前缀）。
 * @returns 设备记录，不可用即 null。
 */
export const authorizeDeviceToken = async (
  token: string | null | undefined,
): Promise<DeviceRecord | null> => {
  if (!token) return null;
  const found = await findDeviceByToken(token);
  return found?.status === "active" ? found : null;
};

/**
 * 从请求头里取设备令牌再放行：入口只需要把 `Headers` 递进来。
 *
 * @param headers - 请求头。
 * @returns 设备记录，不可用即 null。
 */
export const authorizeDeviceHeaders = async (headers: Headers): Promise<DeviceRecord | null> =>
  authorizeDeviceToken(parseBearerToken(headers.get(DEVICE_AUTH_HEADER)));
