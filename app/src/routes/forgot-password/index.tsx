/**
 * 客户端用户忘记密码页面（TanStack Form + antd）
 * 通过邮箱验证码重置密码
 */

import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { message } from "@ucode/hub-ui-spa/antd-static";
import { Button, Card, Input, Typography } from "antd";
import { AutofillBlocker } from "#/components/AutofillBlocker";
import { CaptchaInput } from "#/components/client";
import { useTranslation } from "#/components/providers";
import { getCurrentClientSFn } from "#/services/client-auth/client-auth.functions";
import { getDisplayErrorMessage } from "#/utils/error-utils";
import { sfnUnwrap } from "#/utils/sfn-error";
import { resetPwdSFn } from "./-mods/forgot-password.functions";

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

function ForgotPasswordError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8">
      <Typography.Text type="danger">
        {getDisplayErrorMessage(error) ?? t("加载失败，请稍后重试")}
      </Typography.Text>
    </main>
  );
}

export const Route = createFileRoute("/forgot-password/")({
  beforeLoad: async () => {
    const user = await getCurrentClientSFn();
    if (user) {
      throw redirect({ to: "/" });
    }
  },
  component: ForgotPasswordPage,
  errorComponent: ForgotPasswordError,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const form = useForm({
    defaultValues: { email: "", captcha: "", password: "", confirmPassword: "" },
    onSubmit: async ({ value }) => {
      const [result] = await sfnUnwrap(resetPwdSFn({ data: value }));
      if (!result) return;
      if (!result.success) {
        message.error(result.message || t("重置失败"));
        return;
      }
      message.success(result.message);
      navigate({ to: "/login" });
    },
  });

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8">
      <Card
        className="w-full max-w-sm"
        title={<div className="text-center text-lg">{t("忘记密码")}</div>}
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
                  placeholder="user@example.com"
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
                if (!value) return t("请输入新密码");
                if (value.length < 6) return t("密码至少 6 位");
                return undefined;
              },
            }}
          >
            {(field) => (
              <FieldShell
                label={t("新密码")}
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

          <form.Field
            name="confirmPassword"
            validators={{
              onChange: ({ value }) => (!value ? t("请确认新密码") : undefined),
            }}
          >
            {(field) => (
              <FieldShell
                label={t("确认新密码")}
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
                {state.isSubmitting ? t("重置中") : t("重置密码")}
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
