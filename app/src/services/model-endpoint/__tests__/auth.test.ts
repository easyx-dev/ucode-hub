/**
 * 模型端点鉴权测试：令牌形态分流、设备判定、用户判定。
 *
 * 判定本体已下沉到服务层（`session-token` / `device.auth`），这里验的是模型端点这层的两件事：
 * 按令牌形态分流（JWT 三段 vs 设备令牌），以及把两种身份折成「记到哪个账号」。
 */
import { describe, expect, it, vi } from "vitest";

import {
  type CallerDevice,
  isJwtShaped,
  type ModelEndpointAuthDeps,
  resolveModelEndpointCaller,
} from "../auth";

/** 构造鉴权依赖替身：默认「设备不可用、会话令牌无效」 */
function createDeps(overrides: Partial<ModelEndpointAuthDeps> = {}): ModelEndpointAuthDeps {
  return {
    authorizeDeviceToken: vi.fn(async () => null),
    authenticateToken: vi.fn(async () => ({ ok: false as const })),
    ...overrides,
  };
}

const activeDevice: CallerDevice = {
  id: "11111111-1111-1111-1111-111111111111",
  ownerType: "client",
  ownerId: "22222222-2222-2222-2222-222222222222",
};

/** 有效 JWT（三段形态即可，签名由依赖替身决定） */
const jwtToken = "header.payload.signature";

describe("isJwtShaped", () => {
  it("恰有三段的令牌视为 JWT", () => {
    expect(isJwtShaped(jwtToken)).toBe(true);
  });

  it("设备令牌（base64url，无点）不是 JWT", () => {
    expect(isJwtShaped("AbCd-_1234")).toBe(false);
  });

  it("两段或四段都不按 JWT 处理", () => {
    expect(isJwtShaped("a.b")).toBe(false);
    expect(isJwtShaped("a.b.c.d")).toBe(false);
  });
});

describe("resolveModelEndpointCaller", () => {
  it("缺少 Authorization 时返回 null 且不查任何身份", async () => {
    const deps = createDeps();
    expect(await resolveModelEndpointCaller(null, deps)).toBeNull();
    expect(deps.authorizeDeviceToken).not.toHaveBeenCalled();
    expect(deps.authenticateToken).not.toHaveBeenCalled();
  });

  it("非 Bearer 方案不认", async () => {
    const deps = createDeps();
    expect(await resolveModelEndpointCaller("Basic abc", deps)).toBeNull();
    expect(deps.authorizeDeviceToken).not.toHaveBeenCalled();
  });

  it("设备令牌记设备属主，并带上设备 id", async () => {
    const deps = createDeps({ authorizeDeviceToken: vi.fn(async () => activeDevice) });
    const caller = await resolveModelEndpointCaller("Bearer device-token", deps);

    expect(caller).toEqual({
      accountType: "client",
      accountId: activeDevice.ownerId,
      deviceId: activeDevice.id,
      kind: "device",
    });
    expect(deps.authenticateToken).not.toHaveBeenCalled();
  });

  it("设备令牌不可用时返回 null（吊销与不存在同判定）", async () => {
    expect(await resolveModelEndpointCaller("Bearer nope", createDeps())).toBeNull();
  });

  it("JWT 形态的令牌不走设备查询，按用户身份解析", async () => {
    const deps = createDeps({
      authenticateToken: vi.fn(async () => ({
        ok: true as const,
        user: { type: "admin" as const, id: "33333333-3333-3333-3333-333333333333" },
      })),
    });

    const caller = await resolveModelEndpointCaller(`Bearer ${jwtToken}`, deps);

    // accountId 取服务层返回的权威 id，而不是令牌自述的 userId
    expect(caller).toEqual({
      accountType: "admin",
      accountId: "33333333-3333-3333-3333-333333333333",
      deviceId: null,
      kind: "user",
    });
    expect(deps.authorizeDeviceToken).not.toHaveBeenCalled();
  });

  it("会话令牌不可用（无效 / 已撤销）返回 null", async () => {
    expect(await resolveModelEndpointCaller(`Bearer ${jwtToken}`, createDeps())).toBeNull();
  });
});
