/**
 * 前台「我的用量」：本人经中继发起的模型调用量与 token 消耗
 * 未登录跳登录页；切时间段重新取数（窗口换算在服务端，见 -mods/usage.functions.ts）
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button, Flex, Spin, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import type { UsageTotals } from "#/services/usage/usage.server";
import { sfnUnwrap } from "#/utils/sfn-error";
import { UsageTotalsCards } from "./usage/-mods/UsageTotalsCards";
import { getMyUsageTotalsSFn } from "./usage/-mods/usage.functions";
import {
  DEFAULT_USAGE_RANGE,
  USAGE_RANGE_LABELS,
  USAGE_RANGES,
  type UsageRange,
} from "./usage/-mods/usage.shared";

export const Route = createFileRoute("/usage")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (!user) throw redirect({ to: "/login" });
  },
  loader: async () => getMyUsageTotalsSFn({ data: { range: DEFAULT_USAGE_RANGE } }),
  component: UsagePage,
});

function UsagePage() {
  const { t } = useTranslation();
  const initial = Route.useLoaderData();
  const [range, setRange] = useState<UsageRange>(DEFAULT_USAGE_RANGE);
  const [totals, setTotals] = useState<UsageTotals>(initial);
  const [loading, setLoading] = useState(false);

  /** 切换时间段：只在拿到结果后替换汇总，失败保留上一段的数据（统一出口已提示） */
  const selectRange = async (next: UsageRange) => {
    if (next === range || loading) return;
    setRange(next);
    setLoading(true);
    const [result] = await sfnUnwrap(getMyUsageTotalsSFn({ data: { range: next } }), {
      error: t("加载用量失败"),
    });
    setLoading(false);
    if (result) setTotals(result);
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <header className="mb-6 sm:mb-8">
        <Typography.Title level={2} className="!mb-1">
          {t("我的用量")}
        </Typography.Title>
        <Typography.Text type="secondary">
          {t("本人经中继发起的模型调用量与 token 消耗")}
        </Typography.Text>
      </header>

      <Flex gap={8} wrap align="center" className="mb-4">
        {USAGE_RANGES.map((item) => (
          <Button
            key={item}
            size="small"
            type={item === range ? "primary" : "default"}
            disabled={loading}
            onClick={() => void selectRange(item)}
          >
            {t(USAGE_RANGE_LABELS[item])}
          </Button>
        ))}
        {loading && <Spin size="small" />}
      </Flex>

      {totals.requests === 0 ? (
        <div className="py-16 text-center">
          <Typography.Text type="secondary">{t("该时间段内暂无用量")}</Typography.Text>
        </div>
      ) : (
        <div aria-busy={loading} className={loading ? "opacity-60" : undefined}>
          <UsageTotalsCards totals={totals} />
        </div>
      )}
    </main>
  );
}
