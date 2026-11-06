/**
 * 「我的用量」汇总卡：请求数、失败数与 token 消耗按同一时间段口径呈现
 */
import { Card, Col, Row, Typography } from "antd";
import { useTranslation } from "#/components/providers";
import type { UsageTotals } from "#/services/usage/usage.server";
import { formatCount } from "./usage.shared";

/** 一项汇总：`label` 是 i18n key，`hint` 已按当前语言渲染好 */
type SummaryItem = {
  /** 卡片标题（i18n key） */
  label: string;
  /** 主数值，已格式化 */
  value: string;
  /** 补充说明，无则不渲染 */
  hint?: string;
};

/** 汇总卡列表：与页头时间段同口径（服务层用同一份 where 算出的 totals） */
export function UsageTotalsCards({ totals }: { totals: UsageTotals }) {
  const { t } = useTranslation();

  const failureRate = totals.requests > 0 ? (totals.errorRequests / totals.requests) * 100 : 0;
  const items: SummaryItem[] = [
    { label: "请求数", value: formatCount(totals.requests) },
    {
      label: "失败数",
      value: formatCount(totals.errorRequests),
      hint: t("失败率 {{rate}}%", { rate: failureRate.toFixed(1) }),
    },
    { label: "输入 Token", value: formatCount(totals.promptTokens) },
    { label: "输出 Token", value: formatCount(totals.completionTokens) },
    { label: "合计 Token", value: formatCount(totals.totalTokens) },
    { label: "平均耗时", value: `${formatCount(totals.avgLatencyMs)} ms` },
  ];

  return (
    <Row gutter={[12, 12]}>
      {items.map((item) => (
        <Col key={item.label} xs={24} sm={12} lg={8}>
          <Card size="small">
            <Typography.Text type="secondary" className="text-xs">
              {t(item.label)}
            </Typography.Text>
            <Typography.Title level={4} className="!mb-0 !mt-1 tabular-nums">
              {item.value}
            </Typography.Title>
            {item.hint && (
              <Typography.Text type="secondary" className="text-xs">
                {item.hint}
              </Typography.Text>
            )}
          </Card>
        </Col>
      ))}
    </Row>
  );
}
