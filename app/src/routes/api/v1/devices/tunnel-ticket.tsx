/**
 * 换隧道票据：`POST /api/v1/devices/tunnel-ticket`
 *
 * 设备用长期 `deviceToken` 调这里，拿到一张 5 分钟有效的票据去建立隧道。
 * 这是数据面唯一需要查库的一步——签票在这里判「设备在册且未吊销」，隧道握手只验签。
 *
 * 鉴权用设备令牌本身（不走用户会话守卫）：调用方是设备，不是浏览器里的用户。
 */
import { createFileRoute } from "@tanstack/react-router";

import { authorizeDeviceHeaders } from "#/services/auth/device-token.server";
import { issueTunnelTicket } from "#/services/device/tunnel-ticket.server";
import { failJson } from "#/shared-services/http/json-response";
import { logger } from "#/shared-services/logger";

export const Route = createFileRoute("/api/v1/devices/tunnel-ticket")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const device = await authorizeDeviceHeaders(request.headers);
        if (!device) {
          logger.debug("换票被拒：设备令牌无效或已吊销");
          return failJson(401, "设备令牌无效或已吊销");
        }

        const issued = await issueTunnelTicket(device.id);
        logger.debug({ deviceId: device.id }, "已签发隧道票据");
        return Response.json(issued);
      },
    },
  },
});
