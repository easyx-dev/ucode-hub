/**
 * 客户端用户登录页面（TanStack Form + antd）
 */

import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { Button, Card, Input, Typography } from "antd";
import { AutofillBlocker } from "#/components/AutofillBlocker";
import { useClientAuth } from "#/components/client";
import { useGlobalStore, useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import { track } from "#/services/track/track";
import { toBool } from "#/utils/bool";
import { getDisplayErrorMessage } from "#/utils/error-utils";
import { sfnUnwrap } from "#/utils/sfn-error";
import { clientLoginSFn } from "./-mods/login.functions";

/** 表单内单项的标签 + 控件 + 校验提示 */
function FieldShell({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
    </div>
  );
}

function LoginError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8">
      <Typography.Text type="danger">
        {getDisplayErrorMessage(error) ?? t("加载失败，请稍后重试")}
      </Typography.Text>
    </main>
  );
}

export const Route = createFileRoute("/login/")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (user) {
      throw redirect({ to: "/" });
    }
  },
  component: ClientLoginPage,
  errorComponent: LoginError,
});

function ClientLoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { refetch } = useClientAuth();
  const { systemConfig } = useGlobalStore();
  // 注册入口跟随站点开关：关闭时整条提示不渲染，登录页本身不受影响
  const isRegisterEnabled = toBool(systemConfig.client_register_enabled);

  const form = useForm({
    defaultValues: { username: "", password: "" },
    onSubmit: async ({ value }) => {
      const [result] = await sfnUnwrap(clientLoginSFn({ data: value }));
      if (!result) return;
      if (!result.success) {
        message.error(result.message || t("登录失败"));
        return;
      }
      refetch();
      message.success(t("登录成功"));
      track("Login", { form_name: "clientLogin" });
      track("FormSubmit", { form_name: "clientLogin" });
      navigate({ to: "/" });
    },
  });

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8">
      <Card
        className="w-full max-w-sm"
        title={<div className="text-center text-lg">{t("用户登录")}</div>}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <AutofillBlocker />
          <form.Field
            name="username"
            validators={{ onChange: ({ value }) => (!value ? t("请输入用户名") : undefined) }}
          >
            {(field) => (
              <FieldShell
                label={t("用户名")}
                htmlFor={field.name}
                error={field.state.meta.isTouched ? field.state.meta.errors.join(", ") : undefined}
              >
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  autoFocus
                />
              </FieldShell>
            )}
          </form.Field>

          <form.Field
            name="password"
            validators={{ onChange: ({ value }) => (!value ? t("请输入密码") : undefined) }}
          >
            {(field) => (
              <FieldShell
                label={t("密码")}
                htmlFor={field.name}
                error={field.state.meta.isTouched ? field.state.meta.errors.join(", ") : undefined}
              >
                <Input.Password
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </FieldShell>
            )}
          </form.Field>

          <form.Subscribe>
            {(state) => (
              <Button type="primary" htmlType="submit" block disabled={!state.canSubmit}>
                {state.isSubmitting ? t("登录中") : t("登录")}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <div className="mt-4 space-y-1 text-center">
          <div>
            <Link to="/forgot-password">{t("忘记密码？")}</Link>
          </div>
          {isRegisterEnabled && (
            <div>
              {t("还没有账号？")} <Link to="/register">{t("立即注册")}</Link>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
