/**
 * 根路由：组装根文档（SPA 单页应用，无服务端渲染）
 * 语言、翻译与站点配置由外壳挂载后经 SFn 取，根路由本身不加载数据
 */

import { createRootRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { RootDocument } from "#/components/Document";
import { stripSfnErrorMeta } from "#/utils/error-utils";
import { installSfnErrorFallback } from "#/utils/sfn-error";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  shellComponent: RootShell,
  errorComponent: RootError,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return <RootDocument>{children}</RootDocument>;
}

/** 全局兜底：未被任何调用点处理的 SFn 错误统一提示 */
function useSfnErrorFallback() {
  useEffect(installSfnErrorFallback, []);
}

function RootError({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? stripSfnErrorMeta(error.message) : "页面加载失败，请刷新重试";
  useSfnErrorFallback();

  // 根文档外壳仍会渲染，这里只输出内容区，避免嵌套 <html>
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-lg font-semibold text-foreground">页面加载失败</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
