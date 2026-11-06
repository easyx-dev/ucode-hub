/**
 * antd 统一装配：样式分层注入 + 主题与语言 + App 上下文 + 静态调用桥接
 * 管理端与前台共用，差异只在传入的主题预设与语言。
 */
import { StyleProvider } from "@ant-design/cssinjs";
import { AntdStaticBridge } from "@ucode/hub-ui-spa/antd-static";
import { App, theme as antdTheme, ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import type { ReactNode } from "react";
import type { Locale } from "#/shared-services/i18n/i18n.types";
import type { ThemePreset } from "#/theme/use-theme-mode";
import { useThemeMode } from "#/theme/use-theme-mode";

interface AntdAppProviderProps {
  preset: ThemePreset;
  /** 界面语言：决定 antd 组件内建文案（分页、空态、日期面板等） */
  locale: Locale;
  children: ReactNode;
}

export function AntdAppProvider({ preset, locale, children }: AntdAppProviderProps) {
  const { isDark, scheme } = useThemeMode(preset);

  return (
    <StyleProvider layer>
      <ConfigProvider
        locale={locale === "en" ? enUS : zhCN}
        theme={{
          token: {
            // 主色随明暗切换（见 theme/themes.ts 预设），与 CSS `--s-primary` 同色
            colorPrimary: scheme.antdColorPrimary,
            colorInfo: scheme.antdColorPrimary,
            // 主色底上的文字色：主色偏亮时（如前台暗色的浅灰主色）用深字，否则白字不可读
            colorTextLightSolid: scheme.antdPrimaryText,
            // 直角风格：antd 6 borderRadius 归零，派生圆角自动归零
            borderRadius: 0,
          },
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        }}
      >
        <App message={{ duration: 5 }} notification={{ duration: 5 }}>
          <AntdStaticBridge />
          {children}
        </App>
      </ConfigProvider>
    </StyleProvider>
  );
}
