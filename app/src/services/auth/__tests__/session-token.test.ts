/**
 * 会话令牌判定：这是页面中间件、Bearer 守卫、ingress 准入、模型端点共用的唯一实现。
 * 四类失败原因要能区分（调用方据此回 401 或 403），其中「令牌版本落后」是安全边界。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyToken, mockGetAdminUserForAuth, mockGetClientUserForAuth } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockGetAdminUserForAuth: vi.fn(),
  mockGetClientUserForAuth: vi.fn(),
}));

vi.mock("#/shared-services/jwt", () => ({ jwt: { verifyToken: mockVerifyToken } }));
vi.mock("#/services/admin-auth/admin-auth.server", () => ({
  getAdminUserForAuth: mockGetAdminUserForAuth,
}));
vi.mock("#/services/client-auth/client-auth.server", () => ({
  getClientUserForAuth: mockGetClientUserForAuth,
}));

import { authenticateHeaders, authenticateToken } from "../session-token.server";

const payload = (userType: "admin" | "client", v: number) => ({
  userId: "u1",
  username: "owner",
  userType,
  v,
});

const adminRow = (tokenVersion: number) => ({
  success: true,
  id: "u1",
  username: "owner",
  email: "owner@example.com",
  isRoot: true,
  tokenVersion,
  rolePermissions: ["admin:read"],
});

const clientRow = (tokenVersion: number) => ({
  success: true,
  id: "u1",
  username: "owner",
  email: "owner@example.com",
  tokenVersion,
  rolePermissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticateToken", () => {
  it("无令牌与验签失败都是 invalid", async () => {
    expect(await authenticateToken(undefined)).toEqual({ ok: false, reason: "invalid" });
    mockVerifyToken.mockResolvedValue(null);
    expect(await authenticateToken("bad")).toEqual({ ok: false, reason: "invalid" });
  });

  it("管理端：放行时带 isRoot 与权限码", async () => {
    mockVerifyToken.mockResolvedValue(payload("admin", 3));
    mockGetAdminUserForAuth.mockResolvedValue(adminRow(3));

    const result = await authenticateToken("tok");
    expect(result).toEqual({
      ok: true,
      user: {
        type: "admin",
        id: "u1",
        username: "owner",
        email: "owner@example.com",
        isRoot: true,
        rolePermissions: ["admin:read"],
      },
    });
  });

  it("客户端：放行时带权限码", async () => {
    mockVerifyToken.mockResolvedValue(payload("client", 1));
    mockGetClientUserForAuth.mockResolvedValue(clientRow(1));

    const result = await authenticateToken("tok");
    expect(result).toEqual({
      ok: true,
      user: {
        type: "client",
        id: "u1",
        username: "owner",
        email: "owner@example.com",
        rolePermissions: [],
      },
    });
  });

  it("令牌版本落后即 revoked（登出 / 改密 / 被重置）", async () => {
    mockVerifyToken.mockResolvedValue(payload("admin", 2));
    mockGetAdminUserForAuth.mockResolvedValue(adminRow(3));
    expect(await authenticateToken("tok")).toEqual({ ok: false, reason: "revoked" });

    mockVerifyToken.mockResolvedValue(payload("client", 2));
    mockGetClientUserForAuth.mockResolvedValue(clientRow(3));
    expect(await authenticateToken("tok")).toEqual({ ok: false, reason: "revoked" });
  });

  it("身份类型不符在查库之前就挡下（客户端令牌进管理端守卫）", async () => {
    mockVerifyToken.mockResolvedValue(payload("client", 1));
    expect(await authenticateToken("tok", "admin")).toEqual({ ok: false, reason: "wrong_type" });
    expect(mockGetClientUserForAuth).not.toHaveBeenCalled();
    expect(mockGetAdminUserForAuth).not.toHaveBeenCalled();
  });

  it("用户不存在与已禁用分别给出 not_found / disabled", async () => {
    mockVerifyToken.mockResolvedValue(payload("admin", 1));
    mockGetAdminUserForAuth.mockResolvedValue({ success: false, reason: "not_found" });
    expect(await authenticateToken("tok")).toEqual({ ok: false, reason: "not_found" });

    mockVerifyToken.mockResolvedValue(payload("client", 1));
    mockGetClientUserForAuth.mockResolvedValue({ success: false, reason: "disabled" });
    expect(await authenticateToken("tok")).toEqual({ ok: false, reason: "disabled" });
  });
});

describe("authenticateHeaders", () => {
  it("Bearer 优先，其次会话 Cookie", async () => {
    mockVerifyToken.mockResolvedValue(payload("client", 1));
    mockGetClientUserForAuth.mockResolvedValue(clientRow(1));

    expect(await authenticateHeaders(new Headers({ authorization: "Bearer tok" }))).toMatchObject({
      type: "client",
    });
    expect(
      await authenticateHeaders(new Headers({ cookie: "hub_client_token=tok" })),
    ).toMatchObject({ type: "client" });
    expect(await authenticateHeaders(new Headers())).toBeNull();
  });

  it("令牌不可用时返回 null（不区分原因，入口统一 401）", async () => {
    mockVerifyToken.mockResolvedValue(payload("client", 1));
    mockGetClientUserForAuth.mockResolvedValue(clientRow(2));
    expect(await authenticateHeaders(new Headers({ authorization: "Bearer tok" }))).toBeNull();
  });
});
