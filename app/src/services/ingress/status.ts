/**
 * ingress 的拒绝口径：HTTP 状态码与 WebSocket 关闭码是同一语义的两个投影，收在一处。
 *
 * 以前它们散在中间件、WS route、准入三处，文档跟着错了一处（把 414/431 写成 429）。收成表之后，
 * 「哪种失败回什么」只有一处可查，文档也只指向这张表。
 */
import { TUNNEL_ERROR_CODES } from "@ucode/hub-protocol";

/** 一次 ingress 拒绝：`status` 是 HTTP 状态码，`error` 是给人看的中文，`code` 供调用方分流 */
export type IngressRejection = {
  status: number;
  error: string;
  code?: string;
};

/** HTTP 侧的拒绝表 */
export const INGRESS_REJECTIONS = {
  unauthorized: { status: 401, error: "未认证或凭证无效" },
  deviceNotFound: { status: 404, error: "设备不存在或已被删除" },
  upgradeUnsupported: { status: 501, error: "子域寻址暂不支持经中继的 WebSocket 升级" },
  pathTooLong: { status: 414, error: "请求路径过长" },
  headersTooLarge: { status: 431, error: "请求头过大" },
  deviceOffline: {
    status: 502,
    error: "设备未连接",
    code: TUNNEL_ERROR_CODES.deviceOffline,
  },
  tunnelBusy: { status: 429, error: "设备繁忙，请稍后再试", code: TUNNEL_ERROR_CODES.tunnelBusy },
  forwardFailed: { status: 502, error: "隧道请求失败" },
  invalidStatus: {
    status: 502,
    error: "隧道返回了不可用的状态码",
    code: TUNNEL_ERROR_CODES.invalidStatus,
  },
} satisfies Record<string, IngressRejection>;

/**
 * 公网侧已断开：499 只是留下可读的服务端记录（与 nginx 同口径），
 * 这个响应发不出去，不当它是失败向上报。
 */
export const CLIENT_CLOSED_STATUS = 499;

/** 路径寻址缺尾斜杠时的纠正状态码：308 保留方法与请求体 */
export const CANONICAL_REDIRECT_STATUS = 308;
