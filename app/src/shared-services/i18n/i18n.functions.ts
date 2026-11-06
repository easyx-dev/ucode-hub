/**
 * 国际化 Server Function 包装器：读取当前请求 locale 对应的 UI 翻译
 */

import { createServerFn } from "@tanstack/react-start";
import { getUITranslations } from "#/shared-services/i18n/i18n.server";

/**
 * 获取当前请求的 locale 及对应翻译（从 requestMiddleware context 读取 Cookie locale）
 */
export const getLocaleBundleSFn = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const locale = context.locale;
  const translations = await getUITranslations(locale);
  return { locale, translations };
});
