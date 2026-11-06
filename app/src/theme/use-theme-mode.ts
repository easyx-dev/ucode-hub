/**
 * 主题模式管理：亮/暗/跟随系统三态，落实为 `data-theme` 属性 + antd 主题算法输入
 * 以 localStorage 作为共享外部状态，同一 storageKey 的多个调用点实时同步，
 * 并联动跨标签页与操作系统主题变化。预设本身见 ./themes.ts。
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";

/** 具名主题方案：dataTheme 须与 global.css 主题块选择器一致 */
export type ThemeScheme = {
  /** data-theme 属性值，须与 CSS 主题块选择器一致 */
  dataTheme: string;
  isDark: boolean;
  /** antd ConfigProvider colorPrimary，须与 CSS `--s-primary` 同色 */
  antdColorPrimary: string;
  /** 主色底上的文字色（antd `colorTextLightSolid`）：主色偏亮时用深色字，否则白字看不清 */
  antdPrimaryText: string;
  /** 浏览器 UI 主题色（地址栏等），须与对应全局样式 `--s-surface` 同色 */
  themeColor: string;
};

/** 主题预设：一端（管理端 / 前台）的明暗两档主题 */
export type ThemePreset = {
  /** localStorage 明暗模式键名 */
  storageKey: string;
  light: ThemeScheme;
  dark: ThemeScheme;
};

/** 主题明暗模式 */
export type ThemeMode = "light" | "dark" | "auto";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** 从 localStorage 读取保存的主题明暗模式 */
function getStoredMode(key: string): ThemeMode {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  } catch {
    // 隐私模式等场景下 localStorage 不可用，回退跟随系统
  }
  return "auto";
}

/** 模块级监听器集合：同一页面内所有 hook 实例共享，setMode 时统一通知 */
const listeners = new Set<() => void>();

function notifyThemeChange() {
  for (const listener of listeners) listener();
}

/**
 * 订阅主题变化：同页实例通知 + storage 事件（跨标签页）。
 * storage 回调仅关注本端主题键，避免同源其他键的写入触发无关重渲染。
 */
function subscribeTheme(preset: ThemePreset, callback: () => void) {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === preset.storageKey) {
      callback();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** 订阅操作系统暗色偏好变化（auto 模式下需要联动） */
function subscribeMedia(callback: () => void) {
  const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getMediaSnapshot() {
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

/** 主题名与明暗判定：两端的 data-theme 值由各自预设给出，不在这里拼字符串 */
function resolveScheme(mode: ThemeMode, preset: ThemePreset): ThemeScheme {
  const isDark = mode === "auto" ? getMediaSnapshot() : mode === "dark";
  return isDark ? preset.dark : preset.light;
}

/** 应用主题到 DOM：data-theme 承载完整主题名，并同步浏览器 UI 主题色 */
export function applyThemeToDom(mode: ThemeMode, preset: ThemePreset) {
  const scheme = resolveScheme(mode, preset);
  document.documentElement.setAttribute("data-theme", scheme.dataTheme);
  document.documentElement.style.colorScheme = scheme.isDark ? "dark" : "light";

  const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", scheme.themeColor);
  }
}

/** 读取当前持久化模式（供首帧脚本以外的场景复用） */
export function readStoredThemeMode(preset: ThemePreset): ThemeMode {
  return getStoredMode(preset.storageKey);
}

/**
 * 主题模式 hook
 * @param preset 主题预设（storageKey + 亮暗两档，见 ./themes.ts）
 * @returns mode 明暗三态、scheme 当前主题方案（含 dataTheme 与 antd 主色）
 */
export function useThemeMode(preset: ThemePreset) {
  const mode = useSyncExternalStore(
    (callback) => subscribeTheme(preset, callback),
    () => getStoredMode(preset.storageKey),
    () => "auto" as ThemeMode,
  );
  const prefersDark = useSyncExternalStore(subscribeMedia, getMediaSnapshot, () => false);

  const setMode = useCallback(
    (newMode: ThemeMode) => {
      try {
        localStorage.setItem(preset.storageKey, newMode);
      } catch {
        // 写不进去也不影响本次会话的显示：下面仍会通知各实例重读（读到旧值即保持原样）
      }
      notifyThemeChange();
    },
    [preset.storageKey],
  );

  // 落盘的模式可能被其他标签页改过，effect 内重读最新值再应用，避免闭包里的旧快照覆盖它
  useEffect(() => {
    applyThemeToDom(getStoredMode(preset.storageKey), preset);
  }, [mode, prefersDark, preset]);

  const isDark = mode === "auto" ? prefersDark : mode === "dark";
  const scheme: ThemeScheme = isDark ? preset.dark : preset.light;

  return { mode, setMode, isDark, scheme };
}
