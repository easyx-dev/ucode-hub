/**
 * 图片验证码弹窗：SVG 验证码展示 + 刷新 + 输入 + 校验
 * 验证码的获取与校验经回调注入，由宿主决定数据来源；失败提示走弹窗内文案，不打断表单
 */
import { ReloadOutlined } from "@ant-design/icons";
import { Button, Flex, Input, Modal, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";

/** 获取图片验证码回调，返回 SVG 与一次性的校验 token */
export type GetCaptchaFn = () => Promise<{ svg: string; token: string }>;

/** 校验图片验证码回调，返回成功与否及提示信息 */
export type VerifyCaptchaFn = (
  token: string,
  code: string,
) => Promise<{ success: boolean; message: string }>;

interface ImageCaptchaModalProps {
  /** 弹窗是否可见 */
  open: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 获取图片验证码回调（宿主注入，如对接 getImageCaptchaSFn） */
  getCaptcha: GetCaptchaFn;
  /** 校验图片验证码回调（宿主注入，如对接 sendCaptchaWithImageVerificationSFn） */
  verify: VerifyCaptchaFn;
  /** 弹窗外错误提示回调（如验证码加载失败） */
  onError?: (message: string) => void;
  /** 状态消息回调（如发送成功提示） */
  onMessage?: (message: string) => void;
}

export function ImageCaptchaModal({
  open,
  onClose,
  getCaptcha,
  verify,
  onError,
  onMessage,
}: ImageCaptchaModalProps) {
  const [svg, setSvg] = useState("");
  const [imageToken, setImageToken] = useState("");
  const [imageCode, setImageCode] = useState("");
  const [isLoadingSvg, setIsLoadingSvg] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [modalError, setModalError] = useState("");

  /**
   * 刷新图片验证码
   * 不清空错误文案：校验失败分支是「先写错误文案再刷新图片」，若此处清空会让失败提示闪失；
   * 文案改由打开弹窗与下次提交覆盖
   */
  const refresh = useCallback(async () => {
    setIsLoadingSvg(true);
    try {
      const result = await getCaptcha();
      setSvg(result.svg);
      setImageToken(result.token);
      setImageCode("");
    } catch {
      onError?.("验证码加载失败，请稍后重试");
    } finally {
      setIsLoadingSvg(false);
    }
  }, [getCaptcha, onError]);

  // 以 ref 持有最新实现：父级重渲染换了回调也不重新拉取，只在弹窗打开时刷新一次
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!open) return;
    setModalError("");
    void refreshRef.current();
  }, [open]);

  /** 确定：校验图片验证码，成功后关闭并回传提示 */
  const handleConfirm = async () => {
    if (!imageCode) {
      setModalError("请输入图片验证码");
      return;
    }
    setModalError("");
    setIsSending(true);
    try {
      const result = await verify(imageToken, imageCode);
      if (result.success) {
        onMessage?.(result.message);
        onClose();
      } else {
        setModalError(result.message);
        await refresh();
      }
    } catch {
      setModalError("请求失败");
      await refresh();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      open={open}
      title="请输入图片验证码"
      width={360}
      onCancel={onClose}
      onOk={() => void handleConfirm()}
      confirmLoading={isSending}
      okText="确定"
      cancelText="取消"
      destroyOnHidden
    >
      <Flex vertical gap={12} className="pt-2">
        {modalError && <Typography.Text type="danger">{modalError}</Typography.Text>}
        <Flex gap={8} align="center">
          {/* 点击图片刷新：SVG 由服务端生成，宿主按原样渲染 */}
          <button
            type="button"
            title="点击刷新图片验证码"
            onClick={() => void refresh()}
            className="flex h-10 w-[120px] cursor-pointer items-center justify-center overflow-hidden border border-border bg-background"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <Button
            icon={<ReloadOutlined spin={isLoadingSvg} />}
            loading={isLoadingSvg}
            onClick={() => void refresh()}
            aria-label="刷新图片验证码"
          />
          <Input
            value={imageCode}
            onChange={(event) => setImageCode(event.target.value)}
            onPressEnter={() => void handleConfirm()}
            placeholder="图片验证码"
            maxLength={4}
            autoFocus
            aria-label="图片验证码"
          />
        </Flex>
      </Flex>
    </Modal>
  );
}
