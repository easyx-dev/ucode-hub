/**
 * 服务端 JSON 响应：封套（`{ error, code? }`）与固定头只在这里定义。
 *
 * 客户端按 `code` 分流，所以封套散落意味着改一处必漏一处——本仓曾有十余处手写，
 * 各处 `Content-Type` 大小写、`cache-control` 有无都不一致，其中握手 401 漏了 `no-store`
 * （凭证类的拒绝不该被中间层缓存）。
 */

/** 失败响应的固定头：不缓存 + 明确 JSON（中文文案，字符集要写出来） */
export const JSON_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

/**
 * 失败响应。
 *
 * @param status - HTTP 状态码。
 * @param error - 给人看的中文兜底文案。
 * @param code - 机器可读的错误码（取自协议词表或 `ERROR_CODES`）。
 * @returns 带封套的 JSON 响应。
 */
export const failJson = (status: number, error: string, code?: string): Response =>
  new Response(JSON.stringify(code ? { error, code } : { error }), {
    status,
    headers: JSON_HEADERS,
  });
