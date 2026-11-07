/**
 * 会话令牌 → 用户：验签、查用户、比对令牌版本。**这是唯一的判定实现**。
 *
 * 三件事缺一不可，任一处放宽就等于放过一个已被撤销的会话：
 * 1. 签名与结构有效；
 * 2. 用户仍存在且未被停用（令牌没过期也不该放行已删除 / 已禁用的账号）；
 * 3. 令牌版本与用户表一致（改密 / 被重置 / 登出会自增版本）。
 *
 * 调用方（页面请求中间件、Bearer 守卫、ingress 准入、模型端点）各自把入口形态适配成 `Headers`
 * 或令牌，再把失败原因映射成自己的状态码与文案——判定不再跟着入口复制。
 */
import { getAdminUserForAuth } from "#/services/admin-auth/admin-auth.server";
import { getClientUserForAuth } from "#/services/client-auth/client-auth.server";
import { parseBearerToken } from "#/shared-services/auth/bearer";
import { readSessionToken } from "#/shared-services/auth/session-cookie";
import { jwt } from "#/shared-services/jwt";

/** 管理端用户的鉴权结果：权限码与 isRoot 随表一起给出，管理端守卫据此判权限 */
export type AuthedAdmin = {
  type: "admin";
  id: string;
  username: string;
  email: string;
  isRoot: boolean;
  rolePermissions: string[];
};

/** 客户端用户的鉴权结果 */
export type AuthedClient = {
  type: "client";
  id: string;
  username: string;
  email: string;
  rolePermissions: string[];
};

export type AuthedUser = AuthedAdmin | AuthedClient;

/**
 * 失败原因：调用方据此决定回 401 还是 403、文案说「未登录」还是「账号已禁用」。
 * - `invalid`：没有令牌、验签失败、载荷结构不符；
 * - `not_found`：用户已被删除；
 * - `disabled`：账号被禁用；
 * - `revoked`：令牌版本落后（改密 / 被重置 / 登出）；
 * - `wrong_type`：令牌身份类型与入口期望不符（客户端令牌进管理端守卫）。
 */
export type TokenAuthFailure = "invalid" | "not_found" | "disabled" | "revoked" | "wrong_type";

export type TokenAuthResult =
  | { ok: true; user: AuthedUser }
  | { ok: false; reason: TokenAuthFailure };

/**
 * 校验一个会话令牌。
 *
 * @param token - 令牌明文（不含 `Bearer ` 前缀）。
 * @param expect - 期望的身份类型。给了就在查库**之前**判定，「客户端令牌进管理端守卫」不该去查客户端表。
 * @returns 判别结果；未预料的异常（如查库失败）照抛，由调用方决定怎么处理。
 */
export const authenticateToken = async (
  token: string | undefined,
  expect?: AuthedUser["type"],
): Promise<TokenAuthResult> => {
  if (!token) return { ok: false, reason: "invalid" };

  const payload = await jwt.verifyToken(token);
  if (!payload) return { ok: false, reason: "invalid" };
  if (expect && payload.userType !== expect) return { ok: false, reason: "wrong_type" };

  if (payload.userType === "admin") {
    const found = await getAdminUserForAuth(payload.userId);
    if (!found.success) return { ok: false, reason: found.reason };
    if (found.tokenVersion !== payload.v) return { ok: false, reason: "revoked" };
    return {
      ok: true,
      user: {
        type: "admin",
        id: found.id,
        username: found.username,
        email: found.email,
        isRoot: found.isRoot,
        rolePermissions: found.rolePermissions,
      },
    };
  }

  const found = await getClientUserForAuth(payload.userId);
  if (!found.success) return { ok: false, reason: found.reason };
  if (found.tokenVersion !== payload.v) return { ok: false, reason: "revoked" };
  return {
    ok: true,
    user: {
      type: "client",
      id: found.id,
      username: found.username,
      email: found.email,
      rolePermissions: found.rolePermissions,
    },
  };
};

/**
 * 从请求头里解出调用方：`Authorization: Bearer` 优先，其次管理端 / 客户端会话 Cookie。
 * ingress 用这一条（浏览器与外部客户端都从同一个门进来）；取不到或不可用返回 null。
 *
 * @param headers - 请求头。
 * @returns 可用用户，否则 null。
 */
export const authenticateHeaders = async (headers: Headers): Promise<AuthedUser | null> => {
  const token =
    parseBearerToken(headers.get("authorization")) ?? readSessionToken(headers.get("cookie"));
  if (!token) return null;
  const result = await authenticateToken(token);
  return result.ok ? result.user : null;
};
