/**
 * e2e 自定义 fixtures：前台/后台登录态页面与唯一命名工具
 */

import { test as base, expect, type Page } from "@playwright/test";
import { CLIENT_USER, ROOT_ADMIN } from "./helpers/db";

export { expect };

/** 生成带时间戳后缀的唯一标识，避免并行/重复运行数据冲突 */
export function uniqueName(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** 跳转页面并等待客户端渲染完成（单页应用需等 React 挂载后再交互） */
export async function goto(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** 前台客户端用户登录（/login） */
export async function clientLogin(page: Page): Promise<void> {
  await goto(page, "/login");
  await page.locator('input[name="username"]').fill(CLIENT_USER.username);
  await page.locator('input[name="password"]').fill(CLIENT_USER.password);
  await page.locator("form button[type='submit']").click();
  await page.waitForURL((url) => url.pathname === "/");
}

/** 后台 root 管理员登录（/admin/login） */
export async function adminLogin(page: Page): Promise<void> {
  await goto(page, "/admin/login");
  await page.getByPlaceholder("用户名").fill(ROOT_ADMIN.username);
  await page.getByPlaceholder("密码").fill(ROOT_ADMIN.password);
  await page.locator("form button[type='submit']").click();
  await page.waitForURL(/\/admin$/);
}

/**
 * 扩展 test 对象：
 * - adminPage：已用 root 登录的后台页面
 * - clientPage：已用客户端账号登录的前台页面
 */
export const test = base.extend<{
  adminPage: Page;
  clientPage: Page;
}>({
  adminPage: async ({ page }, use) => {
    await adminLogin(page);
    await use(page);
  },
  clientPage: async ({ page }, use) => {
    await clientLogin(page);
    await use(page);
  },
});
