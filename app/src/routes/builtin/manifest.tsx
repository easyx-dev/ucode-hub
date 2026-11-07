/**
 * 内置资产清单：`GET /builtin/manifest`
 *
 * 设备身份鉴权（与隧道同一套 deviceToken）；清单随发布而变，故带 `cache-control: no-store`
 * ——内容寻址的是资产内容，清单本身不是。
 */
import { createFileRoute } from "@tanstack/react-router";
import { authorizeDeviceHeaders } from "#/services/auth/device-token.server";
import { readBuiltinManifest } from "#/services/builtin-assets/builtin-assets.server";
import { failJson, JSON_HEADERS } from "#/shared-services/http/json-response";

export const Route = createFileRoute("/builtin/manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const device = await authorizeDeviceHeaders(request.headers);
        if (!device) return failJson(401, "设备令牌无效或已吊销");

        return new Response(JSON.stringify(readBuiltinManifest()), {
          status: 200,
          headers: JSON_HEADERS,
        });
      },
    },
  },
});
