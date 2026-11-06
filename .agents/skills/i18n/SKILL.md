---
name: i18n
description: 本项目国际化开发指南。当需要翻译前台 UI 文案、新增语言或修改语言切换逻辑时触发。
---

# 国际化（i18n）开发指南

本项目采用**中文作为翻译 key**的国际化方案，基于 i18next + react-i18next，只覆盖**前台页面**的固定文案；管理端（`/admin/*`）是中文界面，文案硬编码中文、不参与翻译。

## 架构概览

翻译只有一层，存储在 `ui_translation` 表：

| 层级 | 表 | 用途 | 缓存 | 示例 |
|------|-----|------|------|------|
| UI 翻译 | `ui_translation` | 前台页面固定文案 | 内存全量缓存 | `t("首页")` → "Home" |

```
浏览器启动 → 外壳挂载后经 SFn 取 locale + UI 翻译（Cookie 由 SFn 请求带上）
         → __root.tsx 外壳注入 GlobalStoreProvider
         → 组件调用 useTranslation() / useLocale()
```

> 语言检测链路、缓存与写路径的完整架构说明 → [docs/i18n.md](../../../docs/i18n.md)。
>
> 数据库实体字段**不做多语言**：实体只保存原文一份。需要多语言展示的文案，走 UI 翻译。

## 核心概念

### 中文作为翻译 key

不同于传统 key 方案（`t("home.title")`），本项目直接使用**中文原文作为 key**：

```tsx
// ✅ 正确：中文文本直接作为 key
<h1>{t("首页")}</h1>
<p>{t("设备列表")}</p>

// ❌ 错误：不要使用英文或抽象 key
<h1>{t("home.title")}</h1>
```

i18next 查找逻辑：当前语言为 `zh` 时直接返回 key 本身；其他语言时从翻译资源中查找映射值。

### 支持的语言

定义在 `#/shared-services/i18n/i18n.types`，业务代码直接 import 使用，禁止本地重复定义：

```ts
import {
  DEFAULT_LOCALE,        // "zh"
  LOCALE_COOKIE,         // "lang"
  SUPPORTED_LOCALES,     // ["zh", "en"] as const
  type Locale,           // "zh" | "en"
} from "#/shared-services/i18n/i18n.types";
```

### 关键文件索引

| 文件 | 职责 |
|------|------|
| `#/shared-services/i18n/i18n.types` | 类型定义、支持语言、Cookie 名 |
| `#/shared-services/i18n/i18n.config` | i18next 实例创建（`createI18nInstance`） |
| `src/components/providers/i18n-context.tsx` | React Context Provider + `useTranslation` / `useLocale` hooks |
| `src/components/providers/global-store.tsx` | GlobalStore：组合 locale + translations 并注入 I18nProvider |
| `src/middleware/locale-middleware.ts` | 请求级语言检测中间件 |
| `src/shared-services/i18n/i18n.server.ts` | 服务层统一导出（barrel），聚合 UI 翻译服务与类型 |
| `src/shared-services/i18n/i18n.functions.ts` | Server Function 包装器（`getLocaleBundleSFn`） |
| `src/shared-services/i18n/i18n.seed.ts` | 预设英文 UI 翻译种子数据（每次启动增量写入） |
| `src/shared-services/i18n/i18n.ui.server.ts` | UI 翻译服务层（查询/维护/导入导出） |
| `src/shared-services/i18n/i18n.ui.cache.ts` | `uiTranslationCache` 内存缓存 |
| `src/db/schema/translation.ts` | 数据库表定义 |

## 语言检测流程

每次请求按以下顺序确定语言：

1. **`localeMiddleware`**（`src/start.ts` 注册为全局 `requestMiddleware`）：从 `lang` Cookie 读取 locale，无 Cookie 时回退到 `zh`
2. **外壳启动**：`components/Document.tsx` 挂载后调用 `getLocaleBundleSFn` 加载全量 UI 翻译（取回前渲染占位）
3. **`GlobalStoreProvider`**：将 `locale` 和 `translations` 注入组件树
4. **`I18nProvider`**（在 GlobalStoreProvider 内部）：创建 i18next 实例，locale 变化时自动重建

```ts
// src/start.ts — 全局中间件注册
export const startInstance = createStart(() => ({
  requestMiddleware: [localeMiddleware, csrfMiddleware],
  functionMiddleware: [sfErrorLogger],
}));
```

## 前台组件使用指南

### 获取翻译函数和当前语言

```tsx
import { useTranslation } from "#/components/providers/i18n-context";

function MyComponent() {
  const { t, locale } = useTranslation();

  return (
    <div>
      <h1>{t("首页")}</h1>
      <p>{t("暂无数据")}</p>
    </div>
  );
}
```

### 仅获取当前语言

```tsx
import { useLocale } from "#/components/providers/i18n-context";

const locale = useLocale(); // "zh" | "en"
```

### 日期格式化

```tsx
new Date(item.publishedAt).toLocaleDateString(locale, {
  year: "numeric",
  month: "long",
  day: "numeric",
});
```

### 语言切换按钮

语言切换通过修改 `lang` Cookie 后刷新页面实现。参见 `src/components/client/Header.tsx` 中 `ClientOnly` 包裹的切换按钮：

```tsx
<ClientOnly>
  <Button
    variant="ghost"
    size="sm"
    onClick={async () => {
      const l = await cookieStore.get("lang");
      await cookieStore.set("lang", l?.value === "zh" ? "en" : "zh");
      window.location.reload();
    }}
  >
    {locale === "zh" ? "EN" : "中文"}
  </Button>
</ClientOnly>
```

注意：
- 必须用 `ClientOnly` 包裹，`cookieStore` 仅在浏览器环境可用
- 切换后需要 `window.location.reload()` 重新取语言资源并重渲染
- 按钮文本本身不翻译（显示当前语言的切换目标语言名）

## 新增 UI 翻译文案

当在组件中新增硬编码的中文文本时，按以下步骤添加翻译支持：

### Step 1：组件中用 t() 包裹

```tsx
// 修改前
<Button>提交</Button>

// 修改后
import { useTranslation } from "#/components/providers/i18n-context";
const { t } = useTranslation();
<Button>{t("提交")}</Button>
```

### Step 2：在种子数据中添加翻译

编辑 `src/shared-services/i18n/i18n.seed.ts`，在 `SEED_EN` 数组中追加：

```ts
{ locale: "en", key: "提交", value: "Submit" },
```

种子数据每次启动时写入，基于 `(locale, key)` 唯一约束做 `onConflictDoNothing`，新条目增量追加，已有条目不受影响。

### Step 3：验证

启动应用后可前往 `/admin/translations/ui` 管理页面查看和编辑 UI 翻译。

### 带插值的文案

如果文案包含动态数据，使用 i18next 插值语法（默认前缀 `{{key}}`，勿自定义单大括号以免误判含 `{ }` 的文案）：

```tsx
// 种子数据
{ locale: "en", key: "共 {{total}} 篇", value: "{{total}} articles" }

// 组件中使用
t("共 {{total}} 篇", { total: 10 }) // → "10 articles"
```

> 完整性守卫：前台所有 `t("中文")` 字面量必须存在于 `i18n.seed.ts` 的 `SEED_DATA`（en）中，
> 由 `__tests__/i18n.seed.test.ts` 自动扫描校验，遗漏种子会导致英文站静默回退中文。

## 管理端翻译管理

路由：`/admin/translations/ui`
权限：`translation:view`（查看）、`translation:manage`（编辑/删除）、`translation:export` / `translation:import`（导入导出）

功能：按语言筛选、按关键词搜索、创建/编辑/删除 UI 翻译条目，JSON 导入导出。编辑后自动刷新内存缓存。

> 默认语言（zh）为源语言（key 即原文），在管理端**只读**：不出现在新增/筛选的语言下拉中，表中的 zh 条目仅可查看不可编辑/删除。

## 缓存机制

UI 翻译使用 `MemoryCache` 全量缓存，定义在 `src/shared-services/i18n/i18n.ui.cache.ts`：

```ts
export const uiTranslationCache = new MemoryCache<Record<string, string>>({
  name: "ui_translation",
});
```

- **载入**：`getUITranslations(locale)` 优先读缓存，未命中时查库并写入缓存（种子数据已在启动阶段通过 `onConflictDoNothing` 预先写入数据库）；**默认语言（zh）作为源语言直接返回 `{}`，不查库**
- **刷新**：管理端保存/删除 UI 翻译时，调用 `refreshUITranslationCache(locale)` 仅失效缓存 key，由下一次读取懒加载重建
- **范围**：按 locale 独立缓存，仅 `en` 等非默认语言实际缓存；zh 恒为空资源
- **生命周期**：进程级内存缓存，服务重启后从库重新加载

## 添加新语言

目前仅支持 `zh` 和 `en`。如需添加新语言（例如 `ja`），需要以下改动：

1. `#/shared-services/i18n/i18n.types` — `SUPPORTED_LOCALES` 数组追加 `"ja"`，`LOCALE_LABELS` 追加语言标签
2. `src/shared-services/i18n/i18n.seed.ts` — 为新语言添加 `SEED_XX` 数组并追加到 `SEED_DATA`
3. 管理端翻译页面自动支持新语言（语言选择器基于 `SUPPORTED_LOCALES` 渲染）

## 常见任务速查

| 任务 | 操作 |
|------|------|
| 前台组件显示翻译文本 | `import { useTranslation }` → `const { t } = useTranslation()` → `t("中文")` |
| 获取当前语言 | `import { useLocale }` → `const locale = useLocale()` |
| 新增 UI 翻译条目 | 组件用 `t()` 包裹 → 在 `i18n.seed.ts` 添加翻译 → 管理端可编辑 |
| 刷新 UI 翻译缓存 | 管理端保存翻译时自动刷新；手动调用 `refreshUITranslationCache(locale)` |
| 切换语言 | 修改 `lang` Cookie → `window.location.reload()` |
| 添加新支持语言 | 修改 `SUPPORTED_LOCALES` + `LOCALE_LABELS` → 添加种子数据 |
| 导出/导入翻译 | 访问翻译管理页面 → 使用导出/导入按钮（需 `translation:export` / `translation:import` 权限） |
| 查看/编辑 UI 翻译 | 访问 `/admin/translations/ui`（需 `translation:view` 权限） |
