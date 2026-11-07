/**
 * 设备归属判定：谁能访问哪台设备。纯函数，不查库。
 *
 * 与 `device-token` 分开放的理由：那是「这份令牌对应哪台设备」，这是「这个用户能不能碰这台设备」。
 * 准入（ingress）两种判定都要，但它们是两个问题，混在一个文件里读起来像一件事。
 */
import type { UserRef } from "#/types/user";

/**
 * 管理端账号可访问任意设备；客户端用户只能是设备属主。
 *
 * @param device - 设备的归属信息。
 * @param user - 调用方身份。
 * @returns 允许访问即 true。
 */
export const canAccessDevice = (
  device: { ownerType: UserRef["type"]; ownerId: string },
  user: UserRef,
): boolean =>
  user.type === "admin" || (device.ownerType === user.type && device.ownerId === user.id);
