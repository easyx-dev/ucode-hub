/**
 * 客户端用户注册页面（TanStack Form + antd）
 * 集成图片验证码防护，禁用浏览器自动填充
 */

import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { Button, Card, Input, Typography } from "antd";
import { AutofillBlocker } from "#/components/AutofillBlocker";
import { CaptchaInput } from "#/components/client";
import { useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import { track } from "#/services/track/track";
import { getVisibleConfigsSFn } from "#/shared-services/config/config.functions";
import { toBool } from "#/utils/bool";
import { getDisplayErrorMessage } from "#/utils/error-utils";
import { sfnUnwrap } from "#/utils/sfn-error";
import { clientRegisterSFn } from "./-mods/register.functions";

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

function RegisterError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8">
      <Typography.Text type="danger">
        {getDisplayErrorMessage(error) ?? t("加载失败，请稍后重试")}
      </Typography.Text>
    </main>
  );
}

export const Route = createFileRoute("/register/")({
  beforeLoad: async () => {
    const [user, config] = await Promise.all([getCurrentClientSFn(), getVisibleConfigsSFn()]);
    if (user) {
      throw redirect({ to: "/" });
    }
    // 自助注册关闭时不进入注册页（服务端 clientRegister 有同一道闸，这里只是不让入口可达）
    if (!toBool(config.client_register_enabled)) {
      throw redirect({ to: "/login" });
    }
  },
  component: ClientRegisterPage,
  errorComponent: RegisterError,
});

function ClientRegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const form = useForm({
    defaultValues: { username: "", email: "", password: "", captcha: "" },
    onSubmit: async ({ value }) => {
      const [result] = await sfnUnwrap(clientRegisterSFn({ data: value }));
      if (!result) return;
      if (!result.success) {
        message.error(result.message || t("注册失败"));
        return;
      }
      message.success(t("注册成功"));
      track("Register", { form_name: "clientRegister" });
      track("FormSubmit", { form_name: "clientRegister" });
      navigate({ to: "/login" });
    },
  });

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8">
      <Card
        className="w-full max-w-sm"
        title={<div className="text-center text-lg">{t("用户注册")}</div>}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
          autoComplete="off"
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
                  autoComplete="off"
                  autoFocus
                />
              </FieldShell>
            )}
          </form.Field>

          <form.Field
            name="email"
            validators={{
              onChange: ({ value }) => {
                if (!value) return t("请输入邮箱");
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return t("邮箱格式不正确");
                return undefined;
              },
            }}
          >
            {(field) => (
              <FieldShell
                label={t("邮箱")}
                htmlFor={field.name}
                error={field.state.meta.isTouched ? field.state.meta.errors.join(", ") : undefined}
              >
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  autoComplete="off"
                />
              </FieldShell>
            )}
          </form.Field>

          <form.Field
            name="captcha"
            validators={{
              onChange: ({ value }) => {
                if (!value) return t("请输入验证码");
                if (value.length !== 6) return t("验证码为 6 位");
                return undefined;
              },
            }}
          >
            {(field) => (
              <FieldShell
                label={t("邮箱验证码")}
                htmlFor={field.name}
                error={field.state.meta.isTouched ? field.state.meta.errors.join(", ") : undefined}
              >
                <form.Subscribe>
                  {(state) => (
                    <CaptchaInput
                      email={state.values.email}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onMessage={(msg) => message.success(msg)}
                    />
                  )}
                </form.Subscribe>
              </FieldShell>
            )}
          </form.Field>

          <form.Field
            name="password"
            validators={{
              onChange: ({ value }) => {
                if (!value) return t("请输入密码");
                if (value.length < 6) return t("密码至少 6 位");
                return undefined;
              },
            }}
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
                  autoComplete="new-password"
                />
              </FieldShell>
            )}
          </form.Field>

          <form.Subscribe>
            {(state) => (
              <Button type="primary" htmlType="submit" block disabled={!state.canSubmit}>
                {state.isSubmitting ? t("注册中") : t("注册")}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <div className="mt-4 text-center">
          <Link to="/login">{t("返回登录")}</Link>
        </div>
      </Card>
    </main>
  );
}
