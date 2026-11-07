/**
 * 管理端鉴权（仅服务端）：把「令牌 → 管理端上下文」的失败原因映射成 AdminAuthError。
 *
 * 判定本体在 `services/auth/session-token.server`（与客户端、Bearer、ingress 共用一份），
 * 这里只负责管理端的口径：非管理端身份是 403，账号被禁用是 403，其余一律 401。
 */
import { type AdminAuthContext, AdminAuthError } from "#/middleware/admin-auth";
import { authenticateToken } from "#/services/auth/session-token.server";

/**
 * 校验令牌并返回管理端上下文。
 *
 * @param token - 会话令牌（由中间件从 Cookie 里取出）。
 * @returns 管理端上下文（含权限码）。
 */
export async function resolveAdminAuthContext(
  token: string | undefined,
): Promise<AdminAuthContext> {
  if (!token) throw new AdminAuthError("未登录或登录已过期", 401);

  const result = await authenticateToken(token, "admin");
  if (!result.ok) {
    if (result.reason === "wrong_type") throw new AdminAuthError("无权访问管理端", 403);
    if (result.reason === "not_found") throw new AdminAuthError("用户不存在", 401);
    if (result.reason === "disabled") throw new AdminAuthError("账号已被禁用或删除", 403);
    if (result.reason === "revoked") throw new AdminAuthError("登录已失效，请重新登录", 401);
    throw new AdminAuthError("未登录或登录已过期", 401);
  }

  // expect 已在判定里挡下其它类型，这里只是让 TS 收窄
  const { user } = result;
  if (user.type !== "admin") throw new AdminAuthError("无权访问管理端", 403);

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      userType: "admin",
      isRoot: user.isRoot,
    },
    rolePermissions: user.rolePermissions,
  };
}
