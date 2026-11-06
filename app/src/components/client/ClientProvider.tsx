/**
 * 前台提供器：antd 装配（中性主题，跟随界面语言）+ 错误提示器
 * 布局（页头 / 页脚）由根文档渲染，这里只负责组件库上下文与提示出口。
 */
import { message } from "@ucode/hub-ui-spa/antd-static";
import { useEffect } from "react";
import { AntdAppProvider } from "#/components/providers/antd-app";
import { useGlobalStore } from "#/components/providers/global-store";
import { SfnErrorNotice } from "#/components/SfnErrorNotice";
import { CLIENT_THEME } from "#/theme/themes";
import { registerSfnNotifier } from "#/utils/sfn-error";

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useGlobalStore();

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

  return (
    <AntdAppProvider preset={CLIENT_THEME} locale={locale}>
      {children}
    </AntdAppProvider>
  );
}
