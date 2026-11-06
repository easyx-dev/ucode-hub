/**
 * 主题切换按钮：亮 / 暗 / 跟随系统三态循环
 */
import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { CLIENT_THEME } from "#/theme/themes";
import { useThemeMode } from "#/theme/use-theme-mode";

const LABELS = {
  light: "主题：亮色，点击切换",
  dark: "主题：暗色，点击切换",
  auto: "主题：跟随系统，点击切换",
} as const;

const NEXT_MODE = { light: "dark", dark: "auto", auto: "light" } as const;

export function ThemeToggle() {
  const { mode, setMode, isDark } = useThemeMode(CLIENT_THEME);

  return (
    <Tooltip title={LABELS[mode]}>
      <Button
        type="text"
        aria-label={LABELS[mode]}
        icon={isDark ? <MoonOutlined /> : <SunOutlined />}
        onClick={() => setMode(NEXT_MODE[mode])}
      />
    </Tooltip>
  );
}
