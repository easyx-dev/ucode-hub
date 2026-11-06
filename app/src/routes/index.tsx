/**
 * 前台首页：中继服务定位 + 入口
 * 未登录给登录 / 注册，已登录给「我的设备」；后台入口只对管理端账号展示
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card, Col, Flex, Row, Typography } from "antd";
import { useClientAuth } from "#/components/client";
import { useGlobalStore, useTranslation } from "#/components/providers";
import { getCurrentAdminSFn } from "#/services/admin-auth/admin-auth.functions";
import { toBool } from "#/utils/bool";

export const Route = createFileRoute("/")({
  component: HomePage,
  // 与管理端布局守卫同一处身份判定：普通客户端用户拿不到后台入口
  loader: async () => ({ isAdmin: (await getCurrentAdminSFn()) !== null }),
});

const FEATURES = [
  {
    label: "远程访问",
    desc: "UCode 主动出站建立隧道，公网请求经中继回灌到本机服务，不必对外暴露端口。",
  },
  {
    label: "我的设备",
    desc: "登记本机 UCode 实例，随时查看在线状态，按需改名或吊销令牌。",
  },
  {
    label: "模型端点与资产下发",
    desc: "由中继统一承载：模型调用集中转发与记账，技能与提示词命令统一发布，凭据不下发到设备。",
  },
];

function HomePage() {
  const { t } = useTranslation();
  const { user } = useClientAuth();
  const { isAdmin } = Route.useLoaderData();
  const { systemConfig } = useGlobalStore();
  const navigate = useNavigate();
  // 注册入口跟随站点开关，与登录页、注册页读的是同一份客户端可见配置
  const isRegisterEnabled = toBool(systemConfig.client_register_enabled);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <Flex vertical align="center" gap={16} className="mb-10 text-center sm:mb-16">
        <Typography.Title level={1} className="!mb-0">
          {t("UCode 中继服务")}
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!mb-0 max-w-2xl">
          {t("登录后可远程访问本机 UCode；后续承载模型端点与内置资产下发。")}
        </Typography.Paragraph>
        <Flex gap={12} wrap justify="center">
          {user ? (
            <Button type="primary" onClick={() => navigate({ to: "/devices" })}>
              {t("我的设备")}
            </Button>
          ) : (
            <>
              <Button type="primary" onClick={() => navigate({ to: "/login" })}>
                {t("登录")}
              </Button>
              {isRegisterEnabled && (
                <Button onClick={() => navigate({ to: "/register" })}>{t("注册")}</Button>
              )}
            </>
          )}
          {isAdmin && <Button onClick={() => navigate({ to: "/admin" })}>{t("后台")}</Button>}
        </Flex>
      </Flex>

      <Row gutter={[16, 16]}>
        {FEATURES.map((item) => (
          <Col key={item.label} xs={24} sm={12} lg={8}>
            <Card title={t(item.label)} className="h-full">
              <Typography.Paragraph type="secondary" className="!mb-0">
                {t(item.desc)}
              </Typography.Paragraph>
            </Card>
          </Col>
        ))}
      </Row>
    </main>
  );
}
