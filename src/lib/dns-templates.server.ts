import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DNS_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "CAA", "SRV"] as const;

export type DnsTemplateRecord = {
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
};

export type DnsTemplate = {
  id: string;
  name: string;
  description?: string;
  records: DnsTemplateRecord[];
  createdAt: string;
  updatedAt: string;
};

export type DnsTemplatePatch = {
  id?: string;
  name: string;
  description?: string;
  records: DnsTemplateRecord[];
};

type Store = { v: 1; templates: Record<string, DnsTemplate> };

const FILE = process.env.DNS_TEMPLATES_FILE || join(process.cwd(), "data", "dns-templates.json");
const BACKUP_DIR = join(dirname(FILE), "dns-templates.backups");
const MAX_BACKUPS = 20;

let cache: Store | null = null;

function emptyStore(): Store {
  return { v: 1, templates: {} };
}

function cleanText(value: unknown, max = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = [...value]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code <= 31 || code === 127 ? " " : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return text ? [...text].slice(0, max).join("") : undefined;
}

function cleanId(value: unknown): string | undefined {
  const text = cleanText(value, 100);
  return text && /^[0-9A-Za-z._-]+$/.test(text) ? text : undefined;
}

function normalizeType(value: unknown): string {
  const type = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!DNS_TYPES.includes(type as (typeof DNS_TYPES)[number])) {
    throw new Error(`DNS 类型不支持：${type || "-"}`);
  }
  return type;
}

function normalizeTtl(value: unknown): number {
  const ttl = Number(value ?? 1);
  if (!Number.isInteger(ttl) || !(ttl === 1 || (ttl >= 60 && ttl <= 86400))) {
    throw new Error("TTL 必须为 1（Auto）或 60-86400 秒");
  }
  return ttl;
}

function normalizeRecord(input: unknown, index: number): DnsTemplateRecord {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const type = normalizeType(row.type);
  const name = cleanText(row.name, 180) || "@";
  const content = cleanText(row.content, 1200);
  if (!content) throw new Error(`模板第 ${index + 1} 行 content 不能为空`);
  const priority =
    row.priority === undefined || row.priority === null || row.priority === ""
      ? undefined
      : Number(row.priority);
  if (type === "MX" && (priority === undefined || !Number.isInteger(priority))) {
    throw new Error(`模板第 ${index + 1} 行：MX 记录必须填写 priority`);
  }
  if (priority !== undefined && (!Number.isInteger(priority) || priority < 0 || priority > 65535)) {
    throw new Error(`模板第 ${index + 1} 行：priority 必须为 0-65535`);
  }
  return {
    type,
    name,
    content,
    ttl: normalizeTtl(row.ttl),
    proxied: ["A", "AAAA", "CNAME"].includes(type) ? Boolean(row.proxied) : false,
    priority,
  };
}

function normalizePatch(patch: DnsTemplatePatch, existing?: DnsTemplate): DnsTemplate {
  const now = new Date().toISOString();
  const name = cleanText(patch.name, 80);
  if (!name) throw new Error("模板名称不能为空");
  const records = Array.isArray(patch.records)
    ? patch.records.map(normalizeRecord).slice(0, 50)
    : [];
  if (records.length === 0) throw new Error("模板至少需要 1 条完整 DNS 记录");
  const id = cleanId(patch.id) ?? existing?.id ?? randomUUID();
  return {
    id,
    name,
    description: cleanText(patch.description, 240),
    records,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function migrate(raw: unknown): DnsTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<DnsTemplate>;
  try {
    return normalizePatch(
      {
        id: row.id,
        name: row.name ?? "",
        description: row.description,
        records: row.records ?? [],
      },
      {
        id: cleanId(row.id) ?? randomUUID(),
        name: cleanText(row.name, 80) ?? "未命名模板",
        description: cleanText(row.description, 240),
        records: [],
        createdAt: row.createdAt ?? new Date().toISOString(),
        updatedAt: row.updatedAt ?? new Date().toISOString(),
      },
    );
  } catch {
    return null;
  }
}

async function readStore(): Promise<Store> {
  if (cache) return cache;
  try {
    const txt = await readFile(FILE, "utf8");
    const parsed = JSON.parse(txt);
    const source =
      parsed?.templates && typeof parsed.templates === "object"
        ? Object.values(parsed.templates)
        : [];
    cache = {
      v: 1,
      templates: Object.fromEntries(
        source.flatMap((item: unknown) => {
          const template = migrate(item);
          return template ? [[template.id, template]] : [];
        }),
      ),
    };
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code !== "ENOENT") {
      console.error(
        "[dns-templates] read failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
    cache = emptyStore();
  }
  return cache;
}

async function backupCurrentFile() {
  let current: string;
  try {
    current = await readFile(FILE, "utf8");
  } catch {
    return;
  }
  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(join(BACKUP_DIR, `dns-templates-${stamp}.json`), current, { mode: 0o600 });
    const files = (await readdir(BACKUP_DIR))
      .filter((file) => file.startsWith("dns-templates-") && file.endsWith(".json"))
      .sort();
    while (files.length > MAX_BACKUPS) {
      const old = files.shift();
      if (old) await unlink(join(BACKUP_DIR, old)).catch(() => {});
    }
  } catch {
    // 备份失败不阻断主写入；写入本身仍使用临时文件 + rename。
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

export async function listDnsTemplates(): Promise<DnsTemplate[]> {
  const store = await readStore();
  return Object.values(store.templates).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveDnsTemplate(patch: DnsTemplatePatch): Promise<DnsTemplate> {
  const store = await readStore();
  const id = cleanId(patch.id);
  const existing = id ? store.templates[id] : undefined;
  const next = normalizePatch(patch, existing);
  store.templates[next.id] = next;
  await writeStore(store);
  return next;
}

export async function deleteDnsTemplate(id: string): Promise<DnsTemplate | null> {
  const store = await readStore();
  const clean = cleanId(id);
  if (!clean) return null;
  const existing = store.templates[clean];
  if (!existing) return null;
  delete store.templates[clean];
  await writeStore(store);
  return existing;
}
