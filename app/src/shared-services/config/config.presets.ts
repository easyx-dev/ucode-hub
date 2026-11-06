/**
 * 预置系统配置常量：仅服务端启动时自动插入的配置项（纯数据，无副作用）
 * 由 config.server.ts 的 ensurePresetConfigs 消费，保证预置项幂等可控
 */
import type { EditorType } from "#/constants/editor-types";

/** 预置系统配置常量类型 */
export interface PresetConfig {
  key: string;
  value: string;
  description: string;
  clientVisible: boolean;
  valueType: EditorType;
  groupName: string;
  /** 敏感配置：值以密文入库、管理端脱敏展示；仅用于真正的字符串密钥类配置 */
  isSecret?: boolean;
}

/** 预置系统配置常量（仅服务端启动时自动插入的配置项） */
export const PRESET_CONFIGS: PresetConfig[] = [
  {
    key: "site_name",
    value: "HUB",
    description: "站点名称",
    clientVisible: true,
    valueType: "input",
    groupName: "站点设置",
  },
  {
    key: "keywords",
    value: "",
    description: "SEO head 关键词",
    clientVisible: true,
    valueType: "text",
    groupName: "站点设置",
  },
  {
    key: "description",
    value: "",
    description: "SEO head 站点描述",
    clientVisible: true,
    valueType: "text",
    groupName: "站点设置",
  },
  {
    key: "company_address",
    value: "",
    description: "公司地址",
    clientVisible: true,
    valueType: "text",
    groupName: "站点设置",
  },
  {
    key: "company_tell",
    value: "",
    description: "公司电话",
    clientVisible: true,
    valueType: "input",
    groupName: "站点设置",
  },
  {
    key: "company_email",
    value: "",
    description: "公司邮箱",
    clientVisible: true,
    valueType: "input",
    groupName: "站点设置",
  },
  {
    key: "smtp_host",
    value: "",
    description: "SMTP 服务器地址",
    clientVisible: false,
    valueType: "input",
    groupName: "邮件设置",
  },
  {
    key: "smtp_port",
    value: "",
    description: "SMTP 端口",
    clientVisible: false,
    valueType: "number",
    groupName: "邮件设置",
  },
  {
    key: "smtp_secure",
    value: "false",
    description: "是否使用 SSL/TLS",
    clientVisible: false,
    valueType: "boolean",
    groupName: "邮件设置",
  },
  {
    key: "smtp_user",
    value: "",
    description: "SMTP 用户名",
    clientVisible: false,
    valueType: "input",
    groupName: "邮件设置",
  },
  {
    key: "smtp_pass",
    value: "",
    description: "SMTP 密码",
    clientVisible: false,
    valueType: "input",
    groupName: "邮件设置",
    isSecret: true,
  },
  {
    key: "smtp_from",
    value: "",
    description: "发件人邮箱地址",
    clientVisible: false,
    valueType: "input",
    groupName: "邮件设置",
  },
  {
    key: "ai_providers",
    value: "{}",
    description:
      "AI 厂商配置（对象 JSON）：{ [厂商id]: { name, baseUrl, apiKey, default?, models: { [模型名]: { name?, default?, contextLimit?, outputLimit?, jsonOutput?, toolCalls?, reasoning?, input?, output? } } } }，底层走 OpenAI 兼容协议",
    clientVisible: false,
    valueType: "json",
    groupName: "AI设置",
  },
  {
    key: "sms_provider",
    value: "",
    description: "短信服务商（aliyun = 阿里云，留空禁用）",
    clientVisible: false,
    valueType: "input",
    groupName: "短信设置",
  },
  {
    key: "sms_aliyun_access_key_id",
    value: "",
    description: "阿里云 AccessKey ID",
    clientVisible: false,
    valueType: "input",
    groupName: "短信设置",
  },
  {
    key: "sms_aliyun_access_key_secret",
    value: "",
    description: "阿里云 AccessKey Secret",
    clientVisible: false,
    valueType: "input",
    groupName: "短信设置",
    isSecret: true,
  },
  {
    key: "sms_aliyun_sign_name",
    value: "",
    description: "阿里云短信签名",
    clientVisible: false,
    valueType: "input",
    groupName: "短信设置",
  },
  {
    key: "sms_aliyun_template_code",
    value: "",
    description: "阿里云短信模板码",
    clientVisible: false,
    valueType: "input",
    groupName: "短信设置",
  },
  {
    key: "client_register_enabled",
    value: "false",
    description:
      "是否开放客前台自助注册：关闭后注册接口与注册页一并不可用（已存在的账号不受影响）。单机 / 私人部署建议保持关闭",
    clientVisible: true,
    valueType: "boolean",
    groupName: "站点设置",
  },
  {
    key: "notify_enabled",
    value: "false",
    description:
      "通知外发渠道总闸：关闭后所有外发渠道（邮件/飞书/企微/钉钉/通用 webhook）一律不发送，站内信不受影响",
    clientVisible: false,
    valueType: "boolean",
    groupName: "通知设置",
  },
];
