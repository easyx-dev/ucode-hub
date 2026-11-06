/**
 * 根文档：单页应用（SPA）的唯一 HTML 外壳
 * 头信息与主题按当前路径切换：管理端棕色主题 + 侧边栏布局，其余为前台中性主题 + 页头页脚。
 * 语言、UI 翻译与站点配置由 SFn 在挂载后取（构建期外壳里没有数据），取回前只渲染占位。
 */
import { HeadContent, Scripts, useLocation } from "@tanstack/react-router";
import { Spin } from "antd";
import { useEffect, useState } from "react";
import faviconUrl from "#/assets/favicon.svg?url";
import adminFaviconUrl from "#/assets/favicon-admin.svg?url";
import faviconDarkUrl from "#/assets/favicon-dark.svg?url";
import { AdminProvider } from "#/components/admin/AdminProvider";
import { ClientAuthProvider, ClientProvider, ClientShell } from "#/components/client";
import { GlobalStoreProvider } from "#/components/providers";
import { SfnErrorDialogHost } from "#/components/SfnErrorDialog";
import { getVisibleConfigsSFn } from "#/shared-services/config/config.functions";
import { getLocaleBundleSFn } from "#/shared-services/i18n/i18n.functions";
import type { Locale, Translations } from "#/shared-services/i18n/i18n.types";
import { DEFAULT_LOCALE } from "#/shared-services/i18n/i18n.types";
import globalCssUrl from "#/styles/global.css?url";
import { ADMIN_THEME, CLIENT_THEME } from "#/theme/themes";
import { applyThemeToDom, readStoredThemeMode } from "#/theme/use-theme-mode";
import { installSfnErrorFallback } from "#/utils/sfn-error";

/** 应用引导数据：locale 与 UI 翻译、客户端可见系统配置 */
interface AppBootstrap {
  locale: Locale;
  translations: Translations;
  systemConfig: Record<string, string>;
}

// 内联层声明锁定级联层顺序：若全局 CSS <link> 加载失败（混合/陈旧部署 404），antd 运行时注入的
// @layer antd 会成为首层而落到 preflight 之下、全部样式被重置覆盖；声明顺序须与 global.css 顶部一致。
const LAYER_ORDER_STYLE = "@layer properties, theme, base, antd, components, utilities;";

/**
 * 首帧主题脚本：按路径选择预设（/admin → 管理端，其余 → 前台），
 * 在样式生效前写好 data-theme，避免亮色闪烁。
 */
function buildThemeInitScript(): string {
  const presets = { admin: ADMIN_THEME, client: CLIENT_THEME };
  return `(function(){try{var isAdmin=location.pathname.indexOf('/admin')===0;var p=isAdmin?${JSON.stringify(
    {
      storageKey: presets.admin.storageKey,
      light: presets.admin.light.dataTheme,
      dark: presets.admin.dark.dataTheme,
    },
  )}:${JSON.stringify({
    storageKey: presets.client.storageKey,
    light: presets.client.light.dataTheme,
    dark: presets.client.dark.dataTheme,
  })};var m=localStorage.getItem(p.storageKey)||'auto';m=(m==='light'||m==='dark'||m==='auto')?m:'auto';var d=m==='auto'?window.matchMedia('(prefers-color-scheme: dark)').matches:m==='dark';var r=document.documentElement;r.setAttribute('data-theme',d?p.dark:p.light);r.style.colorScheme=d?'dark':'light'}catch(e){}})();`;
}

const THEME_INIT_SCRIPT = buildThemeInitScript();

/**
 * 引导数据：外壳是构建期预渲染的静态 HTML，里面没有任何运行时数据，
 * 因此语言、翻译与站点配置在挂载后取一次；失败按默认值继续，不让整站卡在占位。
 */
function useAppBootstrap(): AppBootstrap | null {
  const [data, setData] = useState<AppBootstrap | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLocaleBundleSFn(), getVisibleConfigsSFn()])
      .then(([bundle, systemConfig]) => {
        if (cancelled) return;
        setData({
          locale: bundle?.locale ?? DEFAULT_LOCALE,
          translations: bundle?.translations ?? {},
          systemConfig: systemConfig ?? {},
        });
      })
      .catch(() => {
        if (cancelled) return;
        setData({ locale: DEFAULT_LOCALE, translations: {}, systemConfig: {} });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}

/** 文档级外观：主题、标题、语言属性与图标随端切换（管理端标题由布局再覆盖为「站点名 管理后台」） */
function useDocumentChrome(isAdmin: boolean, siteName: string, locale: Locale) {
  useEffect(() => {
    const preset = isAdmin ? ADMIN_THEME : CLIENT_THEME;
    applyThemeToDom(readStoredThemeMode(preset), preset);
    document.documentElement.lang = isAdmin ? "zh-CN" : locale;
    document.title = isAdmin ? `${siteName} 管理后台` : siteName;

    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) icon.href = isAdmin ? adminFaviconUrl : faviconUrl;
  }, [isAdmin, siteName, locale]);
}

export function RootDocument({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  const bootstrap = useAppBootstrap();
  const siteName = bootstrap?.systemConfig.site_name || "HUB";

  useDocumentChrome(isAdmin, siteName, bootstrap?.locale ?? DEFAULT_LOCALE);

  // 全局兜底：未被任何调用点处理的 SFn 错误统一提示（两端共用同一套提示器）
  useEffect(installSfnErrorFallback, []);

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: LAYER_ORDER_STYLE }} />
        <link rel="stylesheet" href={globalCssUrl} />
        <link rel="icon" type="image/svg+xml" href={faviconUrl} />
        <link
          rel="icon"
          type="image/svg+xml"
          href={faviconDarkUrl}
          media="(prefers-color-scheme: dark)"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
        <title>{siteName}</title>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        {bootstrap === null ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <Spin />
          </div>
        ) : isAdmin ? (
          <AdminProvider>{children}</AdminProvider>
        ) : (
          <GlobalStoreProvider
            value={{
              locale: bootstrap.locale,
              translations: bootstrap.translations,
              systemConfig: bootstrap.systemConfig,
            }}
          >
            <ClientAuthProvider>
              <ClientProvider>
                <ClientShell>{children}</ClientShell>
              </ClientProvider>
            </ClientAuthProvider>
          </GlobalStoreProvider>
        )}
        {/* SFn 错误详情弹窗宿主（覆盖管理端与前台，独立于提示消息生命周期） */}
        <SfnErrorDialogHost />
        <Scripts />
      </body>
    </html>
  );
}
