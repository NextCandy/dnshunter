// 服务端凭证管理（server-only）。
//
// 注册商 / Cloudflare 的 API 凭证支持两种来源：
//   1. UI 在「设置」里编辑保存 → 加密写入持久化文件（本文件）；
//   2. 环境变量（.env）回退。
//
// 明文永远只在服务端存在：写盘时用 SESSION_SECRET 派生的密钥做
// AES-256-GCM 加密；对浏览器只暴露「是否已配置」，从不回传明文。
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

// 可在 UI 编辑保存的凭证字段白名单。
// 注意：SESSION_SECRET / SITE_PASSWORD 属于系统级配置，只能用环境变量设置，不在此列。
export const SECRET_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "SPACESHIP_API_KEY",
  "SPACESHIP_API_SECRET",
  "DYNADOT_API_KEY",
  "DYNADOT_API_SECRET",
  "PORKBUN_API_KEY",
  "PORKBUN_SECRET_API_KEY",
  "NAMECHEAP_API_USER",
  "NAMECHEAP_API_KEY",
  "NAMECHEAP_USERNAME",
  "NAMECHEAP_CLIENT_IP",
  "ALIYUN_ACCESS_KEY_ID",
  "ALIYUN_ACCESS_KEY_SECRET",
  "TENCENT_SECRET_ID",
  "TENCENT_SECRET_KEY",
  "WEST_USERNAME",
  "WEST_API_PASSWORD",
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
type SecretPresence = Record<string, boolean>;

// 持久化文件路径。容器内 WORKDIR=/app → /app/data/secrets.json（挂载卷）；
// 本地开发 → <项目>/data/secrets.json。可用 SECRETS_FILE 覆盖。
const FILE = process.env.SECRETS_FILE || join(process.cwd(), "data", "secrets.json");

let _key: Buffer | null = null;
function aesKey(): Buffer {
  if (_key) return _key;
  // 无 SESSION_SECRET 时用弱回退，仅用于本地开发不至于崩溃（生产必设 SESSION_SECRET）。
  const base = process.env.SESSION_SECRET || "domainops-dev-insecure";
  _key = scryptSync(base, "domainops-secrets-v1", 32);
  return _key;
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(blob: string): string {
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", aesKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// 内存缓存，避免每次读盘/解密（单实例进程）。写入时同步刷新。
let cache: Record<string, string> | null = null;

async function readStore(): Promise<Record<string, string>> {
  if (cache) return cache;
  try {
    const txt = await readFile(FILE, "utf8");
    const parsed = JSON.parse(txt);
    cache = parsed && typeof parsed.data === "string" ? JSON.parse(decrypt(parsed.data)) : {};
  } catch (e: unknown) {
    // 文件不存在属正常（尚未保存过任何凭证）；其它错误打日志但不阻断。
    const code =
      typeof e === "object" && e && "code" in e ? (e as { code?: unknown }).code : undefined;
    const message = e instanceof Error ? e.message : String(e);
    if (code !== "ENOENT") console.error("[secrets] 读取失败:", message);
    cache = {};
  }
  return cache!;
}

async function writeStore(obj: Record<string, string>): Promise<void> {
  cache = obj;
  await mkdir(dirname(FILE), { recursive: true });
  const payload = JSON.stringify({ v: 1, data: encrypt(JSON.stringify(obj)) });
  await writeFile(FILE, payload, { mode: 0o600 });
}

// 读取单个凭证：已保存的文件值优先，否则回退环境变量。
export async function getSecret(name: SecretKey): Promise<string | undefined> {
  const store = await readStore();
  const v = store[name];
  if (v !== undefined && v !== "") return v;
  const env = process.env[name];
  return env && env !== "" ? env : undefined;
}

export async function getSecretValue(name: string): Promise<string | undefined> {
  const key = normalizeSecretKey(name);
  const allowed = await getAllowedSecretKeys();
  if (!key || !allowed.has(key)) return undefined;
  const store = await readStore();
  const v = store[key];
  if (v !== undefined && v !== "") return v;
  const env = process.env[key];
  return env && env !== "" ? env : undefined;
}

function normalizeSecretKey(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 64);
}

async function getAllowedSecretKeys(): Promise<Set<string>> {
  const keys = new Set<string>(SECRET_KEYS);
  try {
    const { listRegistrarCatalog } = await import("./registrar-catalog.server");
    const registrars = await listRegistrarCatalog({ includeDeleted: true });
    for (const registrar of registrars) {
      for (const field of registrar.credentialFields) {
        const key = normalizeSecretKey(field.key);
        if (key) keys.add(key);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[secrets] 动态凭证白名单读取失败:", message);
  }
  return keys;
}

// 批量保存：非空字符串 = 设置；空字符串 = 删除（清除，回退到 env / 未配置）。
// 只接受白名单字段，其余忽略。
export async function setSecrets(patch: Record<string, string>): Promise<void> {
  const store = { ...(await readStore()) };
  const allowed = await getAllowedSecretKeys();
  for (const [rawKey, v] of Object.entries(patch)) {
    const k = normalizeSecretKey(rawKey);
    if (!allowed.has(k)) continue;
    if (typeof v !== "string") continue;
    if (v === "") delete store[k];
    else store[k] = v;
  }
  await writeStore(store);
}

// 每个字段是否已配置（文件或 env 有值），用于 UI 展示，不泄漏明文。
export async function getSecretPresence(): Promise<SecretPresence> {
  const store = await readStore();
  const allowed = await getAllowedSecretKeys();
  const out: SecretPresence = {};
  for (const k of allowed) {
    const fromFile = store[k];
    const fromEnv = process.env[k];
    out[k] = Boolean((fromFile && fromFile !== "") || (fromEnv && fromEnv !== ""));
  }
  return out;
}
