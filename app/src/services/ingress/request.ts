/**
 * ingress 请求侧的纯逻辑：按 Host / 路径认设备、转发头构造。
 *
 * 这里**不做凭证判定**——身份与设备令牌各有一份实现（`services/auth/session-token.server` 与
 * `services/auth/device-token.server`），入口只把 `Headers` 递过去。本文件只负责「这条请求属于哪台
 * 设备」「转发时该带什么头」，给定字符串就能算出来，因此可脱框架单测。
 */
import type { HeaderMap } from "@ucode/hub-protocol";
import { DEVICE_ACCESS_PATH_PREFIX } from "#/constants/device";

/** 请求路径上限：与协议 `requestFrameSchema.path` 的 `.max(4096)` 对齐，超了连帧都装不下 */
export const MAX_INGRESS_PATH_LENGTH = 4096;

/** 设备 id 就是 uuid：子域标签只认它，别的形态（含多级子域）都不进 ingress */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 逐跳头（RFC 9110 §7.6.1）：只对单跳有意义。
 * 两个方向都不能透传——尤其 `transfer-encoding`，转发方自己会决定分块方式。
 */
const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

/**
 * 转发时必须剥掉的头：调用方凭证（hub 自己不转发身份，UCode 只认本机 serviceToken）、
 * Host（下游的 Host 由它自己决定）、逐跳头，以及来源地址（`forwarded` 家族只对 hub 这一跳有意义）。
 */
const STRIPPED_REQUEST_HEADERS = new Set([
  "cookie",
  "authorization",
  "host",
  "forwarded",
  ...HOP_BY_HOP_HEADERS,
]);

/** 注入的来源头：CC 里约定同名常量，hub 侧不依赖 UCode 的仓库，故写字面量并在此处收口 */
export const INGRESS_SOURCE_HEADER = "x-hub-source";
export const INGRESS_DEVICE_HEADER = "x-hub-device";
export const INGRESS_CLIENT_HEADER = "x-hub-client";

/**
 * 页面被挂在前缀下时告诉 UCode 前缀是什么（它据此改写 `index.html` 的 `<base href>`）。
 * 与来源头同理，hub 侧不依赖 UCode 的仓库，这里收口字面量。
 */
export const INGRESS_BASE_PATH_HEADER = "x-hub-base-path";

/** 隧道来源标记：UCode 侧只把它记进日志与统计，不参与鉴权 */
export const INGRESS_SOURCE_VALUE = "tunnel";

/**
 * 从 Host 里取出设备 id：要求 `设备 uuid.父域`，大小写不敏感、允许带端口。
 * 多级子域、非 uuid 标签、父域自身都返回 null——不匹配的请求照常落到 admin / 前台路由。
 */
export const parseDeviceHost = (
  host: string | null | undefined,
  baseDomain: string,
): string | null => {
  if (!host) return null;
  const hostname = (host.split(":")[0] ?? "").toLowerCase();
  const suffix = `.${baseDomain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  return UUID_PATTERN.test(label) ? label : null;
};

/**
 * 路径寻址的结果：设备 id、浏览器看到的前缀，以及剥掉前缀后要转发给 UCode 的路径。
 * `basePath` 不带尾斜杠，用于告诉 UCode 页面挂在哪（`<base href>`）。
 */
export type DevicePathMatch = {
  deviceId: string;
  basePath: string;
  rest: string;
};

/**
 * 从请求路径里取设备：`/d/<设备 id>` 与 `/d/<设备 id>/<其余>` 都认，其余返回 null（照常落 hub 路由）。
 * 不带尾斜杠时 `rest` 是 `/`——调用方应先重定向到带尾斜杠的地址，否则页面里的相对资源
 * 会以 `/d/` 为基准解析。
 */
export const parseDevicePath = (pathname: string): DevicePathMatch | null => {
  const prefix = `${DEVICE_ACCESS_PATH_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return null;

  const remainder = pathname.slice(prefix.length);
  const slash = remainder.indexOf("/");
  const label = (slash < 0 ? remainder : remainder.slice(0, slash)).toLowerCase();
  if (!UUID_PATTERN.test(label)) return null;

  return {
    deviceId: label,
    basePath: `${DEVICE_ACCESS_PATH_PREFIX}/${label}`,
    rest: slash < 0 ? "/" : remainder.slice(slash),
  };
};

/** 是否要求协议升级：v1 的隧道不支持承载 Upgrade（终端、内置浏览器面板不经 hub） */
export const isUpgradeRequest = (headers: Headers): boolean =>
  headers.get("upgrade")?.toLowerCase() === "websocket";

/** 构造转发给 UCode 的请求头：剥凭证 / Host / 逐跳头 / `forwarded` 与 `x-forwarded-*`，再注入来源头 */
export const buildIngressRequestHeaders = (
  headers: Headers,
  source: { deviceId: string; userId: string; basePath?: string | null },
): HeaderMap => {
  const forwarded: HeaderMap = {};
  for (const [name, value] of headers) {
    if (STRIPPED_REQUEST_HEADERS.has(name) || name.startsWith("x-forwarded-")) continue;
    forwarded[name] = value;
  }
  forwarded[INGRESS_SOURCE_HEADER] = INGRESS_SOURCE_VALUE;
  forwarded[INGRESS_DEVICE_HEADER] = source.deviceId;
  forwarded[INGRESS_CLIENT_HEADER] = source.userId;
  // 子域形态下页面就在 origin 根上，不需要告诉 UCode 前缀
  if (source.basePath) forwarded[INGRESS_BASE_PATH_HEADER] = source.basePath;
  return forwarded;
};

/**
 * 头表 → 可交给 `Response` 的 `Headers`：同名多值逐条 append。
 * 合成一条会把多条 `set-cookie` 并成一行，浏览器只会认出第一条、并把属性一起吞掉。
 */
export const toResponseHeaders = (headers: HeaderMap): Headers => {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    for (const one of Array.isArray(value) ? value : [value]) result.append(name, one);
  }
  return result;
};

/** 构造回给公网侧的头：逐跳头必须剥掉，其余（含 content-length / content-encoding）原样透传 */
export const buildIngressResponseHeaders = (headers: HeaderMap): HeaderMap => {
  const forwarded: HeaderMap = {};
  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.includes(name.toLowerCase())) continue;
    forwarded[name] = value;
  }
  return forwarded;
};

/**
 * 认设备：子域形态（配了父域时按 Host）优先，其次是单域名下的路径形态 `/d/<设备 id>`。
 * 两者都不匹配返回 null，请求照常落 admin / 前台路由。
 *
 * 纯函数入参（路径 + Host + 父域）是为了让两条入口（HTTP 中间件与 WS route）共用同一份解析，
 * 也让这段判定能脱框架单测。
 */
export const resolveIngressTarget = (
  pathname: string,
  host: string,
  baseDomain: string | null,
): { deviceId: string; basePath: string | null; restPath: string | null } | null => {
  if (baseDomain) {
    const deviceId = parseDeviceHost(host, baseDomain);
    if (deviceId) return { deviceId, basePath: null, restPath: null };
  }

  const match = parseDevicePath(pathname);
  if (!match) return null;
  return { deviceId: match.deviceId, basePath: match.basePath, restPath: match.rest };
};
