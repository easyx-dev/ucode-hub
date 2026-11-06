/**
 * 前台公共页脚：品牌标识 + 导航 + 版权
 */
import { Link } from "@tanstack/react-router";
import { Flex, Layout, Space, Typography } from "antd";
import { ClientLogo } from "#/components/client";
import { useGlobalStore, useTranslation } from "#/components/providers";

export function Footer() {
  const year = new Date().getFullYear();
  const { t } = useTranslation();
  const { systemConfig } = useGlobalStore();
  const siteName = systemConfig?.site_name || "HUB";

  return (
    <Layout.Footer className="border-t border-border bg-transparent px-4 py-6">
      <Flex className="mx-auto max-w-5xl" vertical align="center" gap={12}>
        <Flex align="center" gap={24} wrap justify="center">
          <Space size={8}>
            <ClientLogo height={24} />
            <Typography.Text strong>{siteName}</Typography.Text>
          </Space>
          <Space size={16} wrap>
            <Link to="/">{t("首页")}</Link>
            <Link to="/devices">{t("我的设备")}</Link>
            <Link to="/about">{t("关于")}</Link>
          </Space>
        </Flex>
        <Typography.Text type="secondary" className="text-xs">
          &copy; {year} {siteName}. All rights reserved.
        </Typography.Text>
      </Flex>
    </Layout.Footer>
  );
}
