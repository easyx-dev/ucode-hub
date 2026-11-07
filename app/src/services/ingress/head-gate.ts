/**
 * 响应首帧的闸：等着「状态码与头」这一步收敛，并且只收敛一次。
 *
 * 首帧有三种结局，必须分开表达——不然「公网侧走了」会被当成隧道故障报上去。
 */
import type { HeaderMap } from "@ucode/hub-protocol";

import type { StreamFailure } from "./stream-port";

/**
 * 首帧响应的三种收敛：拿到状态码与头 / 隧道侧失败 / 公网侧已断开。
 * 「已断开」单独一态是为了不把「客户端走了」误报成隧道故障。
 */
export type HeadResult =
  | { kind: "head"; status: number; headers: HeaderMap }
  | { kind: "failure"; failure: StreamFailure }
  | { kind: "aborted" };

export type HeadGate = {
  /** 等首帧；未收敛前一直挂着 */
  wait(): Promise<HeadResult>;
  /** 收敛首帧；第二次调用无副作用 */
  settle(result: HeadResult): void;
  /** 已经收敛过？ */
  isSettled(): boolean;
};

export const createHeadGate = (): HeadGate => {
  let resolveHead: (result: HeadResult) => void = () => undefined;
  let settled = false;
  const head = new Promise<HeadResult>((resolve) => {
    resolveHead = resolve;
  });

  return {
    wait: () => head,
    settle(result) {
      if (settled) return;
      settled = true;
      resolveHead(result);
    },
    isSettled: () => settled,
  };
};
