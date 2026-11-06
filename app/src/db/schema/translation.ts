/**
 * 国际化翻译表：UI 固定文案翻译
 *
 * - ui_translation：前台页面 UI 固定文案（key 直接使用中文原文，如 "首页"）
 * - value_type 复用 EditorType 枚举，控制管理端编辑器和渲染方式
 */
import { sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { pk, timestamps } from "./columns";

/** UI 固定文案翻译表：key 直接使用中文原文（如 "首页"），en 语言用于映射目标语言值 */
export const uiTranslation = sqliteTable(
  "ui_translation",
  {
    ...pk(),
    locale: text("locale").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    /** 复用 EditorType: input | text | number | json | rich | code */
    valueType: text("value_type").default("input").notNull(),
    ...timestamps(),
  },
  (table) => [unique("uq_ui_trans_locale_key").on(table.locale, table.key)],
);
