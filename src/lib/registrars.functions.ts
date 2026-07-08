import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";
import { getSecretPresence } from "./secrets.server";
import { listRegistrarCatalog } from "./registrar-catalog.server";
import {
  syncRegistrarDomains,
  type Registrar,
  type RegistrarDomainItem,
} from "./registrar-sync.server";
import {
  listPersistedRegistrarDomains,
  listPersistedRegistrarSyncJobs,
} from "./registrar-domain-store.server";

export type { Registrar, RegistrarDomainItem };

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
