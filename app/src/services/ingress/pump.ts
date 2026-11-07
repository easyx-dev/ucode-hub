/**
 * 请求体 → 隧道请求体帧的泵：边读边送，每块等写队列（背压由分发侧给出）。
 *
 * 从 ingress 中间件里提出来的原因是「同一职责一半在这里、一半在响应桥（`exchange.ts`）」：
 * 两边都是流泵，放在一起才能看出「请求体不缓冲、响应体也不缓冲」是同一个约束。
 */
import { chunkPayload, MAX_FRAME_PAYLOAD } from "@ucode/hub-protocol";

import { logger } from "#/shared-services/logger";

import type { StreamDispatcherPort } from "./stream-port";

/** 不再读上传时的收尾：取消读锁，让运行时把公网侧的上传流收掉（已出错或已结束就忽略） */
const cancelReader = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> => {
  try {
    await reader.cancel();
  } catch {
    // 流已经出错 / 已结束，没有可取消的东西
  }
};

/**
 * 逐块转发请求体：每块等写队列（背压），流已收尾就不再继续读——不整包缓冲。
 *
 * @param body - 公网侧的请求体流。
 * @param dispatcher - 该隧道的多路复用器。
 * @param streamId - 这条请求的流号。
 */
export const pumpRequestBody = async (
  body: ReadableStream<Uint8Array>,
  dispatcher: StreamDispatcherPort,
  streamId: number,
): Promise<void> => {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const chunk of chunkPayload(value, MAX_FRAME_PAYLOAD)) {
        const alive = await dispatcher.sendRequestBody(streamId, chunk);
        if (alive) continue;
        // 对端已回包或该流已收尾：不再接着读上传，让公网侧的上传失败得早一点
        await cancelReader(reader);
        return;
      }
    }
    dispatcher.endRequest(streamId);
  } catch (error) {
    logger.debug(
      { streamId, error: error instanceof Error ? error.message : String(error) },
      "请求体转发中断，取消该流",
    );
    dispatcher.abortStream(streamId, "请求体转发中断");
    await cancelReader(reader);
  }
};
