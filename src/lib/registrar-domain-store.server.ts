import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type PersistedRegistrar = string;

export type PersistedRegistrarDomain = {
  id: string;
  registrar: PersistedRegistrar;
  domain: string;
  nameservers: string[];
  nsStatus: "cloudflare" | "other" | "unknown";
  nsProvider?: string;
  nsError?: string;
  status?: "normal" | "expiring" | "expired" | "error" | "unknown";
  registeredAt?: string;
  expiresAt?: string;
  daysRemaining?: number;
  group?: string;
  tags?: string[];
  estimatedValue?: number;
  favorite?: boolean;
  autoRenew?: boolean;
  domainLock?: boolean;
  privacyProtection?: boolean;
  note?: string;
  syncStatus: "ok" | "missing" | "warning";
  syncError?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSyncedAt: string;
  removedFromRegistrarAt?: string;
  updatedAt: string;
};

export type RegistrarSyncJob = {
  id: string;
  registrar: PersistedRegistrar;
  status: "success" | "partial_success" | "failed";
  startedAt: string;
  finishedAt: string;
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  missingCount: number;
  failedCount: number;
  errorMessage?: string;
};

type Store = {
  v: 1;
  domains: Record<string, PersistedRegistrarDomain>;
  jobs: RegistrarSyncJob[];
};

export type SyncableRegistrarDomain = {
  domain: string;
  nameservers?: string[];
  nsStatus?: "cloudflare" | "other" | "unknown";
  nsProvider?: string;
  nsError?: string;
  status?: PersistedRegistrarDomain["status"];
  registeredAt?: string;
  expiresAt?: string;
  daysRemaining?: number;
  autoRenew?: boolean;
  domainLock?: boolean;
  privacyProtection?: boolean;
};

export type EditableRegistrarDomainPatch = {
  note?: string | null;
  group?: string | null;
  tags?: string[] | null;
  estimatedValue?: number | null;
  favorite?: boolean;
  autoRenew?: boolean | null;
  domainLock?: boolean | null;
  privacyProtection?: boolean | null;
};

const FILE =
  process.env.REGISTRAR_DOMAINS_FILE || join(process.cwd(), "data", "registrar-domains.json");

let cache: Store | null = null;

function emptyStore(): Store {
  return { v: 1, domains: {}, jobs: [] };
}

function keyOf(registrar: PersistedRegistrar, domain: string) {
  return `${registrar}:${domain}`;
}

async function readStore(): Promise<Store> {
  if (cache) return cache;
  try {
    const txt = await readFile(FILE, "utf8");
    const parsed = JSON.parse(txt);
    const domains =
      parsed?.domains && typeof parsed.domains === "object"
        ? Object.fromEntries(
            Object.entries(parsed.domains).map(([key, value]) => [
              key,
              migrateDomain(value as Partial<PersistedRegistrarDomain>),
            ]),
          )
        : {};
    cache = {
      v: 1,
      domains,
      jobs: Array.isArray(parsed?.jobs) ? parsed.jobs : [],
    };
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (code !== "ENOENT") {
      console.error("[registrar-domain-store] 读取失败:", message);
    }
    cache = emptyStore();
  }
  return cache;
}

function migrateDomain(row: Partial<PersistedRegistrarDomain>): PersistedRegistrarDomain {
  const now = new Date().toISOString();
  const expiresAt = cleanDate(row.expiresAt);
  const daysRemaining =
    typeof row.daysRemaining === "number" ? row.daysRemaining : calculateDaysRemaining(expiresAt);
  return {
    id: row.id ?? randomUUID(),
    registrar: row.registrar ?? "aliyun",
    domain: String(row.domain ?? "")
      .trim()
      .toLowerCase(),
    nameservers: Array.isArray(row.nameservers) ? row.nameservers.filter(Boolean).map(String) : [],
    nsStatus: row.nsStatus ?? "unknown",
    nsProvider: row.nsProvider,
    nsError: row.nsError,
    status: normalizeAssetStatus(row.status, daysRemaining, row.syncStatus),
    registeredAt: cleanDate(row.registeredAt),
    expiresAt,
    daysRemaining,
    group: cleanOptionalText(row.group),
    tags: normalizeTags(row.tags),
    estimatedValue:
      typeof row.estimatedValue === "number" && Number.isFinite(row.estimatedValue)
        ? Math.max(0, Math.round(row.estimatedValue))
        : undefined,
    favorite: Boolean(row.favorite),
    autoRenew: typeof row.autoRenew === "boolean" ? row.autoRenew : undefined,
    domainLock: typeof row.domainLock === "boolean" ? row.domainLock : undefined,
    privacyProtection:
      typeof row.privacyProtection === "boolean" ? row.privacyProtection : undefined,
    note: cleanOptionalText(row.note),
    syncStatus: row.syncStatus ?? "ok",
    syncError: row.syncError,
    firstSeenAt: row.firstSeenAt ?? now,
    lastSeenAt: row.lastSeenAt ?? now,
    lastSyncedAt: row.lastSyncedAt ?? now,
    removedFromRegistrarAt: row.removedFromRegistrarAt,
    updatedAt: row.updatedAt ?? now,
  };
}

function cleanOptionalText(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

function cleanDate(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  ];
}

function calculateDaysRemaining(expiresAt?: string) {
  if (!expiresAt) return undefined;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

function normalizeAssetStatus(
  status: unknown,
  daysRemaining?: number,
  syncStatus?: PersistedRegistrarDomain["syncStatus"],
): PersistedRegistrarDomain["status"] {
  if (status === "normal" || status === "expiring" || status === "expired" || status === "error") {
    return status;
  }
  if (syncStatus === "missing" || syncStatus === "warning") return "error";
  if (typeof daysRemaining === "number") {
    if (daysRemaining < 0) return "expired";
    if (daysRemaining <= 30) return "expiring";
    return "normal";
  }
  return "unknown";
}

async function writeStore(store: Store) {
  cache = store;
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, FILE);
}

export async function listPersistedRegistrarDomains() {
  const store = await readStore();
  return Object.values(store.domains).sort((a, b) => {
    const missing = Number(a.syncStatus === "missing") - Number(b.syncStatus === "missing");
    if (missing !== 0) return missing;
    return a.domain.localeCompare(b.domain);
  });
}

export async function listPersistedRegistrarSyncJobs() {
  const store = await readStore();
  return [...store.jobs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getPersistedRegistrarDomain(id: string) {
  const store = await readStore();
  return Object.values(store.domains).find((row) => row.id === id) ?? null;
}

export async function updatePersistedRegistrarDomain(
  id: string,
  patch: EditableRegistrarDomainPatch,
) {
  const store = await readStore();
  const key = Object.keys(store.domains).find((candidate) => store.domains[candidate].id === id);
  if (!key) return null;
  const current = store.domains[key];
  const next: PersistedRegistrarDomain = { ...current };
  if (patch.note !== undefined) {
    next.note = patch.note === null ? undefined : cleanOptionalText(patch.note);
  }
  if (patch.group !== undefined) {
    next.group = patch.group === null ? undefined : cleanOptionalText(patch.group);
  }
  if (patch.tags !== undefined) next.tags = patch.tags === null ? [] : normalizeTags(patch.tags);
  if (patch.estimatedValue !== undefined) {
    next.estimatedValue =
      typeof patch.estimatedValue === "number" && Number.isFinite(patch.estimatedValue)
        ? Math.max(0, Math.round(patch.estimatedValue))
        : undefined;
  }
  if (patch.favorite !== undefined) next.favorite = Boolean(patch.favorite);
  if (patch.autoRenew !== undefined) {
    next.autoRenew = typeof patch.autoRenew === "boolean" ? patch.autoRenew : undefined;
  }
  if (patch.domainLock !== undefined) {
    next.domainLock = typeof patch.domainLock === "boolean" ? patch.domainLock : undefined;
  }
  if (patch.privacyProtection !== undefined) {
    next.privacyProtection =
      typeof patch.privacyProtection === "boolean" ? patch.privacyProtection : undefined;
  }
  next.updatedAt = new Date().toISOString();
  store.domains[key] = {
    ...next,
  };
  await writeStore(store);
  return store.domains[key];
}

export async function syncRegistrarDomainsToStore(
  registrar: PersistedRegistrar,
  items: SyncableRegistrarDomain[],
): Promise<{ domains: PersistedRegistrarDomain[]; job: RegistrarSyncJob }> {
  const store = await readStore();
  const startedAt = new Date().toISOString();
  const seen = new Set<string>();
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  for (const item of items) {
    try {
      const domain = String(item.domain || "")
        .trim()
        .toLowerCase();
      if (!domain) throw new Error("域名为空");
      seen.add(domain);
      const now = new Date().toISOString();
      const key = keyOf(registrar, domain);
      const existing = store.domains[key];
      const expiresAt = cleanDate(item.expiresAt);
      const daysRemaining =
        typeof item.daysRemaining === "number"
          ? item.daysRemaining
          : calculateDaysRemaining(expiresAt);
      const assetStatus = normalizeAssetStatus(
        item.status,
        daysRemaining,
        item.nsError ? "warning" : "ok",
      );
      if (existing) {
        updatedCount += 1;
        store.domains[key] = {
          ...existing,
          nameservers: item.nameservers ?? [],
          nsStatus: item.nsStatus ?? "unknown",
          nsProvider: item.nsProvider,
          nsError: item.nsError,
          status: assetStatus,
          registeredAt: cleanDate(item.registeredAt) ?? existing.registeredAt,
          expiresAt: expiresAt ?? existing.expiresAt,
          daysRemaining: daysRemaining ?? existing.daysRemaining,
          autoRenew: typeof item.autoRenew === "boolean" ? item.autoRenew : existing.autoRenew,
          domainLock: typeof item.domainLock === "boolean" ? item.domainLock : existing.domainLock,
          privacyProtection:
            typeof item.privacyProtection === "boolean"
              ? item.privacyProtection
              : existing.privacyProtection,
          syncStatus: item.nsError ? "warning" : "ok",
          syncError: item.nsError,
          lastSeenAt: now,
          lastSyncedAt: now,
          removedFromRegistrarAt: undefined,
          updatedAt: now,
        };
      } else {
        createdCount += 1;
        store.domains[key] = {
          id: randomUUID(),
          registrar,
          domain,
          nameservers: item.nameservers ?? [],
          nsStatus: item.nsStatus ?? "unknown",
          nsProvider: item.nsProvider,
          nsError: item.nsError,
          status: assetStatus,
          registeredAt: cleanDate(item.registeredAt),
          expiresAt,
          daysRemaining,
          group: undefined,
          tags: [],
          estimatedValue: undefined,
          favorite: false,
          autoRenew: item.autoRenew,
          domainLock: item.domainLock,
          privacyProtection: item.privacyProtection,
          syncStatus: item.nsError ? "warning" : "ok",
          syncError: item.nsError,
          firstSeenAt: now,
          lastSeenAt: now,
          lastSyncedAt: now,
          updatedAt: now,
        };
      }
    } catch (error) {
      failedCount += 1;
      console.error("[registrar-domain-store] 单域名同步失败:", error);
    }
  }

  let missingCount = 0;
  const finishedAt = new Date().toISOString();
  for (const [key, row] of Object.entries(store.domains)) {
    if (row.registrar !== registrar || seen.has(row.domain) || row.syncStatus === "missing") {
      continue;
    }
    missingCount += 1;
    store.domains[key] = {
      ...row,
      status: "error",
      syncStatus: "missing",
      removedFromRegistrarAt: finishedAt,
      lastSyncedAt: finishedAt,
      updatedAt: finishedAt,
    };
  }

  const job: RegistrarSyncJob = {
    id: randomUUID(),
    registrar,
    status: failedCount > 0 ? "partial_success" : "success",
    startedAt,
    finishedAt,
    totalCount: items.length,
    createdCount,
    updatedCount,
    missingCount,
    failedCount,
  };
  store.jobs = [job, ...store.jobs].slice(0, 100);
  await writeStore(store);

  const domains = Object.values(store.domains)
    .filter((row) => row.registrar === registrar)
    .sort((a, b) => a.domain.localeCompare(b.domain));
  return { domains, job };
}

export async function recordRegistrarSyncFailure(
  registrar: PersistedRegistrar,
  error: unknown,
): Promise<RegistrarSyncJob> {
  const store = await readStore();
  const now = new Date().toISOString();
  const job: RegistrarSyncJob = {
    id: randomUUID(),
    registrar,
    status: "failed",
    startedAt: now,
    finishedAt: now,
    totalCount: 0,
    createdCount: 0,
    updatedCount: 0,
    missingCount: 0,
    failedCount: 1,
    errorMessage: error instanceof Error ? error.message : "同步失败",
  };
  store.jobs = [job, ...store.jobs].slice(0, 100);
  await writeStore(store);
  return job;
}
