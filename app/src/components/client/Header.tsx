/**
 * 前台公共页头：导航 + 语言切换 + 主题切换 + 消息入口 + 用户区（移动端收进抽屉）
 */
import {
  BellOutlined,
  CloseOutlined,
  LogoutOutlined,
  MenuOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link, useLocation } from "@tanstack/react-router";
import { Button, Drawer, Flex, Space, Tooltip, Typography } from "antd";
import { useState } from "react";
import { ClientLogo, useClientAuth } from "#/components/client";
import { ThemeToggle } from "#/components/client/ThemeToggle";
import { useGlobalStore, useTranslation } from "#/components/providers";
import { track } from "#/services/track/track";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
} from "#/shared-services/i18n/i18n.types";

/** 导航链接样式：与 antd 文本按钮的密度对齐，激活项给浅底 */
function navLinkClass(active: boolean): string {
  return active
    ? "bg-background-secondary px-3 py-1 text-sm text-foreground no-underline"
    : "px-3 py-1 text-sm text-foreground-secondary no-underline hover:text-foreground";
}

function useNavLinks() {
  const { t } = useTranslation();
  return [
    { to: "/", label: t("首页") },
    { to: "/devices", label: t("我的设备") },
    { to: "/usage", label: t("我的用量") },
    { to: "/about", label: t("关于") },
  ] as const;
}

/** 切换语言：写 Cookie 后整页重载，让渲染期取到新语言资源 */
async function switchLocale(current: string | undefined) {
  const next = SUPPORTED_LOCALES.find((locale) => locale !== current) ?? DEFAULT_LOCALE;
  await cookieStore.set(LOCALE_COOKIE, next);
  window.location.reload();
}

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t, locale } = useTranslation();
  const { user, logout } = useClientAuth();
  const { systemConfig } = useGlobalStore();
  const { pathname } = useLocation();
  const navLinks = useNavLinks();
  const siteName = systemConfig?.site_name || "HUB";

  const handleLogout = async () => {
    track("Logout", {});
    await logout();
    setMobileOpen(false);
  };

  const userBlock = user ? (
    <Space size={4}>
      <Typography.Text type="secondary" className="whitespace-nowrap">
        {user.username}
      </Typography.Text>
      <Tooltip title={t("退出登录")}>
        <Button
          type="text"
          size="small"
          aria-label={t("退出登录")}
          icon={<LogoutOutlined />}
          onClick={() => void handleLogout()}
        />
      </Tooltip>
    </Space>
  ) : (
    <Link to="/login" className={navLinkClass(false)}>
      {t("登录")}
    </Link>
  );

  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-50 border-b border-border bg-background/80 px-4 backdrop-blur-lg"
    >
      <nav className="mx-auto flex max-w-5xl items-center gap-2 py-2">
        <Link to="/" className="flex min-w-0 shrink items-center gap-2 no-underline">
          <ClientLogo height={28} />
          <span className="truncate text-base font-semibold text-foreground">{siteName}</span>
        </Link>

        <div className="hidden flex-1 items-center justify-center gap-1 sm:flex">
          {navLinks.map((link) => (
            <Link key={link.to} to={link.to} className={navLinkClass(pathname === link.to)}>
              {link.label}
            </Link>
          ))}
        </div>

        <Space className="ml-auto sm:ml-0" size={2}>
          <Button type="text" size="small" onClick={() => void switchLocale(locale)}>
            {locale === "zh" ? "EN" : "中文"}
          </Button>
          <ThemeToggle />
          {user && (
            <Tooltip title={t("消息中心")}>
              <Link
                to="/messages"
                aria-label={t("消息中心")}
                className="flex h-7 w-7 items-center justify-center text-foreground-secondary no-underline hover:text-foreground"
              >
                <BellOutlined />
              </Link>
            </Tooltip>
          )}
          <span className="hidden sm:inline">{userBlock}</span>
          <Button
            className="sm:hidden"
            type="text"
            size="small"
            aria-label={t("切换菜单")}
            icon={mobileOpen ? <CloseOutlined /> : <MenuOutlined />}
            onClick={() => setMobileOpen((open) => !open)}
          />
        </Space>
      </nav>

      <Drawer
        placement="right"
        width={240}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title={siteName}
      >
        <Flex vertical gap={8} align="stretch">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={navLinkClass(pathname === link.to)}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 border-t border-border pt-2">
            {user ? (
              <Flex align="center" gap={8}>
                <UserOutlined />
                <span className="min-w-0 flex-1 truncate">{user.username}</span>
                <Button
                  type="text"
                  size="small"
                  aria-label={t("退出登录")}
                  icon={<LogoutOutlined />}
                  onClick={() => void handleLogout()}
                />
              </Flex>
            ) : (
              <Link to="/login" onClick={() => setMobileOpen(false)}>
                {t("登录")}
              </Link>
            )}
          </div>
        </Flex>
      </Drawer>
    </header>
  );
}
