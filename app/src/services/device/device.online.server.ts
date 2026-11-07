/**
 * 设备在线态与最近活跃时间：内存记账 + 供巡检落库的增量。
 *
 * **在线的事实源在数据面**（隧道注册表），业务不 import 它：由数据面在模块加载时注册
 * `DevicePresencePort`，业务只调 `isDeviceOnline` / `terminateDeviceTunnel`。
 * 方向是单向的（`server/` → 本模块），所以这张表也能在脱离 WS 的环境里单测。
 * 这里只镜像「当前连接标识」用于两件事：明确该设备已被接管 / 已下线，以及把最近活跃时间批量写进
 * `last_seen_at`。这样即使某处漏写这个镜像，也不会出现「界面显示在线但 ingress 回 502」。
 *
 * 挂 `globalThis` 是因为 dev / HMR / 产物分包下同一模块可能被求值多次，注册表必须是同一份。
 */
export type OnlineDeviceEntry = {
  deviceId: string;
  /**
   * 当前是否有一条连接（单连接语义：同一设备的新连接会接管旧的）。
   * `null` 表示已经离线，条目保留到巡检清理，好让最近活跃时间还能写下去。
   */
  connectionId: string | null;
  lastSeenAt: Date;
  /** 最后一次写库的时间；巡检据此只写增量 */
  flushedAt: Date | null;
};

/**
 * 数据面注册进来的两个能力：问「在不在」、把隧道断开（吊销设备时用）。
 * 业务不关心隧道怎么实现，只关心这两件事。
 */
export type DevicePresencePort = {
  isOnline(deviceId: string): boolean;
  /** 断开该设备的隧道（不存在则无操作） */
  terminate(deviceId: string): void;
};

const PRESENCE_KEY = "__hubDevicePresence";

const globalWithPresence = globalThis as typeof globalThis & {
  [PRESENCE_KEY]?: DevicePresencePort;
};

const REGISTRY_KEY = "__hubDeviceOnlineRegistry";

const globalWithRegistry = globalThis as typeof globalThis & {
  [REGISTRY_KEY]?: Map<string, OnlineDeviceEntry>;
};

const registry: Map<string, OnlineDeviceEntry> =
  globalWithRegistry[REGISTRY_KEY] ?? new Map<string, OnlineDeviceEntry>();
globalWithRegistry[REGISTRY_KEY] = registry;

/** 由数据面在模块加载时调用：把隧道注册表接到业务侧 */
export const registerDevicePresence = (port: DevicePresencePort): void => {
  globalWithPresence[PRESENCE_KEY] = port;
};

/** 该设备当前是否有活隧道（数据面未注册时按离线处理） */
export const isDeviceOnline = (deviceId: string): boolean =>
  globalWithPresence[PRESENCE_KEY]?.isOnline(deviceId) ?? false;

/** 断开该设备的隧道：吊销 / 删除设备时调用，避免「已吊销但隧道还连着」 */
export const terminateDeviceTunnel = (deviceId: string): void => {
  globalWithPresence[PRESENCE_KEY]?.terminate(deviceId);
};

/** 设备上线：记下这条连接并刷新最近活跃时间（新连接直接覆盖旧连接的标识） */
export const markDeviceOnline = (deviceId: string, connectionId: string): void => {
  const now = new Date();
  const existing = registry.get(deviceId);
  if (existing) {
    existing.connectionId = connectionId;
    existing.lastSeenAt = now;
    return;
  }
  registry.set(deviceId, { deviceId, connectionId, lastSeenAt: now, flushedAt: null });
};

/** 设备下线：只清掉自己那条连接，避免旧连接的收尾把接管它的新连接一起抹掉 */
export const markDeviceOffline = (deviceId: string, connectionId: string): void => {
  const entry = registry.get(deviceId);
  if (entry?.connectionId === connectionId) entry.connectionId = null;
};

/** 一次连接的活跃心跳：只刷新时间，不改连接标识 */
export const touchDeviceActivity = (deviceId: string, at: Date = new Date()): void => {
  const entry = registry.get(deviceId);
  if (entry) entry.lastSeenAt = at;
};

/**
 * 巡检取数：返回「最近活跃时间比上次写库新」的设备，并把写库时间推进到本次。
 * 调用方拿到结果后落库；不落库也不会重复取到同一份时间。
 */
export const takeLastSeenUpdates = (): Map<string, Date> => {
  const updates = new Map<string, Date>();
  for (const entry of registry.values()) {
    if (entry.flushedAt && entry.flushedAt >= entry.lastSeenAt) continue;
    updates.set(entry.deviceId, entry.lastSeenAt);
    entry.flushedAt = new Date();
  }
  return updates;
};

/** 巡检清理：丢弃「早已离线且活跃时间已落库」的条目，避免注册表无限增长 */
export const pruneIdleDevices = (maxIdleMs: number, now: Date = new Date()): string[] => {
  const dropped: string[] = [];
  for (const [deviceId, entry] of registry) {
    if (entry.connectionId !== null) continue;
    if (now.getTime() - entry.lastSeenAt.getTime() < maxIdleMs) continue;
    registry.delete(deviceId);
    dropped.push(deviceId);
  }
  return dropped;
};

/** 测试用：清空记账表 */
export const clearOnlineRegistry = (): void => {
  registry.clear();
};

/** 测试用：直接读一条记账（生产判定在线请用隧道注册表） */
export const readOnlineEntry = (deviceId: string): OnlineDeviceEntry | undefined =>
  registry.get(deviceId);
