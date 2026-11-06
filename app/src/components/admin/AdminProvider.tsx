/**
 * 管理端提供器：antd 装配（棕色主题）+ 主题 Context + 错误提示器 + 登录态与侧边栏布局
 */
import { useLocation } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { enableColumnBudgetWarning } from "@ucode/hub-ui-spa/table";
import { useEffect, useMemo } from "react";
import { AntdAppProvider } from "#/components/providers/antd-app";
import { SfnErrorNotice } from "#/components/SfnErrorNotice";
import { DEFAULT_LOCALE } from "#/shared-services/i18n/i18n.types";
import { ADMIN_THEME } from "#/theme/themes";
import { useThemeMode } from "#/theme/use-theme-mode";
import { registerSfnNotifier } from "#/utils/sfn-error";
import { AdminAuthProvider } from "./AdminAuthProvider";
import { AdminLayout } from "./AdminLayout";
import { AdminThemeContext } from "./admin-theme";

// 开发期开启列宽预算校验：列宽合计超预算 / 弹性列不唯一 / 非弹性列缺 width 时在控制台提示
if (import.meta.env.DEV) {
  enableColumnBudgetWarning();
}

/** 无侧边栏外壳的独立页：登录 / 初始化 / 忘记密码 */
const STANDALONE_PATHS = new Set(["/admin/login", "/admin/init", "/admin/forgot-password"]);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isStandalone = STANDALONE_PATHS.has(pathname);
  const { mode, setMode, isDark } = useThemeMode(ADMIN_THEME);

  // 错误提示入口：可读消息 + 可展开的诊断详情（管理端与前台共用同一套提示器契约）
  useEffect(
    () =>
      registerSfnNotifier((info) =>
        message.error({
          content: <SfnErrorNotice info={info} />,
          duration: 8,
        }),
      ),
    [],
  );

  const ctxValue = useMemo(() => ({ mode, setMode, isDark }), [mode, setMode, isDark]);

  return (
    <AdminThemeContext.Provider value={ctxValue}>
      <AntdAppProvider preset={ADMIN_THEME} locale={DEFAULT_LOCALE}>
        {isStandalone ? (
          children
        ) : (
          <AdminAuthProvider>
            <AdminLayout>{children}</AdminLayout>
          </AdminAuthProvider>
        )}
      </AntdAppProvider>
    </AdminThemeContext.Provider>
  );
}
