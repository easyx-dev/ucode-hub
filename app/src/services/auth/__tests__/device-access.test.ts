/** 设备归属判定：管理端可访问任意设备，客户端用户只能是属主 */
import { describe, expect, it } from "vitest";

import { canAccessDevice } from "../device-access";

const ownedByClient = { ownerType: "client" as const, ownerId: "user-1" };

describe("canAccessDevice", () => {
  it("客户端用户只能访问自己的设备", () => {
    expect(canAccessDevice(ownedByClient, { type: "client", id: "user-1" })).toBe(true);
    expect(canAccessDevice(ownedByClient, { type: "client", id: "user-2" })).toBe(false);
    expect(
      canAccessDevice(
        { ownerType: "admin", ownerId: "admin-9" },
        { type: "client", id: "admin-9" },
      ),
    ).toBe(false);
  });

  it("管理端账号可访问任意设备", () => {
    expect(canAccessDevice(ownedByClient, { type: "admin", id: "admin-1" })).toBe(true);
  });
});
