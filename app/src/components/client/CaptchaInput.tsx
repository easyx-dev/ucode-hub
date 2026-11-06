/**
 * 邮箱验证码输入：输入框 + 获取验证码按钮（点击弹窗完成图片验证码校验后发送）
 */
import { Button, Input, Space } from "antd";
import { useCallback, useState } from "react";
import { ImageCaptchaModal } from "#/components/ImageCaptchaModal";
import {
  getImageCaptchaSFn,
  sendCaptchaWithImageVerificationSFn,
} from "#/services/captcha/captcha.functions";
import { callSfn } from "#/utils/sfn-error";

interface CaptchaInputProps {
  /** 邮箱地址 */
  email: string;
  /** 邮箱验证码值 */
  value: string;
  /** 邮箱验证码变化回调 */
  onChange: (value: string) => void;
  /** 状态消息回调（如「已发送」） */
  onMessage: (msg: string) => void;
}

export function CaptchaInput({ email, value, onChange, onMessage }: CaptchaInputProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const getCaptcha = useCallback(() => callSfn(getImageCaptchaSFn()), []);

  const verify = useCallback(
    async (token: string, code: string) => {
      if (!email) {
        return { success: false, message: "请先输入邮箱" };
      }
      return callSfn(
        sendCaptchaWithImageVerificationSFn({
          data: { email, imageToken: token, imageCode: code },
        }),
      );
    },
    [email],
  );

  return (
    <>
      <Space.Compact block>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="邮箱验证码"
          maxLength={6}
          autoComplete="off"
          aria-label="邮箱验证码"
        />
        <Button onClick={() => setModalOpen(true)}>获取验证码</Button>
      </Space.Compact>

      <ImageCaptchaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        getCaptcha={getCaptcha}
        verify={verify}
        onMessage={onMessage}
      />
    </>
  );
}
