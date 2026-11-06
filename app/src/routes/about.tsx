/**
 * 关于页面：中继服务的定位、数据落点与前台入口
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button, Card, Col, Flex, Row, Typography } from "antd";
import { useClientAuth } from "#/components/client";
import { useTranslation } from "#/components/providers";

export const Route = createFileRoute("/about")({
  component: About,
});

/** 中继承担的几件事：一句一条，不展开技术细节 */
const CAPABILITIES = [
  "远程访问：UCode 主动出站建立隧道，公网请求经中继回灌到本机服务，不必对外暴露端口。",
  "账号与设备：后台管理账号与角色权限，登记本机 UCode 实例、查看在线状态并吊销令牌。",
  "模型端点与资产下发：模型调用集中转发与记账，技能与提示词命令统一发布，凭据不下发到设备。",
];

/** 数据落点：中继是自建服务，数据都在部署方本机 */
const DATA_PLACES = [
  "中继是自建服务，每企业一套：账号、设备与用量数据都存在部署方自有的数据库里，不经过第三方。",
  "上传文件与运行日志同样落在部署方本机的存储目录，数据不出企业边界。",
];

/** 前台入口：登录态决定首项是「登录」还是「我的设备」 */
const ENTRIES = [
  { to: "/devices", label: "我的设备", primary: true },
  { to: "/usage", label: "我的用量", primary: false },
] as const;

function About() {
  const { t } = useTranslation();
  const { user } = useClientAuth();
  const navigate = useNavigate();
  const entries = user ? ENTRIES : [{ to: "/login", label: "登录", primary: false }, ...ENTRIES];

  const sections = [
    { title: "中继做什么", items: CAPABILITIES },
    { title: "数据放在哪", items: DATA_PLACES },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <Card title={<span className="text-lg">{t("关于 UCode 中继")}</span>}>
        <Typography.Paragraph type="secondary">
          {t(
            "这里是 UCode 的中继服务：登录后即可远程访问本机 UCode，用它统一管理账号与设备，并由它承载模型端点与内置资产下发。",
          )}
        </Typography.Paragraph>

        <Row gutter={[16, 16]}>
          {sections.map((section) => (
            <Col key={section.title} xs={24} sm={12}>
              <Card size="small" title={t(section.title)} className="h-full">
                <ul className="list-disc space-y-2 pl-5">
                  {section.items.map((item) => (
                    <li key={item} className="text-sm text-foreground-secondary">
                      {t(item)}
                    </li>
                  ))}
                </ul>
              </Card>
            </Col>
          ))}
        </Row>

        <Flex gap={12} wrap className="mt-6">
          {entries.map((entry) => (
            <Button
              key={entry.to}
              type={entry.primary ? "primary" : "default"}
              onClick={() => navigate({ to: entry.to })}
            >
              {t(entry.label)}
            </Button>
          ))}
        </Flex>
      </Card>
    </main>
  );
}
