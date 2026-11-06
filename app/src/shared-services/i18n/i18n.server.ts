/**
 * 国际化服务层统一导出（barrel）
 * UI 翻译 → i18n.ui.server；共享类型 → i18n.types
 */

export type { TranslationImportResult } from "./i18n.types";
export type {
  ListUITranslationsParams,
  UiTranslationExportData,
} from "./i18n.ui.server";
export {
  deleteUITranslation,
  getAllUITranslationsForExport,
  getUITranslations,
  importUiTranslations,
  listUITranslations,
  loadUITranslations,
  refreshUITranslationCache,
  upsertUITranslation,
} from "./i18n.ui.server";
