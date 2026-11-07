/**
 * 公网响应与隧道流之间的桥：把隧道发回的响应首帧、响应块、结束与失败落到一条 web 响应流上。
 *
 * 两段职责由两个模块承担：首帧收敛在 `head-gate.ts`，响应流与背压在 `response-stream.ts`；
 * 这里只做状态机（`finished` 只收敛一次）与两者的对接。
 */

import { createHeadGate, type HeadResult } from "./head-gate";
import { createResponseStream } from "./response-stream";
import type { StreamSink } from "./stream-port";

export type { HeadResult };

export type IngressExchange = {
  sink: StreamSink;
  stream: ReadableStream<Uint8Array>;
  waitHead(): Promise<HeadResult>;
  /** 放弃这条流（并发超限等还没真正开始的场景） */
  discard(): void;
};

/**
 * @param opts.signal - 公网请求的取消信号：连接断开时用它兜底取消隧道上的流。
 * @param opts.onAbort - 公网侧断开：取消隧道上对应的流（发 abort 让设备侧取消上游）。
 */
export const createIngressExchange = (opts: {
  signal: AbortSignal;
  onAbort: (reason: string) => void;
}): IngressExchange => {
  let finished = false;
  const head = createHeadGate();
  const response = createResponseStream((reason) => abort(reason));

  const onSignalAbort = (): void => abort("公网侧断开连接");
  opts.signal.addEventListener("abort", onSignalAbort, { once: true });

  function abort(reason: string): void {
    if (finished) return;
    finished = true;
    opts.signal.removeEventListener("abort", onSignalAbort);
    head.settle({ kind: "aborted" });
    opts.onAbort(reason);
  }

  /** 首次收尾返回 false（调用方继续走收尾），已收尾过返回 true（调用方直接返回） */
  const markFinished = (): boolean => {
    if (finished) return true;
    finished = true;
    opts.signal.removeEventListener("abort", onSignalAbort);
    return false;
  };

  return {
    stream: response.stream,
    waitHead: () => head.wait(),
    discard() {
      if (markFinished()) return;
      response.error(new Error("ingress 已放弃该流"));
    },
    sink: {
      onResponse(status, headers) {
        if (finished) return;
        head.settle({ kind: "head", status, headers });
      },
      async onBody(chunk) {
        if (finished) return;
        await response.enqueue(chunk);
      },
      onEnd() {
        if (markFinished()) return;
        response.close();
      },
      onError(failure) {
        if (markFinished()) return;
        // 头还没发出去：整条响应改成失败；头已发出：只能中断响应体，让调用方看到「被截断」
        if (!head.isSettled()) {
          head.settle({ kind: "failure", failure });
          return;
        }
        response.error(new Error(`${failure.code}：${failure.message}`));
      },
    },
  };
};
