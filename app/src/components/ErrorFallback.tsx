/**
 * 错误边界组件：提供路由级异常的友好展示与完整日志记录
 * 不依赖 AuthProvider / 组件库 Provider，确保错误边界自身渲染稳定
 */

import {
  ArrowLeftOutlined,
  HomeOutlined,
  ReloadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { getDisplayErrorMessage } from "#/utils/error-utils";

/** 输出错误日志，服务端和客户端均不影响异常展示 */
function logError(error: unknown, context?: Record<string, unknown>) {
  try {
    const serializable = {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...context,
      timestamp: new Date().toISOString(),
      isServer: typeof window === "undefined",
    };
    console.error("[ERROR BOUNDARY]", serializable);
  } catch {
    // 确保日志自身异常不中断错误边界
  }
}

const primaryActionClass =
  "inline-flex items-center gap-1.5 border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground no-underline hover:opacity-90";
const secondaryActionClass =
  "inline-flex cursor-pointer items-center gap-1.5 border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-background-secondary";

/**
 * 默认错误回退组件
 * 用于 router.defaultErrorComponent 和各路由 errorComponent
 */
export function DefaultErrorFallback({ error, reset, info }: ErrorComponentProps) {
  // 可展示文案：系统级错误为 null（不向终端用户透出技术细节），业务/校验错误展示服务端归一化文案
  const displayMessage = getDisplayErrorMessage(error);

  // 客户端在 effect 中记录：渲染期打日志在并发渲染 / 重试下会重复执行
  useEffect(() => {
    logError(error, { componentStack: info?.componentStack });
  }, [error, info?.componentStack]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-danger/15">
          <WarningOutlined className="text-2xl text-danger" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">页面出错了</h1>
        {displayMessage && (
          <p className="mb-6 text-sm break-all text-foreground-secondary">{displayMessage}</p>
        )}
        <div className="flex items-center justify-center gap-3">
          {reset && (
            <button type="button" onClick={reset} className={secondaryActionClass}>
              <ReloadOutlined />
              重试
            </button>
          )}
          <Link to="/" className={primaryActionClass}>
            <HomeOutlined />
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}

/**
 * 404 回退组件
 * 用于 router.defaultNotFoundComponent
 */
export function NotFoundFallback() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-background-secondary">
          <WarningOutlined className="text-2xl text-foreground-tertiary" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">404</h1>
        <p className="mb-6 text-sm text-foreground-secondary">页面未找到</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => window.history.back()}
            className={secondaryActionClass}
          >
            <ArrowLeftOutlined />
            返回上页
          </button>
          <Link to="/" className={primaryActionClass}>
            <HomeOutlined />
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
