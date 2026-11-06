/**
 * 客户端「通知渠道设置」面板：用户配置自己接收的外发渠道（邮件/飞书/企微/钉钉/通用 Webhook）
 */
import { message } from "@ucode/hub-ui-spa/antd-static";
import { Button, Card, Checkbox, Input, Space, Typography } from "antd";
import { useState } from "react";
import type { UserNotifyChannels } from "#/db/schema";
import {
  getMyNotifyChannelsSFn,
  saveMyNotifyChannelsSFn,
} from "#/services/message/message.functions";
import { callSfn, sfnUnwrap } from "#/utils/sfn-error";

/** 渠道展示配置：是否支持 secret 输入框 */
const CHANNELS: {
  key: keyof UserNotifyChannels;
  label: string;
  hint: string;
  hasSecret: boolean;
}[] = [
  { key: "email", label: "邮件", hint: "接收邮箱地址", hasSecret: false },
  { key: "feishu", label: "飞书", hint: "飞书群机器人 Webhook 地址", hasSecret: true },
  { key: "wecom", label: "企业微信", hint: "企业微信群机器人 Webhook 地址", hasSecret: true },
  { key: "dingtalk", label: "钉钉", hint: "钉钉群自定义机器人 Webhook 地址", hasSecret: true },
  { key: "webhook", label: "通用 Webhook", hint: "自定义 Webhook 地址", hasSecret: true },
];

export function NotifyChannelSettings() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState<UserNotifyChannels>({});
  const [loading, setLoading] = useState(false);

  const openPanel = async () => {
    setOpen(true);
    if (Object.keys(channels).length > 0) return;
    setLoading(true);
    const [data] = await sfnUnwrap(getMyNotifyChannelsSFn(), { error: "加载通知设置失败" });
    if (data !== null) setChannels(data);
    setLoading(false);
  };

  const setChannel = (
    key: keyof UserNotifyChannels,
    patch: Partial<NonNullable<UserNotifyChannels[typeof key]>>,
  ) => {
    setChannels((prev) => ({
      ...prev,
      [key]: { enabled: false, ...prev[key], ...patch },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await callSfn(saveMyNotifyChannelsSFn({ data: channels }), {
        error: "保存失败，请稍后重试",
      });
      message.success("已保存通知设置");
    } catch {
      // callSfn 已提示
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Button size="small" onClick={() => void openPanel()}>
        通知渠道设置
      </Button>

      {open && (
        <Card
          className="mt-3"
          title="通知渠道"
          extra={
            <Button size="small" type="text" onClick={() => setOpen(false)}>
              收起
            </Button>
          }
        >
          <Space direction="vertical" size={12} className="w-full">
            <Typography.Text type="secondary">
              启用并填写目标地址后，系统才会通过该渠道向你推送通知（总闸关闭时全部不发送）。
            </Typography.Text>
            {CHANNELS.map((channel) => {
              const config = channels[channel.key];
              return (
                <div key={channel.key} className="border border-border p-3">
                  <Checkbox
                    checked={config?.enabled ?? false}
                    disabled={loading}
                    onChange={(event) => setChannel(channel.key, { enabled: event.target.checked })}
                  >
                    {channel.label}
                    <Typography.Text type="secondary" className="ml-2 text-xs">
                      {channel.hint}
                    </Typography.Text>
                  </Checkbox>
                  <Space direction="vertical" size={6} className="mt-2 w-full">
                    <Input
                      placeholder={channel.key === "email" ? "邮箱地址" : "Webhook 地址"}
                      value={config?.value ?? ""}
                      disabled={loading}
                      onChange={(event) => setChannel(channel.key, { value: event.target.value })}
                    />
                    {channel.hasSecret && (
                      <Input
                        placeholder="签名密钥（选填）"
                        value={config?.secret ?? ""}
                        disabled={loading}
                        onChange={(event) =>
                          setChannel(channel.key, { secret: event.target.value })
                        }
                      />
                    )}
                  </Space>
                </div>
              );
            })}
            <div className="flex justify-end">
              <Button
                size="small"
                type="primary"
                loading={saving}
                onClick={() => void handleSave()}
              >
                保存
              </Button>
            </div>
          </Space>
        </Card>
      )}
    </div>
  );
}
