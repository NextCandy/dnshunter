import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type RegistrarSyncStrategy = "rest" | "graphql" | "scrape" | "manual";

export type RegistrarCredentialField = {
  key: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
};

export type RegistrarCatalogItem = {
  id: string;
  name: string;
  shortName: string;
  hint: string;
  link: string;
  logoUrl?: string;
  brandColor: string;
  credentialFields: RegistrarCredentialField[];
  syncStrategy: RegistrarSyncStrategy;
  defaultNameservers: string[];
  supportsSync: boolean;
  builtin: boolean;
  active: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RegistrarCatalogPatch = {
  id?: string;
  name: string;
  shortName?: string;
  hint?: string;
  link?: string;
  logoUrl?: string;
  brandColor?: string;
  credentialFields?: RegistrarCredentialField[];
  syncStrategy?: RegistrarSyncStrategy;
  defaultNameservers?: string[];
  active?: boolean;
};

type Store = {
  v: 1;
  items: Record<string, RegistrarCatalogItem>;
};

const FILE = process.env.REGISTRAR_CATALOG_FILE || join(process.cwd(), "data", "registrars.json");

const now = () => new Date().toISOString();

export const BUILTIN_REGISTRARS: RegistrarCatalogItem[] = [
  {
    id: "cloudflare",
    name: "Cloudflare",
    shortName: "Cloudflare",
    hint: "Cloudflare Registrar 域名共用同一 Token。建议创建自定义 Token 并按权限清单授权。",
    link: "https://dash.cloudflare.com/profile/api-tokens",
    brandColor: "#f59e0b",
    credentialFields: [{ key: "CLOUDFLARE_API_TOKEN", label: "API Token", secret: true }],
    syncStrategy: "rest",
    defaultNameservers: [],
    supportsSync: true,
    builtin: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "spaceship",
    name: "Spaceship",
    shortName: "Spaceship",
    hint: "Spaceship 后台 → API Manager → 生成 API Key 与 Secret。",
    link: "https://www.spaceship.com/application/api-manager/",
    brandColor: "#7c3aed",
    credentialFields: [
      { key: "SPACESHIP_API_KEY", label: "API Key" },
      { key: "SPACESHIP_API_SECRET", label: "API Secret", secret: true },
    ],
    syncStrategy: "rest",
    defaultNameservers: [],
    supportsSync: true,
    builtin: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "dynadot",
    name: "Dynadot",
    shortName: "Dynadot",
    hint: "Dynadot 后台 → Dynadot API。当前域名同步/改 NS 使用 Legacy API v3；RESTful API 密钥可先保存备用。",
    link: "https://www.dynadot.com/account/domain/setting/api.html",
    brandColor: "#2563eb",
    credentialFields: [
      { key: "DYNADOT_API_KEY", label: "API 生产密钥（Production Key）", secret: true },
      {
        key: "DYNADOT_API_SECRET",
        label: "密钥（Secret Key，RESTful API 可选）",
        secret: true,
        optional: true,
      },
    ],
    syncStrategy: "rest",
    defaultNameservers: [],
    supportsSync: true,
    builtin: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "porkbun",
    name: "Porkbun",
    shortName: "Porkbun",
    hint: "Porkbun 后台 → Account → API。生成 API Key 与 Secret API Key；如启用限制，请允许 NAS 出口 IP。",
    link: "https://porkbun.com/account/api",
    brandColor: "#ec4899",
    credentialFields: [
      { key: "PORKBUN_API_KEY", label: "API Key" },
      { key: "PORKBUN_SECRET_API_KEY", label: "Secret API Key", secret: true },
    ],
    syncStrategy: "rest",
    defaultNameservers: [],
    supportsSync: true,
    builtin: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "namecheap",
    name: "Namecheap",
    shortName: "Namecheap",
    hint: "需把服务器出口 IP 加入 Namecheap 白名单；Client IP 必须与实际出口 IP 一致。",
    link: "https://ap.www.namecheap.com/settings/tools/apiaccess/",
    brandColor: "#f97316",
    credentialFields: [
      { key: "NAMECHEAP_API_USER", label: "API User" },
      { key: "NAMECHEAP_API_KEY", label: "API Key", secret: true },
      { key: "NAMECHEAP_USERNAME", label: "Username（留空=同 API User）", optional: true },
      { key: "NAMECHEAP_CLIENT_IP", label: "Client IP" },
    ],
    syncStrategy: "rest",
    defaultNameservers: [],
    supportsSync: true,
    builtin: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "aliyun",
    name: "阿里云（万网）",
    shortName: "阿里云",
    hint: "建议单独 RAM 用户 AccessKey，最少授予 AliyunDomainFullAccess。",
    link: "https://ram.console.aliyun.com/manage/ak",
    brandColor: "#ff6a00",
    credentialFields: [
      { key: "ALIYUN_ACCESS_KEY_ID", label: "AccessKey ID" },
      { key: "ALIYUN_ACCESS_KEY_SECRET", label: "AccessKey Secret", secret: true },
    ],
    syncStrategy: "rest",
    defaultNameservers: [],
    supportsSync: true,
    builtin: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tencent",
    name: "腾讯云（域名）",
    shortName: "腾讯云",
    hint: "子账号密钥，授予 QcloudDomainFullAccess。",
    link: "https://console.cloud.tencent.com/cam/capi",
    brandColor: "#3b82f6",
    credentialFields: [
      { key: "TENCENT_SECRET_ID", label: "SecretId" },
      { key: "TENCENT_SECRET_KEY", label: "SecretKey", secret: true },
    ],
    syncStrategy: "rest",
    defaultNameservers: [],
    supportsSync: true,
    builtin: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "west",
    name: "西部数码 West.cn",
    shortName: "西部数码",
    hint: "后台 → 账户设置 → API 接口，启用并设置 API 密码（不同于登录密码）。",
    link: "https://www.west.cn/manager/API/",
    brandColor: "#0ea5e9",
    credentialFields: [
      { key: "WEST_USERNAME", label: "用户名" },
      { key: "WEST_API_PASSWORD", label: "API 密码", secret: true },
    ],
    syncStrategy: "rest",
    defaultNameservers: [],
    supportsSync: true,
    builtin: true,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

let cache: Store | null = null;

function emptyStore(): Store {
  return { v: 1, items: {} };
}

async function readStore(): Promise<Store> {
  if (cache) return cache;
  try {
    const txt = await readFile(FILE, "utf8");
    const parsed = JSON.parse(txt);
    const items =
      parsed?.items && typeof parsed.items === "object"
        ? Object.fromEntries(
            Object.entries(parsed.items).map(([id, value]) => [
              id,
              migrateRegistrar(value as Partial<RegistrarCatalogItem>),
            ]),
          )
        : {};
    cache = { v: 1, items };
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (code !== "ENOENT") console.error("[registrar-catalog] 读取失败:", message);
    cache = emptyStore();
  }
  return cache;
}

async function writeStore(store: Store) {
  cache = store;
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, FILE);
}

function migrateRegistrar(row: Partial<RegistrarCatalogItem>): RegistrarCatalogItem {
  const stamp = now();
  return {
    id: normalizeId(row.id || row.shortName || row.name || "registrar"),
    name: cleanText(row.name) || "未命名注册商",
    shortName: cleanText(row.shortName) || cleanText(row.name) || "注册商",
    hint: cleanText(row.hint) || "自定义注册商源，等待接入同步逻辑。",
    link: cleanText(row.link) || "",
    logoUrl: cleanText(row.logoUrl),
    brandColor: normalizeColor(row.brandColor),
    credentialFields: normalizeFields(row.credentialFields),
    syncStrategy: normalizeStrategy(row.syncStrategy),
    defaultNameservers: normalizeList(row.defaultNameservers),
    supportsSync: Boolean(row.supportsSync),
    builtin: Boolean(row.builtin),
    active: row.active !== false && !row.deletedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt || stamp,
    updatedAt: row.updatedAt || stamp,
  };
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeId(value: string) {
  return (
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `registrar-${Date.now()}`
  );
}

function normalizeColor(value: unknown) {
  const text = cleanText(value);
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : "#3b82f6";
}

function normalizeStrategy(value: unknown): RegistrarSyncStrategy {
  if (value === "rest" || value === "graphql" || value === "scrape" || value === "manual") {
    return value;
  }
  return "manual";
}

function normalizeFields(value: unknown): RegistrarCredentialField[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((field): RegistrarCredentialField | null => {
      const source = field as Partial<RegistrarCredentialField>;
      const key = cleanText(source.key)
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_")
        .slice(0, 64);
      const label = cleanText(source.label) || key;
      if (!key) return null;
      return {
        key,
        label,
        secret: Boolean(source.secret),
        optional: Boolean(source.optional),
      };
    })
    .filter((field): field is RegistrarCredentialField => Boolean(field))
    .slice(0, 12);
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map(cleanText).filter(Boolean).slice(0, 12);
  if (typeof value === "string") {
    return value.split(/[\n,]/).map(cleanText).filter(Boolean).slice(0, 12);
  }
  return [];
}

function mergeBuiltinWithStore(store: Store) {
  const map = new Map<string, RegistrarCatalogItem>();
  for (const item of BUILTIN_REGISTRARS) {
    const override = store.items[item.id];
    map.set(item.id, override ? { ...item, ...override, builtin: true, supportsSync: true } : item);
  }
  for (const item of Object.values(store.items)) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => {
    const builtinOrder =
      Number(!a.builtin) - Number(!b.builtin) ||
      BUILTIN_REGISTRARS.findIndex((item) => item.id === a.id) -
        BUILTIN_REGISTRARS.findIndex((item) => item.id === b.id);
    if (builtinOrder !== 0) return builtinOrder;
    return a.name.localeCompare(b.name);
  });
}

export async function listRegistrarCatalog(options: { includeDeleted?: boolean } = {}) {
  const store = await readStore();
  return mergeBuiltinWithStore(store).filter((item) => options.includeDeleted || item.active);
}

export async function upsertRegistrarCatalogItem(patch: RegistrarCatalogPatch) {
  const store = await readStore();
  const id = normalizeId(patch.id || patch.shortName || patch.name);
  const existing = store.items[id] ?? BUILTIN_REGISTRARS.find((item) => item.id === id);
  const stamp = now();
  const next = migrateRegistrar({
    ...existing,
    ...patch,
    id,
    shortName: patch.shortName || existing?.shortName || patch.name,
    supportsSync: existing?.supportsSync ?? false,
    builtin: existing?.builtin ?? false,
    active: patch.active ?? existing?.active ?? true,
    deletedAt: patch.active === false ? existing?.deletedAt || stamp : undefined,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  });
  store.items[id] = next;
  await writeStore(store);
  return next;
}

export async function softDeleteRegistrarCatalogItem(id: string) {
  const store = await readStore();
  const cleanId = normalizeId(id);
  const existing = store.items[cleanId] ?? BUILTIN_REGISTRARS.find((item) => item.id === cleanId);
  if (!existing) return null;
  const stamp = now();
  const next: RegistrarCatalogItem = {
    ...existing,
    id: cleanId,
    active: false,
    deletedAt: existing.deletedAt || stamp,
    updatedAt: stamp,
  };
  store.items[cleanId] = next;
  await writeStore(store);
  return next;
}
