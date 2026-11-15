/**
 * AgentConfig Bundle（ACB）v1 的类型子集。
 *
 * 规范：https://github.com/vibeunion/agentconfig（MIT，Draft v1.5）
 * 我们只实现自己真正能落地的能力：models / prompts / agents / skills / mcp / resources。
 * 未知字段一律保留原样，未知能力名一律忽略而不是拒绝（规范要求）。
 */

export type AcbTrustMode = "self" | "shared" | "managed";

export type AcbMcpEntry = {
  name: string;
  enabled?: boolean;
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  envKeys?: string[];
  registryId?: string;
  repoUrl?: string;
  description?: string;
};

export type AcbModelType = "text" | "multimodal" | "image-generation" | "video-generation";

export type AcbModelEntry = {
  provider: string;
  id: string;
  alias?: string;
  maxTokens?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  modelType?: AcbModelType;
  generationModes?: string[];
  parameters?: Record<string, unknown>;
};

export type AcbSkillEntry = { id: string; enabled?: boolean; order?: number };
export type AcbPromptEntry = { id: string; title?: string };
export type AcbAgentEntry = {
  id: string;
  name?: string;
  model?: string;
  skillIds?: string[];
  /** 指向 pub.prompts 的条目，正文在 secret.customPrompts 里。 */
  promptId?: string;
};
export type AcbResourceEntry = { uri: string; name?: string; mimeType?: string };

export type AcbPublic = {
  mcp?: AcbMcpEntry[];
  models?: AcbModelEntry[];
  skills?: AcbSkillEntry[];
  prompts?: AcbPromptEntry[];
  agents?: AcbAgentEntry[];
  resources?: AcbResourceEntry[];
};

export type AcbPlainPayload = { alg: "none"; ct: string };
export type AcbEncryptedPayload = {
  alg: "PBKDF2-SHA256-AES-256-GCM";
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
};
export type AcbPayload = AcbPlainPayload | AcbEncryptedPayload;

export type AcbOAuthCredential = {
  type: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expired?: string;
  accountId?: string;
  email?: string;
  scope?: string;
  issuer?: string;
  clientId?: string;
  redirectUri?: string;
  extra?: Record<string, unknown>;
};

export type AcbProviderSecret = {
  apiKey?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  oauth?: AcbOAuthCredential;
  /** `sse` / `http` MCP 的远端地址（我们上游 PR #34 提议并已实现）。 */
  url?: string;
};

export type AcbSecret = {
  endpoints?: Record<string, string>;
  customPrompts?: Record<string, string>;
  providerHints?: Array<{ provider: string; baseUrl?: string }>;
  secrets?: Record<string, AcbProviderSecret>;
};

export type AcbBundle = {
  schema: "agentconfig-bundle";
  v: 1;
  created: number;
  label?: string;
  src?: string;
  trust: AcbTrustMode;
  capabilities: string[];
  hint?: string;
  payload: AcbPayload;
  pub: AcbPublic;
};

export type AcbBundleInput = Omit<AcbBundle, "schema" | "v" | "created" | "trust" | "capabilities" | "payload"> & {
  schema?: "agentconfig-bundle";
  v?: 1;
  created?: number;
  trust?: AcbTrustMode;
  capabilities?: string[];
  payload?: AcbPayload;
  pub: AcbPublic;
};