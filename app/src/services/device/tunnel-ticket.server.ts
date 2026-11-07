/**
 * 隧道票据：设备用长期 `deviceToken` 换一张短期票据，隧道握手只认票据。
 *
 * 这是控制面与数据面的分界。分层之后：
 * - 签票要查库（设备是否仍在册、是否被吊销）——那是控制面的事；
 * - 握手只验签（`jwtVerify` + 载荷结构），不碰数据库、不碰任何业务服务。
 *
 * 因此 `server/tunnel/` 与隧道路由里不再出现 `device` 表查询。票据短时有效（5 分钟），
 * 只为「建立一条连接」用；连接建立后不再验票，吊销靠控制面主动断开（见 `device.presence`）。
 *
 * 与用户会话 JWT 共用 `JWT_SECRET` 但载荷不同（这里必有 `kind`，用户令牌必有 `userType`），
 * 所以两者不能互相冒充。
 */
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { env } from "#/env";
import { logger } from "#/shared-services/logger";

/** 票据有效期：够客户端完成一次握手即可，越短吊销生效越快 */
const TICKET_TTL_SECONDS = 5 * 60;

/** 票据载荷：`kind` 是它与用户会话令牌互不冒充的依据 */
const tunnelTicketSchema = z.object({
  kind: z.literal("tunnel-ticket"),
  deviceId: z.string().min(1),
});

export type TunnelTicket = z.infer<typeof tunnelTicketSchema>;

/** 一张待用的票据 */
export type IssuedTunnelTicket = {
  ticket: string;
  /** 过期时刻（ISO），客户端可据此提前续票 */
  expiresAt: string;
};

const key = (): Uint8Array => {
  if (!env.jwtSecret) throw new Error("环境变量 JWT_SECRET 未配置，无法签发票据");
  return new TextEncoder().encode(env.jwtSecret);
};

/**
 * 签一张隧道票据。
 *
 * @param deviceId - 已确认在册且未吊销的设备 id。
 * @returns 票据与过期时刻。
 */
export const issueTunnelTicket = async (deviceId: string): Promise<IssuedTunnelTicket> => {
  const expiresAt = new Date(Date.now() + TICKET_TTL_SECONDS * 1000);
  const ticket = await new SignJWT({ kind: "tunnel-ticket", deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key());
  return { ticket, expiresAt: expiresAt.toISOString() };
};

/**
 * 验一张隧道票据。
 *
 * @param token - 票据明文。
 * @returns 票据指向的设备 id；无效、过期或载荷不符返回 null。
 */
export const verifyTunnelTicket = async (
  token: string | null | undefined,
): Promise<string | null> => {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    const parsed = tunnelTicketSchema.safeParse(payload);
    if (!parsed.success) {
      logger.debug({ issues: parsed.error.issues.length }, "隧道票据载荷结构非法");
      return null;
    }
    return parsed.data.deviceId;
  } catch (error) {
    logger.debug({ error: (error as Error).message }, "隧道票据校验失败");
    return null;
  }
};
