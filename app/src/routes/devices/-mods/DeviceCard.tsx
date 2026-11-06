/**
 * 前台设备卡片：单台设备的展示与就地操作（改名 / 吊销）
 *
 * 改名与吊销的中间态（编辑中、待确认）由卡片自持，父级只负责调接口与刷新列表：
 * 操作结果回给「是否成功」，卡片据此收起自己的中间态。
 */
import { Button, Card, Descriptions, Flex, Input, Popconfirm, Space, Tag, Typography } from "antd";
import { useRef, useState } from "react";
import { useTranslation } from "#/components/providers";
import { DEVICE_ONLINE_LABELS, DEVICE_STATUS_LABELS, deviceAccessPath } from "#/constants/device";
import type { DeviceListItem } from "#/services/device/device.server";

/** 时间统一展示，避免手工拼格式 */
const formatTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString("zh-CN") : "—";

interface DeviceCardProps {
  device: DeviceListItem;
  /** 改名：返回是否成功 */
  onRename: (name: string) => Promise<boolean>;
  /** 吊销：返回是否成功 */
  onRevoke: () => Promise<boolean>;
}

export function DeviceCard({ device, onRename, onRevoke }: DeviceCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // 吊销请求在飞：期间忽略 antd 的关闭请求，失败时把确认面板留在原地供重试
  const revokingRef = useRef(false);

  const isActive = device.status === "active";
  // 只能打开正在隧道上且在线的设备：离线时中继直接回 502，给了入口只会点出错误
  const canOpen = isActive && device.online;

  const submitRename = async () => {
    setBusy(true);
    const ok = await onRename(draft.trim());
    setBusy(false);
    if (ok) setEditing(false);
  };

  const submitRevoke = async () => {
    revokingRef.current = true;
    setBusy(true);
    const ok = await onRevoke();
    setBusy(false);
    revokingRef.current = false;
    if (ok) setConfirming(false);
  };

  return (
    <Card
      size="small"
      title={<span className="truncate">{device.name}</span>}
      extra={
        <Space size={4}>
          {!isActive && <Tag color="error">{t(DEVICE_STATUS_LABELS.revoked)}</Tag>}
          <Tag color={device.online ? "success" : "default"}>
            {device.online ? t(DEVICE_ONLINE_LABELS.online) : t(DEVICE_ONLINE_LABELS.offline)}
          </Tag>
        </Space>
      }
    >
      <Descriptions
        size="small"
        column={{ xs: 2, sm: 2, md: 4 }}
        items={[
          { key: "platform", label: t("平台"), children: device.platform ?? "—" },
          { key: "version", label: t("版本"), children: device.clientVersion ?? "—" },
          { key: "lastSeen", label: t("最近活跃"), children: formatTime(device.lastSeenAt) },
          { key: "created", label: t("创建时间"), children: formatTime(device.createdAt) },
        ]}
      />

      {editing ? (
        <Flex className="mt-4" gap={8} wrap>
          <Input
            value={draft}
            maxLength={100}
            placeholder={t("设备名")}
            className="min-w-0 flex-1"
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={() => draft.trim() && void submitRename()}
          />
          <Button
            type="primary"
            size="small"
            disabled={busy || draft.trim() === ""}
            onClick={() => void submitRename()}
          >
            {t("保存")}
          </Button>
          <Button
            size="small"
            disabled={busy}
            onClick={() => {
              setDraft(device.name);
              setEditing(false);
            }}
          >
            {t("取消")}
          </Button>
        </Flex>
      ) : (
        <Flex className="mt-4" gap={8} wrap justify="end">
          {canOpen && (
            <Button
              type="primary"
              size="small"
              href={deviceAccessPath(device.id)}
              target="_blank"
              rel="noreferrer"
              title={t("经中继打开设备上的 UCode")}
            >
              {t("打开")}
            </Button>
          )}
          <Button
            size="small"
            onClick={() => {
              setDraft(device.name);
              setEditing(true);
            }}
          >
            {t("改名")}
          </Button>
          {isActive && (
            <Popconfirm
              open={confirming}
              title={t("吊销设备")}
              description={
                <Typography.Text className="text-xs">
                  {t("吊销后该设备立即断开且令牌失效，需重新登记才能再次连接。")}
                </Typography.Text>
              }
              okText={t("确认吊销")}
              cancelText={t("取消")}
              okButtonProps={{ danger: true, loading: busy }}
              onOpenChange={(next) => {
                if (!next && revokingRef.current) return;
                setConfirming(next);
              }}
              onConfirm={() => void submitRevoke()}
            >
              <Button size="small" danger>
                {t("吊销")}
              </Button>
            </Popconfirm>
          )}
        </Flex>
      )}
    </Card>
  );
}
