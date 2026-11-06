/**
 * 前台「我的设备」：展示自己名下已登记的 UCode 实例
 * 未登录跳登录页；改名与吊销在卡片内就地完成（失败由统一出口提示）
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { Empty, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import type { DeviceListItem } from "#/services/device/device.server";
import { sfnUnwrap } from "#/utils/sfn-error";
import { DeviceCard } from "./devices/-mods/DeviceCard";
import {
  getMyDevicesSFn,
  renameMyDeviceSFn,
  revokeMyDeviceSFn,
} from "./devices/-mods/devices.functions";

export const Route = createFileRoute("/devices")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (!user) throw redirect({ to: "/login" });
  },
  loader: async () => getMyDevicesSFn(),
  component: DevicesPage,
});

function DevicesPage() {
  const { t } = useTranslation();
  const initial = Route.useLoaderData();
  const [devices, setDevices] = useState<DeviceListItem[]>(initial);

  const reload = async () => {
    const [list] = await sfnUnwrap(getMyDevicesSFn(), { error: t("加载失败，请稍后重试") });
    if (list) setDevices(list);
  };

  /** 改名：卡片只关心成功与否，成功提示与列表刷新在这里统一处理 */
  const handleRename = async (device: DeviceListItem, name: string): Promise<boolean> => {
    const [, err] = await sfnUnwrap(renameMyDeviceSFn({ data: { id: device.id, name } }));
    if (err) return false;
    message.success(t("设备已改名"));
    await reload();
    return true;
  };

  const handleRevoke = async (device: DeviceListItem): Promise<boolean> => {
    const [, err] = await sfnUnwrap(revokeMyDeviceSFn({ data: { id: device.id } }));
    if (err) return false;
    message.success(t("设备已吊销"));
    await reload();
    return true;
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-12">
      <header className="mb-6 sm:mb-8">
        <Typography.Title level={2} className="!mb-1">
          {t("我的设备")}
        </Typography.Title>
        <Typography.Text type="secondary">
          {t("共 {{total}} 台设备", { total: devices.length })}
        </Typography.Text>
      </header>

      {devices.length === 0 ? (
        <Empty description={t("暂无设备")} className="py-16" />
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onRename={(name) => handleRename(device, name)}
              onRevoke={() => handleRevoke(device)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
