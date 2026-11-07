/**
 * 把隧道的响应块接成一条 web 响应流，并让背压对上：消费端慢到队列压满高水位时，
 * `enqueue` 会挂住不返回——分发侧是串行的，于是隧道那侧的推帧随之停下，
 * hub 不会替慢客户端把整个响应当内存缓存。
 */
/** 公网侧响应流的队列高水位 */
const RESPONSE_QUEUE_HIGH_WATERMARK_BYTES = 4 * 1024 * 1024;

export type ResponseStream = {
  stream: ReadableStream<Uint8Array>;
  /** 入流；队列满时挂住直到消费端腾出余量 */
  enqueue(chunk: Uint8Array): Promise<void>;
  close(): void;
  error(reason: unknown): void;
  /** 公网侧已撤销（`cancel` 或多路取消） */
  isCancelled(): boolean;
};

/**
 * @param onCancel - 消费端撤销时的回调（带原因）。
 */
export const createResponseStream = (onCancel: (reason: string) => void): ResponseStream => {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let cancelled = false;
  /** pull 已请求数据、还没入流：入流后放行，让运行时重新评估余量 */
  let pullGate: (() => void) | null = null;
  /** 队列压满高水位，入流回调在此等消费端腾出余量（同时只能有一个等待者：分发是串行的） */
  let roomGate: (() => void) | null = null;

  const releaseRoom = (): void => {
    const gate = roomGate;
    roomGate = null;
    gate?.();
  };

  const stream = new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value;
      },
      pull() {
        if (roomGate) {
          releaseRoom();
          return undefined;
        }
        return new Promise<void>((resolve) => {
          pullGate = resolve;
        });
      },
      cancel(reason) {
        cancelled = true;
        releaseRoom();
        onCancel(typeof reason === "string" && reason ? reason : "公网侧断开连接");
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: RESPONSE_QUEUE_HIGH_WATERMARK_BYTES }),
  );

  return {
    stream,
    async enqueue(chunk) {
      if (cancelled || !controller) return;
      while (!cancelled && controller.desiredSize !== null && controller.desiredSize <= 0) {
        await new Promise<void>((resolve) => {
          roomGate = resolve;
        });
      }
      if (cancelled || !controller) return;
      controller.enqueue(chunk);
      const gate = pullGate;
      pullGate = null;
      gate?.();
    },
    close() {
      if (cancelled) return;
      releaseRoom();
      try {
        controller?.close();
      } catch {
        // 消费端已撤销（公网侧断开），没有必要再关
      }
    },
    error(reason) {
      if (cancelled) return;
      releaseRoom();
      try {
        controller?.error(reason);
      } catch {
        // 消费端已走，响应无法再改写
      }
    },
    isCancelled: () => cancelled,
  };
};
