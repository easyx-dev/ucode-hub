/**
 * 内置资产内容：`GET /builtin/assets/<id>/<version>`
 *
 * 设备身份鉴权与清单同源；响应体是逐个文件读盘编码的 JSON 流（见 `builtin-assets.server`），
 * 未登记的 id / 版本与非法路径段都回同一个 404，不区分「不存在」与「路径不合法」。
 */
import { createFileRoute } from "@tanstack/react-router";
import { authorizeDeviceHeaders } from "#/services/auth/device-token.server";
import {
  builtinAssetDir,
  builtinAssetsRoot,
  createBuiltinBundleStream,
  findBuiltinAsset,
  isSafeBuiltinSegment,
  readBuiltinManifest,
} from "#/services/builtin-assets/builtin-assets.server";
import { failJson, JSON_HEADERS } from "#/shared-services/http/json-response";

const notFound = (): Response => failJson(404, "资产不存在");

export const Route = createFileRoute("/builtin/assets/$id/$version")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const device = await authorizeDeviceHeaders(request.headers);
        if (!device) return failJson(401, "设备令牌无效或已吊销");

        // 参数保持编码态（不 decode）：注册进清单的段名只含字母数字与 `._-`，编码过的取值一律按不存在处理
        const { id, version } = params;
        if (!isSafeBuiltinSegment(id) || !isSafeBuiltinSegment(version)) return notFound();

        const asset = findBuiltinAsset(readBuiltinManifest(), id, version);
        if (!asset) return notFound();

        const root = builtinAssetsRoot();
        return new Response(createBuiltinBundleStream(asset, builtinAssetDir(root, id, version)), {
          status: 200,
          headers: JSON_HEADERS,
        });
      },
    },
  },
});
