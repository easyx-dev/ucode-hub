/**
 * 从 Cookie 头里取会话令牌：管理端与客户端两种登录态都认（先管理端）。
 *
 * 单点定义的理由与 `bearer.ts` 相同：入口有三处（页面请求中间件、ingress HTTP 回灌、
 * ingress WS 升级），Cookie 的解析口径只能有一份，否则「带空值」「同名多份」这类边界会分叉。
 */
import { COOKIE_NAMES } from "#/constants/cookie-names";

const readCookie = (cookieHeader: string, name: string): string | null => {
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value ? value : null;
  }
  return null;
};

/**
 * 取会话令牌：管理端优先，其次客户端；都没有（或值为空）返回 null。
 *
 * @param cookieHeader - `Cookie` 头的原值。
 * @returns 令牌明文，取不到即 null。
 */
export const readSessionToken = (cookieHeader: string | null | undefined): string | null => {
  if (!cookieHeader) return null;
  return (
    readCookie(cookieHeader, COOKIE_NAMES.ADMIN_TOKEN) ??
    readCookie(cookieHeader, COOKIE_NAMES.CLIENT_TOKEN)
  );
};
