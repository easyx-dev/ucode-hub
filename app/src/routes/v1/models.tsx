/**
 * 中继模型端点：`GET /v1/models` —— 已配置厂商的模型清单，供客户端发现可用模型。
 *
 * 鉴权与对话端点同口径（设备令牌或 hub 会话令牌）；只读清单，不记用量。
 * 按调用方身份限流，阈值比对话端点宽（见 `#/services/model-endpoint/rate-limit`）。
 */
import { createFileRoute } from "@tanstack/react-router";

import { resolveModelEndpointCaller } from "#/services/model-endpoint/auth";
import { modelEndpointAuthDeps } from "#/services/model-endpoint/deps";
import { openAiErrorResponse, toModelList } from "#/services/model-endpoint/protocol";
import { enforceRateLimit, MODELS_RATE_LIMIT } from "#/services/model-endpoint/rate-limit";
import { readProviders } from "#/shared-services/ai/ai.provider";
import { logger } from "#/shared-services/logger";

export const Route = createFileRoute("/v1/models")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const caller = await resolveModelEndpointCaller(
          request.headers.get("authorization"),
          modelEndpointAuthDeps,
        );
        if (!caller) {
          return openAiErrorResponse(
            401,
            "未认证：请用设备令牌或 hub 会话令牌调用",
            "invalid_api_key",
          );
        }

        const limited = enforceRateLimit(caller, MODELS_RATE_LIMIT);
        if (limited) return limited;

        const data = toModelList(await readProviders());
        logger.debug(
          { accountId: caller.accountId, kind: caller.kind, count: data.length },
          "模型端点返回模型清单",
        );

        return new Response(JSON.stringify({ object: "list", data }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
