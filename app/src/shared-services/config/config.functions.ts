/**
 * 系统配置 Server Functions：客户端可见配置（跨端共享，无单一页面归属）
 */

import { createServerFn } from "@tanstack/react-start";
import { getVisibleConfigRows } from "./config.server";

/** 获取客户端可见的系统配置（无权限守卫） */
export const getVisibleConfigsSFn = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await getVisibleConfigRows();
  const config: Record<string, string> = {};
  for (const c of rows) config[c.key] = c.value;
  return config;
});
