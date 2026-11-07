/**
 * ingress 的调用方身份解析：三条判定缺一不可——签名、用户可用、令牌版本一致。
 * 版本比对是安全边界（登出 / 改密后旧令牌不得再打穿到设备），单独立用例守住。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/shared-services/jwt", () => ({ jwt: { verifyToken: vi.fn() } }));
vi.mock("#/services/admin-auth/admin-auth.server", () => ({ getAdminUserForAuth: vi.fn() }));
vi.mock("#/services/client-auth/client-auth.server", () => ({ getClientUserForAuth: vi.fn() }));

import { getAdminUserForAuth } from "#/services/admin-auth/admin-auth.server";
import { getClientUserForAuth } from "#/services/client-auth/client-auth.server";
import { jwt } from "#/shared-services/jwt";

import { resolveIngressUser } from "../admission";

const verifyToken = vi.mocked(jwt.verifyToken);
const adminUser = vi.mocked(getAdminUserForAuth);
const clientUser = vi.mocked(getClientUserForAuth);

const bearer = (token: string): Headers => new Headers({ authorization: `Bearer ${token}` });

const payload = (userType: "admin" | "client", v: number) => ({
  userId: "user-1",
  username: "owner",
  userType,
  v,
});

const foundAdmin = (tokenVersion: number) => ({
  success: true as const,
  id: "user-1",
  username: "owner",
  email: "owner@example.com",
  isRoot: true,
  tokenVersion,
  rolePermissions: [],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveIngressUser", () => {
  it("没有令牌或签名无效一律 null", async () => {
    expect(await resolveIngressUser(new Headers())).toBeNull();
    verifyToken.mockResolvedValue(null);
    expect(await resolveIngressUser(bearer("bad"))).toBeNull();
  });

  it("签名有效、版本一致：放行", async () => {
    verifyToken.mockResolvedValue(payload("admin", 3));
    adminUser.mockResolvedValue(foundAdmin(3));
    expect(await resolveIngressUser(bearer("token"))).toEqual({ type: "admin", id: "user-1" });
  });

  it("令牌版本已推进（登出 / 改密 / 被重置）:拒绝", async () => {
    verifyToken.mockResolvedValue(payload("admin", 2));
    adminUser.mockResolvedValue(foundAdmin(3));
    expect(await resolveIngressUser(bearer("token"))).toBeNull();
  });

  it("账号已停用:拒绝", async () => {
    verifyToken.mockResolvedValue(payload("client", 1));
    clientUser.mockResolvedValue({ success: false, reason: "disabled" });
    expect(await resolveIngressUser(bearer("token"))).toBeNull();
  });

  it("客户端账号同样比对令牌版本", async () => {
    verifyToken.mockResolvedValue(payload("client", 1));
    clientUser.mockResolvedValue({
      success: true,
      id: "user-1",
      username: "owner",
      email: "owner@example.com",
      tokenVersion: 2,
      rolePermissions: [],
    });
    expect(await resolveIngressUser(bearer("token"))).toBeNull();
  });
});
