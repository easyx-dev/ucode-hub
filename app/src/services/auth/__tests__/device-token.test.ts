/** 设备令牌判定：内置资产、模型端点、换隧道票据三个入口共用的唯一实现 */
import { describe, expect, it, vi } from "vitest";

const { mockFindDeviceByToken } = vi.hoisted(() => ({ mockFindDeviceByToken: vi.fn() }));

vi.mock("#/services/device/device.server", () => ({
  findDeviceByToken: mockFindDeviceByToken,
}));

import { authorizeDeviceHeaders, authorizeDeviceToken } from "../device-token.server";

const active = { id: "d1", status: "active", ownerType: "client", ownerId: "u1" };

describe("authorizeDeviceToken", () => {
  it("没有令牌不查库", async () => {
    mockFindDeviceByToken.mockClear();
    expect(await authorizeDeviceToken(undefined)).toBeNull();
    expect(await authorizeDeviceToken(null)).toBeNull();
    expect(await authorizeDeviceToken("")).toBeNull();
    expect(mockFindDeviceByToken).not.toHaveBeenCalled();
  });

  it("只有 active 放行；吊销、软删（查不到）都返回 null", async () => {
    mockFindDeviceByToken.mockResolvedValueOnce(active);
    expect(await authorizeDeviceToken("tok")).toMatchObject({ id: "d1" });

    mockFindDeviceByToken.mockResolvedValueOnce({ ...active, status: "revoked" });
    expect(await authorizeDeviceToken("tok")).toBeNull();

    mockFindDeviceByToken.mockResolvedValueOnce(null);
    expect(await authorizeDeviceToken("tok")).toBeNull();
  });
});

describe("authorizeDeviceHeaders", () => {
  it("从 Authorization 头取令牌（方案大小写不敏感）", async () => {
    mockFindDeviceByToken.mockResolvedValue(active);

    expect(
      await authorizeDeviceHeaders(new Headers({ authorization: "Bearer tok" })),
    ).toMatchObject({ id: "d1" });
    expect(
      await authorizeDeviceHeaders(new Headers({ authorization: "bearer tok" })),
    ).toMatchObject({ id: "d1" });
    expect(await authorizeDeviceHeaders(new Headers())).toBeNull();
  });
});
