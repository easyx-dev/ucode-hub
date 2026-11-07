/**
 * 在线态端口：业务只问「在不在」「断开它」，数据面注册实现。
 * 注册前必须按离线处理（脱离数据面的进程不该假装有隧道）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearOnlineRegistry,
  isDeviceOnline,
  markDeviceOffline,
  markDeviceOnline,
  pruneIdleDevices,
  readOnlineEntry,
  registerDevicePresence,
  takeLastSeenUpdates,
  terminateDeviceTunnel,
  touchDeviceActivity,
} from "../device.online.server";

const presence = { isOnline: vi.fn(), terminate: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  clearOnlineRegistry();
  registerDevicePresence(presence);
});

describe("在线态端口", () => {
  it("在线判定交给数据面实现", () => {
    presence.isOnline.mockReturnValue(true);
    expect(isDeviceOnline("d1")).toBe(true);
    expect(vi.mocked(presence.isOnline)).toHaveBeenCalledWith("d1");
  });

  it("吊销时断开隧道也交给数据面", () => {
    terminateDeviceTunnel("d1");
    expect(vi.mocked(presence.terminate)).toHaveBeenCalledWith("d1");
  });
});

describe("最近活跃记账", () => {
  it("上线覆盖连接标识并刷新时间，下线只清自己那条", () => {
    markDeviceOnline("d1", "c1");
    expect(readOnlineEntry("d1")?.connectionId).toBe("c1");

    // 新连接接管后，旧连接的收尾不该把新连接一起抹掉
    markDeviceOnline("d1", "c2");
    markDeviceOffline("d1", "c1");
    expect(readOnlineEntry("d1")?.connectionId).toBe("c2");

    markDeviceOffline("d1", "c2");
    expect(readOnlineEntry("d1")?.connectionId).toBeNull();
  });

  it("只取增量：同一次活跃不会重复写库", () => {
    markDeviceOnline("d1", "c1");
    expect(takeLastSeenUpdates().has("d1")).toBe(true);
    expect(takeLastSeenUpdates().has("d1")).toBe(false);

    // 同一毫秒内 touch 不算「更新」，这里显式往前推一秒（写库判据是「比上次新」）
    touchDeviceActivity("d1", new Date(Date.now() + 1_000));
    expect(takeLastSeenUpdates().has("d1")).toBe(true);
  });

  it("离线且超过空闲阈值的条目被清掉，在线的不清", () => {
    markDeviceOnline("idle", "c1");
    markDeviceOffline("idle", "c1");
    markDeviceOnline("live", "c2");

    const dropped = pruneIdleDevices(0);
    expect(dropped).toEqual(["idle"]);
    expect(readOnlineEntry("live")).toBeDefined();
  });
});
