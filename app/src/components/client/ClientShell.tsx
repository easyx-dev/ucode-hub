/**
 * 前台外壳：页头 / 内容 / 页脚 + 埋点初始化
 * 埋点在登录态就绪后初始化一次，保证首个 PageView 携带正确的 userId。
 */
import { useEffect, useRef } from "react";
import {
  setUserId,
  startRouteTracking,
  stopRouteTracking,
  init as trackInit,
} from "#/services/track/track";
import { useClientAuth } from "./ClientAuthProvider";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useClientAuth();
  const initialized = useRef(false);

  useEffect(() => {
    if (isLoading || initialized.current) return;
    initialized.current = true;

    setUserId(user?.id);
    trackInit({ autoPageView: true });
    startRouteTracking();

    return () => {
      stopRouteTracking();
    };
  }, [isLoading, user?.id]);

  // 登录 / 退出时同步 userId 到追踪 SDK
  useEffect(() => {
    if (isLoading) return;
    setUserId(user?.id);
  }, [isLoading, user?.id]);

  return (
    <>
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </>
  );
}
