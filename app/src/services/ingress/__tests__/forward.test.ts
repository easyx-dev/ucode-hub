/**
 * 一条请求的 ingress 编排：限额拒绝、并发拒绝、首帧与响应体、多值响应头。
 *
 * 用真的分发器 + 假隧道出口（假 transport 录下帧、假设备主动回帧），所以断言的是
 * 「公网侧拿到什么」而不是内部调用顺序——414/431/429/502 这些回应此前只活在中间件里，
 * 没有一条用例能发现它们串了。
 */
import { MAX_CONCURRENT_STREAMS, MAX_HEADER_BYTES, TUNNEL_ERROR_CODES } from "@ucode/hub-protocol";
import { describe, expect, it } from "vitest";

import type { TunnelConnection } from "../../../../server/tunnel/connections";
import { createStreamDispatcher, type StreamDispatcher } from "../../../../server/tunnel/dispatch";
import { forwardToTunnel, type IngressForwardInput } from "../forward";

const DEVICE_ID = "3f1c9a2e-6b4d-4c8f-9a1b-2d3e4f5a6b7c";
const USER_ID = "user-1";

type Harness = {
  connection: TunnelConnection;
  dispatcher: StreamDispatcher;
  /** 让「设备侧」按顺序处理收到的帧（模拟异步回包） */
  drain: () => Promise<void>;
};

/** 假隧道：控制帧只记下来，设备侧由用例显式回帧 */
const createHarness = (): Harness => {
  const queued: (() => void | Promise<void>)[] = [];
  const dispatcher = createStreamDispatcher({
    transport: {
      sendControlFrame: (frame) => {
        queued.push(() => dispatcher.handleControlFrame(frame));
      },
      sendRequestBodyFrame: async (streamId, chunk) => {
        // 设备侧收到请求体：这里什么都不做，只为让泵能继续
        void streamId;
        void chunk;
      },
    },
    allocateStreamId: (() => {
      let last = 0;
      return () => (last += 1);
    })(),
  });

  return {
    connection: {
      deviceId: DEVICE_ID,
      connectionId: "conn-1",
      openedAt: Date.now(),
      dispatcher,
      sendNotice: () => undefined,
      close: () => undefined,
    },
    dispatcher,
    async drain() {
      for (;;) {
        const next = queued.shift();
        if (!next) return;
        await next();
      }
    },
  };
};

const input = (over: Partial<IngressForwardInput> = {}): IngressForwardInput => ({
  deviceId: DEVICE_ID,
  userId: USER_ID,
  basePath: "/d/" + DEVICE_ID,
  method: "GET",
  path: "/api/v1/health",
  headers: new Headers({ accept: "application/json" }),
  body: null,
  signal: new AbortController().signal,
  connection: createHarness().connection,
  ...over,
});

describe("forwardToTunnel 的拒绝口径", () => {
  it("路径过长回 414，不建流", async () => {
    const harness = createHarness();
    const response = await forwardToTunnel(
      input({ connection: harness.connection, path: `/${"a".repeat(5000)}` }),
    );
    expect(response.status).toBe(414);
    expect(harness.dispatcher.pendingStreamCount()).toBe(0);
  });

  it("请求头过大回 431", async () => {
    const headers = new Headers({ "x-big": "a".repeat(MAX_HEADER_BYTES) });
    const harness = createHarness();
    const response = await forwardToTunnel(input({ connection: harness.connection, headers }));
    expect(response.status).toBe(431);
    expect(await response.json()).toMatchObject({ error: "请求头过大" });
  });

  it("并发超限回 429 并带 tunnel_busy", async () => {
    const harness = createHarness();
    for (let index = 0; index < MAX_CONCURRENT_STREAMS; index += 1) {
      harness.dispatcher.openStream(
        { method: "GET", path: "/held", headers: {}, hasBody: false },
        {
          onResponse: () => undefined,
          onBody: () => undefined,
          onEnd: () => undefined,
          onError: () => undefined,
        },
      );
    }
    const response = await forwardToTunnel(input({ connection: harness.connection }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "设备繁忙，请稍后再试",
      code: TUNNEL_ERROR_CODES.tunnelBusy,
    });
  });
});

describe("forwardToTunnel 的响应", () => {
  it("设备回 200 时把状态、头与响应体交回公网侧（多值头保真）", async () => {
    const harness = createHarness();
    const pending = forwardToTunnel(input({ connection: harness.connection }));

    // 新 harness 的第一条流：流号从 1 起
    const streamId = 1;
    await harness.dispatcher.handleControlFrame({
      t: "response",
      id: streamId,
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": ["a=1; Path=/", "b=2; Path=/"],
      },
    });
    await harness.dispatcher.handleDataFrame({
      kind: 1,
      streamId,
      payload: new TextEncoder().encode('{"ok":true}'),
    });
    await harness.dispatcher.handleControlFrame({ t: "responseEnd", id: streamId });

    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
    expect(await response.text()).toBe('{"ok":true}');
  });

  it("设备侧失败时回 502 并带它的错误码", async () => {
    const harness = createHarness();
    const pending = forwardToTunnel(input({ connection: harness.connection }));

    // 新 harness 的第一条流：流号从 1 起
    await harness.dispatcher.handleControlFrame({
      t: "error",
      id: 1,
      code: TUNNEL_ERROR_CODES.localUnreachable,
      message: "本机服务不可达",
    });

    const response = await pending;
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: TUNNEL_ERROR_CODES.localUnreachable });
  });
});
