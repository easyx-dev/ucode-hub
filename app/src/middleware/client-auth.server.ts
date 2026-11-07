/**
 * 客户端鉴权（仅服务端）：把「令牌 → 客户端上下文」的失败原因映射成 ClientAuthError。
 *
 * 判定本体与 `admin-auth.server` 共用一份（`services/auth/session-token.server`），
 * 这里只负责客户端口径：无令牌是「请先登录」，身份不符与无效令牌都算「无效的用户身份」。
 */
import { type ClientAuthContext, ClientAuthError } from "#/middleware/client-auth";
import { authenticateToken } from "#/services/auth/session-token.server";

/**
 * 校验令牌并返回客户端上下文。
 *
 * @param token - 会话令牌（由中间件从 Cookie 里取出）。
 * @returns 客户端上下文（含权限码）。
 */
export async function resolveClientAuthContext(
  token: string | undefined,
): Promise<ClientAuthContext> {
  if (!token) throw new ClientAuthError("请先登录", 401);

  const result = await authenticateToken(token, "client");
  if (!result.ok) {
    if (result.reason === "not_found") throw new ClientAuthError("用户不存在", 401);
    if (result.reason === "disabled") throw new ClientAuthError("账号已被禁用", 403);
    if (result.reason === "revoked") throw new ClientAuthError("登录已失效，请重新登录", 401);
    throw new ClientAuthError("无效的用户身份", 401);
  }

  // expect 已在判定里挡下其它类型，这里只是让 TS 收窄
  const { user } = result;
  if (user.type !== "client") throw new ClientAuthError("无效的用户身份", 401);

  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    rolePermissions: user.rolePermissions,
  };
}
