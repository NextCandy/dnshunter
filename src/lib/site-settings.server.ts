import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type SocialLink = {
  label: string;
  url: string;
};

export type ContactLinkType = "email" | "telegram" | "wechat" | "x" | "github" | "custom";

export type ContactLink = {
  /** 图标类型 */
  type: ContactLinkType;
  /** 显示名称（tooltip / aria-label） */
  label: string;
  /** 链接地址：mailto:… 或 http(s)://… */
  url: string;
  /** 是否启用；未启用的前台不显示 */
  enabled: boolean;
  /** 排序，越小越靠前 */
  sortOrder: number;
};

export const CONTACT_LINK_TYPES: ContactLinkType[] = [
  "email",
  "telegram",
  "wechat",
  "x",
  "github",
  "custom",
];

export type SiteSettings = {
  siteName: string;
  siteDescription: string;
  shortDescription: string;
  heroDescription: string;
  logoUrl: string;
  faviconUrl: string;
  contactEmail: string;
  contactText: string;
  contactWechat: string;
  contactTelegram: string;
  contactQQ: string;
  icpNumber: string;
  policeRecordNumber: string;
  footerText: string;
  showIcp: boolean;
  showPoliceRecord: boolean;
  showFooterText: boolean;
  seoTitle: string;
  seoDescription: string;
  copyrightOwner: string;
  copyrightYear: string;
  announcement: string;
  socialLinks: SocialLink[];
  /** 前台联系方式小图标超链接；旧数据默认空列表 */
  contactLinks: ContactLink[];
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  siteName: "DS Hunter",
  siteDescription: "专业的域名展示、筛选与管理工具",
  shortDescription: "域名展示与筛选工具",
  heroDescription: "集中展示、筛选和管理你的域名项目。",
  logoUrl: "",
  faviconUrl: "",
  contactEmail: "",
  contactText: "",
  contactWechat: "",
  contactTelegram: "",
  contactQQ: "",
  icpNumber: "",
  policeRecordNumber: "",
  footerText: "",
  showIcp: false,
  showPoliceRecord: false,
  showFooterText: true,
  seoTitle: "DS Hunter",
  seoDescription: "DS Hunter - 域名展示、筛选与管理工具",
  copyrightOwner: "DS Hunter",
  copyrightYear: String(new Date().getFullYear()),
  announcement: "",
  socialLinks: [],
  contactLinks: [],
};

const FILE = process.env.SITE_SETTINGS_FILE || join(process.cwd(), "data", "site-settings.json");
const BACKUP_DIR = join(dirname(FILE), "site-settings.backups");
const MAX_BACKUPS = 20;

let cache: SiteSettings | null = null;

const LIMITS: Record<
  keyof Omit<
    SiteSettings,
    "showIcp" | "showPoliceRecord" | "showFooterText" | "socialLinks" | "contactLinks"
  >,
  number
> = {
  siteName: 80,
  siteDescription: 300,
  shortDescription: 160,
  heroDescription: 420,
  logoUrl: 500,
  faviconUrl: 500,
  contactEmail: 160,
  contactText: 240,
  contactWechat: 80,
  contactTelegram: 120,
  contactQQ: 80,
  icpNumber: 80,
  policeRecordNumber: 100,
  footerText: 240,
  seoTitle: 120,
  seoDescription: 300,
  copyrightOwner: 120,
  copyrightYear: 12,
  announcement: 300,
};

function trimText(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  return [...value]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, max);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function safeUrl(value: unknown, field: "logoUrl" | "faviconUrl" | "socialLinks"): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  if (raw.length > 500) throw new Error(`${field} 过长`);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${field} 必须是有效 URL`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${field} 只允许 http 或 https URL`);
  }
  return parsed.toString();
}

function email(value: unknown): string {
  const raw = trimText(value, "", LIMITS.contactEmail);
  if (!raw) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new Error("contactEmail 格式不正确");
  }
  return raw;
}

// 联系方式链接 URL：允许 mailto: 与 http(s)；纯邮箱自动补 mailto: 前缀。
function contactUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  if (raw.length > 500) throw new Error("contactLinks URL 过长");
  const candidate = /^[^\s@:/]+@[^\s@]+\.[^\s@]+$/.test(raw) ? `mailto:${raw}` : raw;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("contactLinks URL 必须是有效的 mailto: 或 http(s) 链接");
  }
  if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) {
    throw new Error("contactLinks 只允许 mailto: 或 http(s) 链接");
  }
  return candidate;
}

function normalizeContactLinks(value: unknown): ContactLink[] {
  if (!Array.isArray(value)) return [];
  const links = value.slice(0, 12).flatMap((item, index): ContactLink[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const type = CONTACT_LINK_TYPES.includes(source.type as ContactLinkType)
      ? (source.type as ContactLinkType)
      : "custom";
    const label = trimText(source.label, "", 40);
    const url = contactUrl(source.url);
    if (!url) return [];
    return [
      {
        type,
        label: label || type,
        url,
        enabled: typeof source.enabled === "boolean" ? source.enabled : true,
        sortOrder:
          typeof source.sortOrder === "number" && Number.isFinite(source.sortOrder)
            ? Math.round(source.sortOrder)
            : index,
      },
    ];
  });
  return links.sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeSocialLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    const label = trimText(source.label, "", 40);
    if (!label) return [];
    return [{ label, url: safeUrl(source.url, "socialLinks") }];
  });
}

export function normalizeSiteSettings(input: unknown): SiteSettings {
  const obj = input && typeof input === "object" ? (input as Partial<SiteSettings>) : {};
  return {
    siteName:
      trimText(obj.siteName, DEFAULT_SITE_SETTINGS.siteName, LIMITS.siteName) ||
      DEFAULT_SITE_SETTINGS.siteName,
    siteDescription:
      trimText(
        obj.siteDescription,
        DEFAULT_SITE_SETTINGS.siteDescription,
        LIMITS.siteDescription,
      ) || DEFAULT_SITE_SETTINGS.siteDescription,
    shortDescription:
      trimText(
        obj.shortDescription,
        DEFAULT_SITE_SETTINGS.shortDescription,
        LIMITS.shortDescription,
      ) || DEFAULT_SITE_SETTINGS.shortDescription,
    heroDescription:
      trimText(
        obj.heroDescription,
        DEFAULT_SITE_SETTINGS.heroDescription,
        LIMITS.heroDescription,
      ) || DEFAULT_SITE_SETTINGS.heroDescription,
    logoUrl: safeUrl(obj.logoUrl, "logoUrl"),
    faviconUrl: safeUrl(obj.faviconUrl, "faviconUrl"),
    contactEmail: email(obj.contactEmail),
    contactText: trimText(obj.contactText, "", LIMITS.contactText),
    contactWechat: trimText(obj.contactWechat, "", LIMITS.contactWechat),
    contactTelegram: trimText(obj.contactTelegram, "", LIMITS.contactTelegram),
    contactQQ: trimText(obj.contactQQ, "", LIMITS.contactQQ),
    icpNumber: trimText(obj.icpNumber, "", LIMITS.icpNumber),
    policeRecordNumber: trimText(obj.policeRecordNumber, "", LIMITS.policeRecordNumber),
    footerText: trimText(obj.footerText, "", LIMITS.footerText),
    showIcp: bool(obj.showIcp, DEFAULT_SITE_SETTINGS.showIcp),
    showPoliceRecord: bool(obj.showPoliceRecord, DEFAULT_SITE_SETTINGS.showPoliceRecord),
    showFooterText: bool(obj.showFooterText, DEFAULT_SITE_SETTINGS.showFooterText),
    seoTitle:
      trimText(obj.seoTitle, DEFAULT_SITE_SETTINGS.seoTitle, LIMITS.seoTitle) ||
      DEFAULT_SITE_SETTINGS.seoTitle,
    seoDescription:
      trimText(obj.seoDescription, DEFAULT_SITE_SETTINGS.seoDescription, LIMITS.seoDescription) ||
      DEFAULT_SITE_SETTINGS.seoDescription,
    copyrightOwner:
      trimText(obj.copyrightOwner, DEFAULT_SITE_SETTINGS.copyrightOwner, LIMITS.copyrightOwner) ||
      DEFAULT_SITE_SETTINGS.copyrightOwner,
    copyrightYear:
      trimText(obj.copyrightYear, DEFAULT_SITE_SETTINGS.copyrightYear, LIMITS.copyrightYear) ||
      DEFAULT_SITE_SETTINGS.copyrightYear,
    announcement: trimText(obj.announcement, "", LIMITS.announcement),
    socialLinks: normalizeSocialLinks(obj.socialLinks),
    contactLinks: normalizeContactLinks(obj.contactLinks),
  };
}

export async function readSiteSettings(): Promise<SiteSettings> {
  if (cache) return cache;
  try {
    const txt = await readFile(FILE, "utf8");
    cache = normalizeSiteSettings(JSON.parse(txt));
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code !== "ENOENT") {
      console.error(
        "[site-settings] 读取失败:",
        error instanceof Error ? error.message : String(error),
      );
    }
    cache = { ...DEFAULT_SITE_SETTINGS };
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
    await writeFile(join(BACKUP_DIR, `site-settings-${stamp}.json`), current, { mode: 0o600 });
    const files = (await readdir(BACKUP_DIR))
      .filter((file) => file.startsWith("site-settings-") && file.endsWith(".json"))
      .sort();
    while (files.length > MAX_BACKUPS) {
      const old = files.shift();
      if (old) await unlink(join(BACKUP_DIR, old)).catch(() => {});
    }
  } catch {
    // 备份失败不阻断主保存，避免后台因备份目录权限短暂异常不可用。
  }
}

export async function saveSiteSettings(input: unknown): Promise<SiteSettings> {
  const settings = normalizeSiteSettings(input);
  await backupCurrentFile();
  await mkdir(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, FILE);
  cache = settings;
  return settings;
}
