/**
 * 隧道票据：控制面签发、数据面只验签。
 *
 * 两条硬要求守在这里：
 * 1. 用户会话 JWT **不能**当票据用（载荷结构不同，互不冒充）；
 * 2. 票据过期 / 被篡改一律无效——它是隧道唯一的准入凭据。
 */
import { describe, expect, it } from "vitest";
import { jwt } from "#/shared-services/jwt";
import { issueTunnelTicket, verifyTunnelTicket } from "../tunnel-ticket.server";

describe("tunnel-ticket", () => {
  it("签发后能验回设备 id，并给出过期时刻", async () => {
    const issued = await issueTunnelTicket("device-1");

    expect(await verifyTunnelTicket(issued.ticket)).toBe("device-1");
    expect(Number.isNaN(Date.parse(issued.expiresAt))).toBe(false);
    expect(Date.parse(issued.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("用户会话 JWT 不能冒充票据", async () => {
    const sessionToken = await jwt.signToken({
      userId: "user-1",
      username: "owner",
      userType: "admin",
      v: 0,
    });

    expect(await verifyTunnelTicket(sessionToken)).toBeNull();
  });

  it("空值、乱串、被篡改的票据都返回 null", async () => {
    expect(await verifyTunnelTicket(null)).toBeNull();
    expect(await verifyTunnelTicket(undefined)).toBeNull();
    expect(await verifyTunnelTicket("")).toBeNull();
    expect(await verifyTunnelTicket("not-a-token")).toBeNull();

    const issued = await issueTunnelTicket("device-1");
    const [header, , signature] = issued.ticket.split(".");
    const tampered = `${header}.${Buffer.from(JSON.stringify({ kind: "tunnel-ticket", deviceId: "other" })).toString("base64url")}.${signature}`;
    expect(await verifyTunnelTicket(tampered)).toBeNull();
  });
});
