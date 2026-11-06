/**
 * 前台首页 e2e：单页外壳、Hero 区与 Header 布局
 */

import { expect, goto, test } from "../fixtures";

test.describe("前台首页", () => {
  test("任意前台路径都回同一份单页外壳", async ({ request }) => {
    const res = await request.get("/devices");
    expect(res.status()).toBe(200);
    const html = await res.text();
    // 外壳只有挂载脚本与占位，不含任何路由内容（内容与布局都由浏览器渲染）
    expect(html).toContain('type="module"');
    expect(html).not.toContain("UCode 中继服务");
  });

  test("Hero 区标题与副标题可见", async ({ page }) => {
    await goto(page, "/");
    await expect(page.getByRole("heading", { name: "UCode 中继服务" })).toBeVisible();
    await expect(page.getByText("登录后可远程访问本机 UCode")).toBeVisible();
  });

  test("Header 渲染站点名、导航与语言切换", async ({ page }) => {
    await goto(page, "/");
    const header = page.getByTestId("site-header");
    await expect(header.getByText("HUB")).toBeVisible();
    const nav = header.locator("nav");
    await expect(nav).toContainText("首页");
    await expect(nav).toContainText("我的设备");
    await expect(nav).toContainText("关于");
    await expect(header.getByRole("button", { name: "EN" })).toBeVisible();
  });

  test("未登录状态 Header 显示登录入口", async ({ page }) => {
    await goto(page, "/");
    await expect(page.getByTestId("site-header").getByRole("link", { name: "登录" })).toBeVisible();
  });
});
