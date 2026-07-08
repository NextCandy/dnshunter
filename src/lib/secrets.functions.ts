import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";
import { getSecretPresence, setSecrets } from "./secrets.server";

// 返回每个凭证字段「是否已配置」（文件或环境变量），不含明文。
export const getSecretsStatus = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    return { presence: await getSecretPresence() };
  });

// 保存凭证：入参为 { 字段名: 值 }。非空 = 设置，空串 = 清除。仅白名单字段生效。
export const saveSecrets = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: Record<string, unknown>) => {
    const clean: Record<string, string> = {};
    for (const [key, v] of Object.entries(d)) {
      if (typeof v === "string") clean[key] = v;
    }
    return clean;
  })
  .handler(async ({ data }) => {
    await setSecrets(data);
    return { ok: true as const, presence: await getSecretPresence() };
  });
