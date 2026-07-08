import { normalizeDomain } from "./domain-utils";
import { resolveDomainsNameservers, type NameserverStatus } from "./nameservers.server";
import { listRegistrarCatalog, type RegistrarCatalogItem } from "./registrar-catalog.server";
import {
  recordRegistrarSyncFailure,
  syncRegistrarDomainsToStore,
  type SyncableRegistrarDomain,
} from "./registrar-domain-store.server";

export type Registrar = string;

type BuiltinRegistrar =
  | "spaceship"
  | "dynadot"
  | "porkbun"
  | "cf-registrar"
  | "namecheap"
  | "aliyun"
  | "tencent"
  | "west";

export const BUILTIN_REGISTRAR_IDS: readonly BuiltinRegistrar[] = [
  "spaceship",
  "dynadot",
  "porkbun",
  "cf-registrar",
  "namecheap",
  "aliyun",
  "tencent",
  "west",
];

export type RegistrarDomainItem = SyncableRegistrarDomain & {
  domain: string;
  nameservers: string[];
  nsStatus: NameserverStatus;
  nsProvider?: string;
  nsError?: string;
};

type RawRegistrarDomain = string | (Partial<SyncableRegistrarDomain> & Record<string, unknown>);

function isBuiltinRegistrar(registrar: Registrar): registrar is BuiltinRegistrar {
  return BUILTIN_REGISTRAR_IDS.includes(registrar as BuiltinRegistrar);
}

async function fetchBuiltinRawDomains(registrar: BuiltinRegistrar, accountId?: string) {
  if (registrar === "spaceship") {
    const { spaceshipListDomains } = await import("./registrars/spaceship.server");
    return spaceshipListDomains();
  }
  if (registrar === "dynadot") {
    const { dynadotListDomains } = await import("./registrars/dynadot.server");
    return dynadotListDomains();
  }
  if (registrar === "porkbun") {
    const { porkbunListDomains } = await import("./registrars/porkbun.server");
    return porkbunListDomains();
  }
  if (registrar === "cf-registrar") {
    if (!accountId) throw new Error("需要 accountId");
    const { cfRegListDomains } = await import("./registrars/cf-registrar.server");
    return cfRegListDomains(accountId);
  }
  if (registrar === "namecheap") {
    const { namecheapListDomains } = await import("./registrars/namecheap.server");
    return namecheapListDomains();
  }
  if (registrar === "aliyun") {
    const { aliyunListDomains } = await import("./registrars/aliyun.server");
    return aliyunListDomains();
  }
  if (registrar === "tencent") {
    const { tencentListDomains } = await import("./registrars/tencent.server");
    return tencentListDomains();
  }
  if (registrar === "west") {
    const { westListDomains } = await import("./registrars/west.server");
    return westListDomains();
  }
  return [];
}

async function fetchCustomRawDomains(registrar: Registrar): Promise<RawRegistrarDomain[]> {
  const catalog = await listRegistrarCatalog();
  const row = catalog.find((item) => item.id === registrar && item.active);
  if (!row) throw new Error("注册商无效或已停用");
  if (!row.supportsSync || !row.syncEndpointUrl) {
    throw new Error("该注册商尚未配置可用的 REST 同步端点");
  }
  if (row.syncStrategy !== "rest") {
    throw new Error("当前仅支持自定义注册商 REST 同步端点");
  }

  const context = await buildSecretTemplateContext(row);
  const headers = new Headers({ Accept: "application/json" });
  for (const header of row.syncHeaders) {
    headers.set(header.key, renderTemplate(header.value, context));
  }

  const body = row.syncBodyTemplate ? renderTemplate(row.syncBodyTemplate, context) : undefined;
  const response = await fetch(renderTemplate(row.syncEndpointUrl, context), {
    method: row.syncMethod,
    headers,
    body: row.syncMethod === "POST" ? body : undefined,
  });
  if (!response.ok) {
    throw new Error(`${row.name} 同步端点返回 ${response.status}`);
  }

  const json = await response.json();
  const items = extractResponseItems(json, row.syncResponsePath);
  const domainField = row.syncDomainField;
  if (!domainField) return items;
  return items.map((item) => {
    if (!item || typeof item !== "object") return item;
    const domain = readPath(item, domainField);
    return typeof domain === "string" ? { ...item, domain } : item;
  });
}

async function buildSecretTemplateContext(row: RegistrarCatalogItem) {
  const { getSecretValue } = await import("./secrets.server");
  const pairs = await Promise.all(
    row.credentialFields.map(
      async (field) => [field.key, await getSecretValue(field.key)] as const,
    ),
  );
  return Object.fromEntries(pairs.filter(([, value]) => value)) as Record<string, string>;
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => values[key] ?? "");
}

function extractResponseItems(json: unknown, path?: string): RawRegistrarDomain[] {
  const selected = path ? readPath(json, path) : autoSelectItems(json);
  if (!Array.isArray(selected)) throw new Error("同步端点响应不是数组，请配置响应路径");
  return selected as RawRegistrarDomain[];
}

function autoSelectItems(json: unknown): unknown {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return json;
  const source = json as Record<string, unknown>;
  for (const key of ["domains", "items", "results"]) {
    if (Array.isArray(source[key])) return source[key];
  }
  if (source.data && typeof source.data === "object") {
    const data = source.data as Record<string, unknown>;
    for (const key of ["domains", "items", "results"]) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return json;
}

function readPath(value: unknown, path: string) {
  return path
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<unknown>((current, part) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[part];
    }, value);
}

async function fetchRawDomains(
  registrar: Registrar,
  accountId?: string,
): Promise<RawRegistrarDomain[]> {
  if (isBuiltinRegistrar(registrar)) return fetchBuiltinRawDomains(registrar, accountId);
  return fetchCustomRawDomains(registrar);
}

export async function pullRegistrarDomainItems(input: {
  registrar: Registrar;
  accountId?: string;
}): Promise<RegistrarDomainItem[]> {
  const raw = await fetchRawDomains(input.registrar, input.accountId);
  const byDomain = new Map<string, SyncableRegistrarDomain>();
  for (const row of raw) {
    const normalized = normalizeRawItem(row);
    if (normalized) byDomain.set(normalized.domain, normalized);
  }

  const domains = [...byDomain.keys()].sort();
  const nsMap = await resolveDomainsNameservers(domains);
  return domains.map((domain) => {
    const item = byDomain.get(domain);
    const ns = nsMap.get(domain);
    return {
      domain,
      nameservers: item?.nameservers ?? ns?.nameservers ?? [],
      nsStatus: item?.nsStatus ?? ns?.nsStatus ?? "unknown",
      nsProvider: item?.nsProvider ?? ns?.nsProvider,
      nsError: item?.nsError ?? ns?.nsError,
      status: item?.status,
      registeredAt: item?.registeredAt,
      expiresAt: item?.expiresAt,
      daysRemaining: item?.daysRemaining,
      autoRenew: item?.autoRenew,
      domainLock: item?.domainLock,
      privacyProtection: item?.privacyProtection,
    };
  });
}

function normalizeRawItem(item: RawRegistrarDomain): SyncableRegistrarDomain | null {
  if (typeof item === "string") {
    const domain = normalizeDomain(item);
    return domain ? { domain } : null;
  }
  if (!item || typeof item !== "object") return null;
  const domain = normalizeDomain(
    String(item.domain ?? item.name ?? item.fqdn ?? item.domainName ?? ""),
  );
  if (!domain) return null;
  const nameservers = Array.isArray(item.nameservers)
    ? item.nameservers.map(String).filter(Boolean)
    : Array.isArray(item.nameServers)
      ? item.nameServers.map(String).filter(Boolean)
      : undefined;
  return {
    domain,
    nameservers,
    nsStatus:
      item.nsStatus === "cloudflare" || item.nsStatus === "other" || item.nsStatus === "unknown"
        ? item.nsStatus
        : undefined,
    nsProvider: typeof item.nsProvider === "string" ? item.nsProvider : undefined,
    nsError: typeof item.nsError === "string" ? item.nsError : undefined,
    status:
      item.status === "normal" ||
      item.status === "expiring" ||
      item.status === "expired" ||
      item.status === "error" ||
      item.status === "unknown"
        ? item.status
        : undefined,
    registeredAt: typeof item.registeredAt === "string" ? item.registeredAt : undefined,
    expiresAt: typeof item.expiresAt === "string" ? item.expiresAt : undefined,
    daysRemaining: typeof item.daysRemaining === "number" ? item.daysRemaining : undefined,
    autoRenew: typeof item.autoRenew === "boolean" ? item.autoRenew : undefined,
    domainLock: typeof item.domainLock === "boolean" ? item.domainLock : undefined,
    privacyProtection:
      typeof item.privacyProtection === "boolean" ? item.privacyProtection : undefined,
  };
}

export async function syncRegistrarDomains(input: { registrar: Registrar; accountId?: string }) {
  try {
    const items = await pullRegistrarDomainItems(input);
    const persisted = await syncRegistrarDomainsToStore(input.registrar, items);
    return {
      domains: items.map((item) => item.domain),
      items,
      syncJob: persisted.job,
      persistedDomains: persisted.domains,
    };
  } catch (error) {
    const job = await recordRegistrarSyncFailure(input.registrar, error);
    throw Object.assign(error instanceof Error ? error : new Error("同步失败"), { syncJob: job });
  }
}
