/**
 * 客户端消息中心页面：分页展示消息，支持标记已读 / 删除；含「通知渠道设置」
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { Button, Card, Empty, Flex, Segmented, Tag, Typography } from "antd";
import { useCallback, useState } from "react";
import { NotifyChannelSettings } from "#/components/client/NotifyChannelSettings";
import { useTranslation } from "#/components/providers";
import { MESSAGE_TYPE_LABELS } from "#/constants/message-types";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import {
  deleteMyMessageSFn,
  getMyMessagesSFn,
  getMyUnreadCountSFn,
  markAllMyMessagesAsReadSFn,
  markMyMessageAsReadSFn,
} from "#/services/message/message.functions";
import type { MessageRecord } from "#/services/message/message.server";
import { sfnUnwrap } from "#/utils/sfn-error";

const PAGE_SIZE = 10;

type StatusFilter = "all" | "unread" | "read";

export const Route = createFileRoute("/messages")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (!user) throw redirect({ to: "/login" });
  },
  loader: async () => {
    const [result, unread] = await Promise.all([
      getMyMessagesSFn({ data: { page: 1 } }),
      getMyUnreadCountSFn(),
    ]);
    return { result, unread };
  },
  component: MessagesPage,
});

function MessagesPage() {
  const { t } = useTranslation();
  const initial = Route.useLoaderData();
  const [records, setRecords] = useState<MessageRecord[]>(initial.result.records);
  const [page, setPage] = useState(initial.result.page);
  const [total, setTotal] = useState(initial.result.total);
  const [unread, setUnread] = useState(initial.unread);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextPage: number, nextStatus: StatusFilter) => {
    setLoading(true);
    const [result] = await sfnUnwrap(
      getMyMessagesSFn({
        data: {
          page: nextPage,
          pageSize: PAGE_SIZE,
          status: nextStatus === "all" ? undefined : nextStatus,
        },
      }),
    );
    setLoading(false);
    if (!result) return;
    setRecords(result.records);
    setPage(result.page);
    setTotal(result.total);
  }, []);

  const refreshUnread = useCallback(async () => {
    // 未读数获取失败不阻塞操作，静默处理
    const [count] = await sfnUnwrap(getMyUnreadCountSFn(), { silent: true });
    if (count === null) return;
    setUnread(count);
  }, []);

  const handleMarkRead = async (id: string) => {
    const [, err] = await sfnUnwrap(markMyMessageAsReadSFn({ data: { id } }));
    if (err) return;
    setRecords((prev) => prev.map((item) => (item.id === id ? { ...item, status: "read" } : item)));
    await refreshUnread();
  };

  const handleMarkAllRead = async () => {
    const [, err] = await sfnUnwrap(markAllMyMessagesAsReadSFn());
    if (err) return;
    setRecords((prev) => prev.map((item) => ({ ...item, status: "read" })));
    await refreshUnread();
    message.success(t("已全部标记为已读"));
  };

  const handleDelete = async (id: string) => {
    const [result] = await sfnUnwrap(deleteMyMessageSFn({ data: { id } }));
    if (!result?.success) return;
    setRecords((prev) => prev.filter((item) => item.id !== id));
    setTotal((value) => Math.max(0, value - 1));
    await refreshUnread();
    message.success(t("已删除"));
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <Flex align="flex-start" justify="space-between" gap={12} className="mb-6">
        <div>
          <Typography.Title level={2} className="!mb-2">
            {t("消息中心")}
          </Typography.Title>
          <NotifyChannelSettings />
        </div>
        {unread > 0 && (
          <Button size="small" onClick={() => void handleMarkAllRead()}>
            {t("全部已读")}
          </Button>
        )}
      </Flex>

      <Segmented<StatusFilter>
        className="mb-4"
        value={status}
        onChange={(value) => {
          setStatus(value);
          void load(1, value);
        }}
        options={[
          { label: t("全部"), value: "all" },
          { label: `${t("未读")}${unread > 0 ? ` (${unread})` : ""}`, value: "unread" },
          { label: t("已读"), value: "read" },
        ]}
      />

      <div className="space-y-3" aria-busy={loading}>
        {records.map((record) => (
          <Card
            key={record.id}
            size="small"
            title={
              <Flex align="center" gap={8}>
                {record.status === "unread" && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
                <span className="truncate">{record.title}</span>
                <Tag>{MESSAGE_TYPE_LABELS[record.type] ?? record.type}</Tag>
              </Flex>
            }
            extra={
              <Typography.Text type="secondary" className="whitespace-nowrap text-xs">
                {new Date(record.createdAt).toLocaleString("zh-CN")}
              </Typography.Text>
            }
            actions={[
              record.status === "unread" ? (
                <Button
                  key="read"
                  type="link"
                  size="small"
                  onClick={() => void handleMarkRead(record.id)}
                >
                  {t("已读")}
                </Button>
              ) : null,
              <Button
                key="delete"
                type="link"
                size="small"
                danger
                onClick={() => void handleDelete(record.id)}
              >
                {t("删除")}
              </Button>,
            ].filter(Boolean)}
          >
            {record.content && (
              <Typography.Paragraph className="!mb-0 whitespace-pre-wrap" type="secondary">
                {record.content}
              </Typography.Paragraph>
            )}
          </Card>
        ))}

        {records.length === 0 && !loading && (
          <Empty description={t("暂无消息")} className="py-16" />
        )}
      </div>

      {total > PAGE_SIZE && (
        <Flex className="mt-6" justify="center" align="center" gap={12}>
          <Button
            size="small"
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1, status)}
          >
            {t("上一页")}
          </Button>
          <Typography.Text type="secondary">
            {page} / {pageCount}
          </Typography.Text>
          <Button
            size="small"
            disabled={page >= pageCount || loading}
            onClick={() => void load(page + 1, status)}
          >
            {t("下一页")}
          </Button>
        </Flex>
      )}
    </main>
  );
}
