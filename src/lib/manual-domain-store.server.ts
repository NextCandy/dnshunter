import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveDomainsNameservers, type DomainNameserverInfo } from "./nameservers.server";

export type ManualDomain = {
  id: string;
  domain: string;
  registrar?: string;
  /** DNS 修改地址（外部管理台 URL，用户可自定义） */
  dnsManageUrl?: string;
  nameservers: string[];
  nsStatus: "cloudflare" | "other" | "unknown";
  nsProvider?: string;
  registeredAt?: string;
  expiresAt?: string;
  note?: string;
  tags: string[];
  group?: string;
  createdAt: string;
  updatedAt: string;
};

export type ManualDomainPatch = {
  registrar?: string | null;
  dnsManageUrl?: string | null;
  nameservers?: string[] | null;
  nsStatus?: "cloudflare" | "other" | "unknown";
  nsProvider?: string | null;
  registeredAt?: string | null;
  expiresAt?: string | null;
  note?: string | null;
  tags?: string[] | null;
  group?: string | null;
};

type Store = { v: 1; domains: Record<string, ManualDomain> };

const FILE = process.env.MANUAL_DOMAINS_FILE || join(process.cwd(), "data", "manual-domains.json");

let cache: Store | null = null;

function emptyStore(): Store {
  return { v: 1, domains: {} };
}

function cleanText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

function cleanDate(v: unknown): string | undefined {
  const t = cleanText(v);
  if (!t) return undefined;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function normTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [
    ...new Set(
      v
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  ];
}

function normDomain(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function migrate(row: Partial<ManualDomain>): ManualDomain {
  const now = new Date().toISOString();
  return {
    id: row.id ?? randomUUID(),
    domain: normDomain(row.domain),
    registrar: cleanText(row.registrar),
    dnsManageUrl: cleanText(row.dnsManageUrl),
    nameservers: Array.isArray(row.nameservers) ? row.nameservers.filter(Boolean).map(String) : [],
    nsStatus: row.nsStatus ?? "unknown",
    nsProvider: cleanText(row.nsProvider),
    registeredAt: cleanDate(row.registeredAt),
    expiresAt: cleanDate(row.expiresAt),
    note: cleanText(row.note),
    tags: normTags(row.tags),
    group: cleanText(row.group),
    createdAt: row.createdAt ?? now,
    updatedAt: row.updatedAt ?? now,
  };
}

function applyManualPatch(cur: ManualDomain, patch: ManualDomainPatch): ManualDomain {
  const next: ManualDomain = { ...cur };
  if (patch.registrar !== undefined)
    next.registrar = patch.registrar === null ? undefined : cleanText(patch.registrar);
  if (patch.dnsManageUrl !== undefined)
    next.dnsManageUrl = patch.dnsManageUrl === null ? undefined : cleanText(patch.dnsManageUrl);
  if (patch.nameservers !== undefined)
    next.nameservers =
      patch.nameservers === null ? [] : patch.nameservers.filter(Boolean).map(String);
  if (patch.nsStatus !== undefined) next.nsStatus = patch.nsStatus;
  if (patch.nsProvider !== undefined)
    next.nsProvider = patch.nsProvider === null ? undefined : cleanText(patch.nsProvider);
  if (patch.registeredAt !== undefined)
    next.registeredAt = patch.registeredAt === null ? undefined : cleanDate(patch.registeredAt);
  if (patch.expiresAt !== undefined)
    next.expiresAt = patch.expiresAt === null ? undefined : cleanDate(patch.expiresAt);
  if (patch.note !== undefined) next.note = patch.note === null ? undefined : cleanText(patch.note);
  if (patch.tags !== undefined) next.tags = patch.tags === null ? [] : normTags(patch.tags);
  if (patch.group !== undefined)
    next.group = patch.group === null ? undefined : cleanText(patch.group);
  next.updatedAt = new Date().toISOString();
  return next;
}

async function readStore(): Promise<Store> {
  if (cache) return cache;
  try {
    const txt = await readFile(FILE, "utf8");
    const parsed = JSON.parse(txt);
    const domains =
      parsed?.domains && typeof parsed.domains === "object"
        ? Object.fromEntries(
            Object.entries(parsed.domains).map(([k, v]) => [
              k,
              migrate(v as Partial<ManualDomain>),
            ]),
          )
        : {};
    cache = { v: 1, domains };
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code !== "ENOENT") {
      console.error(
        "[manual-domain-store] 读取失败:",
        error instanceof Error ? error.message : String(error),
      );
    }
    cache = emptyStore();
  }
  return cache;
}

const BACKUP_DIR = join(dirname(FILE), "manual-domains.backups");
const MAX_BACKUPS = 20;

// 写入前把当前文件快照到备份目录，保留最近 MAX_BACKUPS 份。备份失败不阻断主写入。
async function backupCurrentFile() {
  let current: string;
  try {
    current = await readFile(FILE, "utf8");
  } catch {
    return; // 尚无文件，无需备份
  }
  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(join(BACKUP_DIR, `manual-domains-${stamp}.json`), current, { mode: 0o600 });
    const files = (await readdir(BACKUP_DIR))
      .filter((f) => f.startsWith("manual-domains-") && f.endsWith(".json"))
      .sort();
    while (files.length > MAX_BACKUPS) {
      const old = files.shift();
      if (old) await unlink(join(BACKUP_DIR, old)).catch(() => {});
    }
  } catch {
    // 忽略备份异常
  }
}

async function writeStore(store: Store) {
  await backupCurrentFile();
  cache = store;
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, FILE);
}

export async function listManualDomains(): Promise<ManualDomain[]> {
  const store = await readStore();
  return Object.values(store.domains).sort((a, b) => a.domain.localeCompare(b.domain));
}

export async function addManualDomains(
  domains: string[],
): Promise<{ added: number; skipped: number; total: number }> {
  const store = await readStore();
  const now = new Date().toISOString();
  const uniqueInput = [...new Set(domains.map(normDomain).filter(Boolean))];
  const toAdd = uniqueInput.filter((d) => !store.domains[d]);
  const skipped = uniqueInput.length - toAdd.length;

  // 添加时自动查一次 NS，回填 nameservers/nsStatus/nsProvider（best-effort，失败保持 unknown）
  let nsMap = new Map<string, DomainNameserverInfo>();
  if (toAdd.length > 0) {
    try {
      nsMap = await resolveDomainsNameservers(toAdd, 20);
    } catch {
      // 查询失败不影响添加
    }
  }

  for (const domain of toAdd) {
    const ns = nsMap.get(domain);
    store.domains[domain] = {
      id: randomUUID(),
      domain,
      nameservers: ns?.nameservers ?? [],
      nsStatus: ns?.nsStatus ?? "unknown",
      nsProvider: ns?.nsProvider,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
  }
  if (toAdd.length > 0) await writeStore(store);
  return { added: toAdd.length, skipped, total: Object.keys(store.domains).length };
}

export async function updateManualDomain(
  id: string,
  patch: ManualDomainPatch,
): Promise<ManualDomain | null> {
  const store = await readStore();
  const key = Object.keys(store.domains).find((k) => store.domains[k].id === id);
  if (!key) return null;
  store.domains[key] = applyManualPatch(store.domains[key], patch);
  await writeStore(store);
  return store.domains[key];
}

export async function updateManualDomains(
  ids: string[],
  patch: ManualDomainPatch,
): Promise<{ updated: number }> {
  const store = await readStore();
  const idSet = new Set(ids);
  let updated = 0;
  for (const key of Object.keys(store.domains)) {
    if (!idSet.has(store.domains[key].id)) continue;
    store.domains[key] = applyManualPatch(store.domains[key], patch);
    updated += 1;
  }
  if (updated > 0) await writeStore(store);
  return { updated };
}

export async function deleteManualDomain(id: string): Promise<boolean> {
  const store = await readStore();
  const key = Object.keys(store.domains).find((k) => store.domains[k].id === id);
  if (!key) return false;
  delete store.domains[key];
  await writeStore(store);
  return true;
}

export async function deleteManualDomains(ids: string[]): Promise<{ deleted: number }> {
  const store = await readStore();
  const idSet = new Set(ids);
  let deleted = 0;
  for (const key of Object.keys(store.domains)) {
    if (idSet.has(store.domains[key].id)) {
      delete store.domains[key];
      deleted += 1;
    }
  }
  if (deleted > 0) await writeStore(store);
  return { deleted };
}

export async function listManualBackups(): Promise<{ file: string; at: string; count: number }[]> {
  let files: string[];
  try {
    files = (await readdir(BACKUP_DIR)).filter(
      (f) => f.startsWith("manual-domains-") && f.endsWith(".json"),
    );
  } catch {
    return [];
  }
  const out: { file: string; at: string; count: number }[] = [];
  for (const f of files) {
    try {
      const p = join(BACKUP_DIR, f);
      const [txt, st] = await Promise.all([readFile(p, "utf8"), stat(p)]);
      const parsed = JSON.parse(txt);
      const count =
        parsed?.domains && typeof parsed.domains === "object"
          ? Object.keys(parsed.domains).length
          : 0;
      out.push({ file: f, at: st.mtime.toISOString(), count });
    } catch {
      // 跳过损坏的备份
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export async function restoreManualBackup(
  file: string,
): Promise<{ restored: boolean; count: number }> {
  if (!/^manual-domains-[0-9A-Za-z._-]+\.json$/.test(file) || file.includes("..")) {
    throw new Error("非法备份文件名");
  }
  const txt = await readFile(join(BACKUP_DIR, file), "utf8");
  const parsed = JSON.parse(txt);
  const domains =
    parsed?.domains && typeof parsed.domains === "object"
      ? Object.fromEntries(
          Object.entries(parsed.domains).map(([k, v]) => [k, migrate(v as Partial<ManualDomain>)]),
        )
      : {};
  await writeStore({ v: 1, domains });
  return { restored: true, count: Object.keys(domains).length };
}
