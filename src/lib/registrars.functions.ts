import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";
import { getSecretPresence } from "./secrets.server";
import { listRegistrarCatalog } from "./registrar-catalog.server";
import { recordOperationLog } from "./operation-log.server";
import {
  previewRegistrarDomains,
  syncRegistrarDomains,
  type Registrar,
  type RegistrarDomainItem,
  type RegistrarSyncPreview,
} from "./registrar-sync.server";
import {
  listPersistedRegistrarDomains,
  listPersistedRegistrarSyncJobs,
} from "./registrar-domain-store.server";

export type { Registrar, RegistrarDomainItem, RegistrarSyncPreview };

export const getTokenStatus = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    const p = await getSecretPresence();
    const status: Record<string, boolean | undefined> = {
      cloudflare: p.CLOUDFLARE_API_TOKEN,
      spaceship: p.SPACESHIP_API_KEY && p.SPACESHIP_API_SECRET,
      dynadot: p.DYNADOT_API_KEY,
      porkbun: p.PORKBUN_API_KEY && p.PORKBUN_SECRET_API_KEY,
      namecheap: p.NAMECHEAP_API_USER && p.NAMECHEAP_API_KEY && p.NAMECHEAP_CLIENT_IP,
      aliyun: p.ALIYUN_ACCESS_KEY_ID && p.ALIYUN_ACCESS_KEY_SECRET,
      tencent: p.TENCENT_SECRET_ID && p.TENCENT_SECRET_KEY,
      west: p.WEST_USERNAME && p.WEST_API_PASSWORD,
    };
    const catalog = await listRegistrarCatalog();
    for (const row of catalog) {
      const required = row.credentialFields.filter((field) => !field.optional);
      if (required.length === 0) continue;
      status[row.id] = required.every((field) => Boolean(p[field.key]));
    }
    return status;
  });

export const listRegistrarDomains = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { registrar: Registrar; accountId?: string }) => d)
  .handler(async ({ data }) => {
    return syncRegistrarDomains(data);
  });

export const previewRegistrarSync = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { registrar: Registrar; accountId?: string }) => d)
  .handler(async ({ data }) => {
    const result = await previewRegistrarDomains(data);
    await recordOperationLog({
      category: "registrar",
      action: "registrar.sync_preview",
      title: "预检注册商同步端点",
      detail: `${data.registrar} 返回 ${result.count} 个可识别域名`,
      entityType: "registrar",
      entityId: data.registrar,
      severity: result.count > 0 ? "success" : "warning",
      metadata: {
        registrar: data.registrar,
        count: result.count,
        warnings: result.warnings.length,
      },
    });
    return result;
  });

export const listPersistedDomains = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    return { rows: await listPersistedRegistrarDomains() };
  });

export const listRegistrarSyncJobs = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    return { rows: await listPersistedRegistrarSyncJobs() };
  });
