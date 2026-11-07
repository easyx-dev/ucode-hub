/**
 * Bearer 令牌解析：从 `Authorization` 头里取出令牌的明文（不校验签名、不查库）。
 *
 * 单点定义的理由是边界语义：`Bearer a b` 这种带多余段的写法必须一致地判为无效——
 * 宽松版本会把它当成令牌 `"a b"` 去查库，等于在凭证解析这一步放宽了校验。
 * 校验与身份解析在 `app/src/middleware/bearer-auth.ts`（页面面）与应用各域的 auth 模块（设备面）。
 */

/**
 * 取出 Bearer 令牌：缺失、方案不是 Bearer、只有方案没令牌、令牌后还有多余段，都返回 null。
 *
 * @param header - `Authorization` 头的原值。
 * @returns 令牌明文，写法不符即 null。
 */
export const parseBearerToken = (header: string | null | undefined): string | null => {
  if (!header) return null;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) return null;
  return token;
};
