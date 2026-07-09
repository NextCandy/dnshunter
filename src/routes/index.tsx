import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeckMark } from "@/components/deck-mark";
import { useTheme } from "@/components/theme";
import { cn } from "@/lib/utils";
import { listPublicDomainAssets, type PublicDomainRow } from "@/lib/public.functions";
import { getSiteSettings } from "@/lib/site-settings.functions";
import { domainBody, domainSuffix, normalizeDomainLoose } from "@/lib/domain-utils";
import {
  ChevronLeft,
  ChevronRight,
  Github,
  Link2,
  LockKeyhole,
  Mail,
  MessageCircle,
  Moon,
  Search,
  Send,
  Star,
  Sun,
  Twitter,
} from "lucide-react";
import type { ContactLink, SiteSettings } from "@/lib/site-settings.server";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DS Hunter · 域名展示" },
      {
        name: "description",
        content: "快速浏览和筛选 DS Hunter 整理的域名。",
      },
      { property: "og:title", content: "DS Hunter · 域名展示" },
      { property: "og:description", content: "快速浏览和筛选 DS Hunter 整理的域名。" },
    ],
  }),
  component: PublicHome,
});

type LengthFilter = "all" | "1" | "2" | "3" | "4" | "5" | "6+";
type FeaturedFilter = "all" | "featured" | "normal";

function PublicHome() {
  const listFn = useServerFn(listPublicDomainAssets);
  const siteSettingsFn = useServerFn(getSiteSettings);
  const q = useQuery({ queryKey: ["public-domain-assets"], queryFn: () => listFn() });
  const settingsQuery = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingsFn(),
    staleTime: 60_000,
  });
  const settings = settingsQuery.data?.settings ?? DEFAULT_PUBLIC_SETTINGS;

  // ---------- 筛选状态 ----------
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [suffix, setSuffix] = useState("all");
  const [lengthFilter, setLengthFilter] = useState<LengthFilter>("all");
  const [featuredFilter, setFeaturedFilter] = useState<FeaturedFilter>("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  // 筛选条件变化时分页回到第一页（筛选条件本身保持不变）
  useEffect(() => {
    setPage(1);
  }, [debounced, suffix, lengthFilter, featuredFilter, category]);

  useEffect(() => {
    document.title = titleForSettings(settings);
    setMeta("description", settings.seoDescription || settings.siteDescription);
    setFavicon(settings.faviconUrl);
  }, [settings]);

  const loading = q.isLoading;

  // ---------- 去重（标准化域名，双保险：服务端已去重，这里再兜底） ----------
  const deduped = useMemo(() => {
    const rows = (q.data?.rows ?? []) as PublicDomainRow[];
    const map = new Map<string, PublicDomainRow>();
    for (const row of rows) {
      const key = normalizeDomainLoose(row.domain);
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...row, domain: key });
      } else {
        existing.featured = existing.featured || row.featured;
        if (!existing.category && row.category) existing.category = row.category;
        if (row.sortOrder !== undefined) {
          existing.sortOrder =
            existing.sortOrder !== undefined
              ? Math.min(existing.sortOrder, row.sortOrder)
              : row.sortOrder;
        }
      }
    }
    return [...map.values()];
  }, [q.data?.rows]);

  // ---------- 筛选选项：后缀 / 分类均从真实数据生成 ----------
  const suffixOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of deduped) {
      const s = domainSuffix(row.domain);
      if (!s) continue;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [deduped]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of deduped) if (row.category) set.add(row.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [deduped]);

  // ---------- 去重后：筛选 → 排序 → 分页 ----------
  const filtered = useMemo(() => {
    return deduped.filter((row) => {
      if (debounced && !row.domain.includes(debounced)) return false;
      if (suffix !== "all" && domainSuffix(row.domain) !== suffix) return false;
      if (lengthFilter !== "all") {
        const len = domainBody(row.domain).length;
        if (lengthFilter === "6+" ? len < 6 : len !== Number(lengthFilter)) return false;
      }
      if (featuredFilter === "featured" && !row.featured) return false;
      if (featuredFilter === "normal" && row.featured) return false;
      if (category !== "all" && row.category !== category) return false;
      return true;
    });
  }, [deduped, debounced, suffix, lengthFilter, featuredFilter, category]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // 精品永远在前
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      // 组内：有排序权重的在前，权重小的在前
      const aw = a.sortOrder;
      const bw = b.sortOrder;
      if (aw !== undefined || bw !== undefined) {
        if (aw === undefined) return 1;
        if (bw === undefined) return -1;
        if (aw !== bw) return aw - bw;
      }
      // 最后按字母序，保证稳定可预测
      return a.domain.localeCompare(b.domain);
    });
  }, [filtered]);

  // ---------- 动态每页数量：按列表可用区域自适应，保证电脑端一屏内 ----------
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(24);

  useEffect(() => {
    const el = gridAreaRef.current;
    if (!el) return;
    const compute = () => {
      const cols = gridColsForViewport(window.innerWidth);
      const cardH = 44; // h-11
      const gap = 8; // gap-2
      const rows = Math.max(2, Math.floor((el.clientHeight + gap) / (cardH + gap)));
      setPageSize(Math.max(10, cols * rows));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, []);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  return (
    <main className="flex h-dvh min-h-[420px] flex-col bg-background text-foreground">
      {/* ---------- 页首 ---------- */}
      <header className="shrink-0 border-b border-border/60">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/25">
              <BrandIcon logoUrl={settings.logoUrl} className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] font-bold leading-none tracking-tight">
                {settings.siteName}
              </span>
              <span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {settings.shortDescription}
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeSwitch />
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to="/unlock">
                <LockKeyhole className="size-4" />
                登录后台
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------- 域名列表区（筛选 + 网格 + 分页） ---------- */}
      <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 overflow-hidden px-4 py-3 sm:px-6 lg:px-8">
        {settings.announcement && (
          <div className="shrink-0 truncate rounded-md border border-primary/25 bg-primary/8 px-3 py-1.5 text-xs text-primary">
            {settings.announcement}
          </div>
        )}

        {/* 紧凑筛选区 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="relative min-w-40 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索域名…"
              className="h-9 pl-9 font-mono"
              aria-label="按名称搜索域名"
            />
          </label>
          <Select value={suffix} onValueChange={setSuffix}>
            <SelectTrigger className="h-9 w-[7.5rem]" aria-label="按后缀筛选">
              <SelectValue placeholder="后缀" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部后缀</SelectItem>
              {suffixOptions.map(([s, count]) => (
                <SelectItem key={s} value={s}>
                  {s}（{count}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={lengthFilter} onValueChange={(v) => setLengthFilter(v as LengthFilter)}>
            <SelectTrigger className="h-9 w-[7.5rem]" aria-label="按字符位数筛选">
              <SelectValue placeholder="位数" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部位数</SelectItem>
              <SelectItem value="1">1 位</SelectItem>
              <SelectItem value="2">2 位</SelectItem>
              <SelectItem value="3">3 位</SelectItem>
              <SelectItem value="4">4 位</SelectItem>
              <SelectItem value="5">5 位</SelectItem>
              <SelectItem value="6+">6 位及以上</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={featuredFilter}
            onValueChange={(v) => setFeaturedFilter(v as FeaturedFilter)}
          >
            <SelectTrigger className="h-9 w-[7rem]" aria-label="按精品筛选">
              <SelectValue placeholder="精品" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="featured">精品</SelectItem>
              <SelectItem value="normal">非精品</SelectItem>
            </SelectContent>
          </Select>
          {categoryOptions.length > 0 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-[7.5rem]" aria-label="按其他分类筛选">
                <SelectValue placeholder="其他" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分类</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {sorted.length} / {deduped.length}
          </span>
        </div>

        {/* 域名网格 */}
        <div ref={gridAreaRef} className="min-h-0 flex-1 overflow-y-auto">
          {pageRows.length === 0 ? (
            <div className="grid h-full min-h-32 place-items-center text-sm text-muted-foreground">
              {loading ? "正在载入域名…" : "暂无匹配的域名"}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {pageRows.map((row) => (
                <div
                  key={row.domain}
                  title={row.domain}
                  className={cn(
                    "flex h-11 min-w-0 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 transition-colors hover:border-primary/40",
                    row.featured && "border-primary/35 bg-primary/6",
                  )}
                >
                  {row.featured && (
                    <Star
                      className="size-3.5 shrink-0 fill-warning text-warning"
                      aria-label="精品"
                    />
                  )}
                  <span className="truncate font-mono text-sm font-medium">{row.domain}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 分页（仅作用于域名列表） */}
        <div className="flex shrink-0 items-center justify-between gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            第 {currentPage} / {pageCount} 页
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage((v) => Math.max(1, v - 1))}
              disabled={currentPage <= 1}
              aria-label="上一页"
            >
              <ChevronLeft className="size-4" />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
              disabled={currentPage >= pageCount}
              aria-label="下一页"
            >
              下一页
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ---------- 页脚 ---------- */}
      <footer className="shrink-0 border-t border-border/60">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <BrandIcon logoUrl={settings.logoUrl} className="size-4" />
            <span className="font-mono">{settings.siteName}</span>
          </div>
          <ContactIcons links={effectiveContactLinks(settings)} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {settings.showIcp && settings.icpNumber && <span>{settings.icpNumber}</span>}
            {settings.showPoliceRecord && settings.policeRecordNumber && (
              <span>{settings.policeRecordNumber}</span>
            )}
            {settings.showFooterText && (
              <span>
                © {settings.copyrightYear} {settings.copyrightOwner}
              </span>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}

// 视口宽度 → 网格列数（与上方 Tailwind grid-cols 断点保持一致）
function gridColsForViewport(width: number) {
  if (width >= 1536) return 6;
  if (width >= 1280) return 5;
  if (width >= 768) return 4;
  if (width >= 640) return 3;
  return 2;
}

// 联系方式：后台已配置 contactLinks 时只用它；
// 兼容旧数据：未配置时从旧 contactEmail / contactTelegram 派生图标（不落盘）。
function effectiveContactLinks(settings: SiteSettings): ContactLink[] {
  const configured = (settings.contactLinks ?? []).filter((link) => link.enabled && link.url);
  if (configured.length > 0) {
    return [...configured].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  const derived: ContactLink[] = [];
  if (settings.contactEmail) {
    derived.push({
      type: "email",
      label: settings.contactEmail,
      url: `mailto:${settings.contactEmail}`,
      enabled: true,
      sortOrder: 0,
    });
  }
  if (settings.contactTelegram) {
    const handle = settings.contactTelegram.replace(/^@/, "");
    derived.push({
      type: "telegram",
      label: `Telegram：${settings.contactTelegram}`,
      url: /^https?:\/\//.test(settings.contactTelegram)
        ? settings.contactTelegram
        : `https://t.me/${handle}`,
      enabled: true,
      sortOrder: 1,
    });
  }
  return derived;
}

function ContactIcons({ links }: { links: ContactLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {links.map((link) => {
        const Icon = CONTACT_ICONS[link.type] ?? Link2;
        const external = !link.url.startsWith("mailto:");
        return (
          <a
            key={`${link.type}-${link.url}`}
            href={link.url}
            title={link.label}
            aria-label={link.label}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Icon className="size-4" />
          </a>
        );
      })}
    </div>
  );
}

const CONTACT_ICONS: Record<ContactLink["type"], typeof Mail> = {
  email: Mail,
  telegram: Send,
  wechat: MessageCircle,
  x: Twitter,
  github: Github,
  custom: Link2,
};

const DEFAULT_PUBLIC_SETTINGS: SiteSettings = {
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

function setMeta(name: string, content: string) {
  if (!content) return;
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function titleForSettings(settings: SiteSettings) {
  const customTitle = settings.seoTitle.trim();
  return customTitle && customTitle !== DEFAULT_PUBLIC_SETTINGS.seoTitle
    ? customTitle
    : settings.siteName;
}

function setFavicon(href: string) {
  if (!href) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-site-settings="true"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.dataset.siteSettings = "true";
    document.head.appendChild(link);
  }
  link.href = href;
}

function BrandIcon({ logoUrl, className }: { logoUrl: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [logoUrl]);
  // 默认使用站点自带 DS Logo（public/logo.png，不带字母版）；后台配置的 logoUrl 优先。
  const src = logoUrl || "/logo.png";
  if (failed) return <DeckMark className={className} />;
  return (
    <img
      src={src}
      alt=""
      className={cn("rounded-sm object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}

function ThemeSwitch() {
  const { resolved, setTheme } = useTheme();
  const isDark = resolved === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "切换到浅色" : "切换到深色"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
