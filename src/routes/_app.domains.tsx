import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  getTokenStatus,
  listPersistedDomains,
  listRegistrarDomains,
  listRegistrarSyncJobs,
  type Registrar,
  type RegistrarDomainItem,
} from "@/lib/registrars.functions";
import { listRegistrars, type RegistrarCatalogItem } from "@/lib/registrar-catalog.functions";
import type {
  PersistedRegistrarDomain,
  RegistrarSyncJob,
} from "@/lib/registrar-domain-store.server";
import { listZones } from "@/lib/cloudflare.functions";
import { parseDomainList } from "@/lib/domain-utils";
import { setDomains, useDomains } from "@/lib/domain-store";
import { formatDateTime } from "@/lib/date-format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Clock3,
  Copy,
  ExternalLink,
  Globe2,
  ListChecks,
  Loader2,
  PenLine,
  PackageCheck,
  ScanSearch,
  Search,
  Server,
  Settings,
  Trash2,
  XCircle,
} from "lucide-react";
import { DnsDialog } from "@/components/dns-dialog";

export const Route = createFileRoute("/_app/domains")({
  head: () => ({ meta: [{ title: "域名列表 · dshunter" }] }),
  component: DomainsPage,
});

type Source =
  | "manual"
  | "spaceship"
  | "dynadot"
  | "porkbun"
  | "cf-registrar"
  | "cloudflare-zone"
  | "namecheap"
  | "aliyun"
  | "tencent"
  | "west";

type NsStatus = "cloudflare" | "other" | "unknown";
type PulledDomain = RegistrarDomainItem & {
  cloudflareStatus?: string;
  expectedNameservers?: string[];
};
type TokenStatus = Record<string, boolean | undefined>;
type CloudflareZoneRow = {
  name: string;
  current_name_servers?: string[];
  ns_status?: NsStatus;
  ns_error?: string;
  status?: string;
  name_servers?: string[];
};
type RegistrarSyncResult = {
  domains: string[];
  items?: PulledDomain[];
  syncJob?: RegistrarSyncJob;
};
type Entry = {
  domain: string;
  sources: Set<Source>;
  nameservers: string[];
  nsStatus: NsStatus;
  nsProvider?: string;
  nsError?: string;
  details: Partial<Record<Source, PulledDomain>>;
};
type ZoneFilter = "all" | "in-zone" | "not-in-zone";
type SortKey = "domain" | "ns" | "sources" | "zone";
type SortDir = "asc" | "desc";
type PullState = {
  status: "idle" | "loading" | "success" | "error";
  count: number;
  cloudflareCount?: number;
  at?: string;
  error?: string;
};

type SourceDef = {
  id: Exclude<Source, "manual" | "cf-registrar">;
  label: string;
  description: string;
  tokenKey: string;
  brandColor?: string;
};

const FALLBACK_SOURCE_DEFS: SourceDef[] = [
  {
    id: "cloudflare-zone",
    label: "Cloudflare Zone",
    description: "已接入 Cloudflare 的域名",
    tokenKey: "cloudflare",
  },
  { id: "spaceship", label: "Spaceship", description: "注册商域名列表", tokenKey: "spaceship" },
  { id: "dynadot", label: "Dynadot", description: "注册商域名列表", tokenKey: "dynadot" },
  { id: "porkbun", label: "Porkbun", description: "注册商域名列表", tokenKey: "porkbun" },
  { id: "namecheap", label: "Namecheap", description: "注册商域名列表", tokenKey: "namecheap" },
  { id: "aliyun", label: "阿里云", description: "万网域名列表", tokenKey: "aliyun" },
  { id: "tencent", label: "腾讯云", description: "域名服务列表", tokenKey: "tencent" },
  { id: "west", label: "西部数码", description: "West.cn 域名列表", tokenKey: "west" },
];

function DomainsPage() {
  const router = useRouter();
  const tokensFn = useServerFn(getTokenStatus);
  const listRegistrarFn = useServerFn(listRegistrars);
  const listFn = useServerFn(listRegistrarDomains);
  const persistedFn = useServerFn(listPersistedDomains);
  const jobsFn = useServerFn(listRegistrarSyncJobs);
  const zonesFn = useServerFn(listZones);
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => tokensFn() });
  const registrarCatalog = useQuery({
    queryKey: ["registrar-catalog"],
    queryFn: () => listRegistrarFn(),
  });
  const persistedAssets = useQuery({
    queryKey: ["persisted-registrar-domains"],
    queryFn: () => persistedFn() as Promise<{ rows: PersistedRegistrarDomain[] }>,
  });
  const syncJobs = useQuery({
    queryKey: ["registrar-sync-jobs"],
    queryFn: () => jobsFn() as Promise<{ rows: RegistrarSyncJob[] }>,
  });
  const tokenPresence: TokenStatus = tokens.data ?? {};
  const sourceDefs = useMemo(
    () => buildSourceDefs(registrarCatalog.data?.rows ?? []),
    [registrarCatalog.data?.rows],
  );

  const [dnsDomain, setDnsDomain] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<Source | "all">("all");
  const [nsFilter, setNsFilter] = useState<NsStatus | "all">("all");
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>("all");
  const [tldFilter, setTldFilter] = useState("all");
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("domain");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pulled, setPulled] = useState<Record<Source, PulledDomain[]>>({
    manual: [],
    spaceship: [],
    dynadot: [],
    porkbun: [],
    "cf-registrar": [],
    "cloudflare-zone": [],
    namecheap: [],
    aliyun: [],
    tencent: [],
    west: [],
  });
  const [pullState, setPullState] = useState<Record<Source, PullState>>({
    manual: { status: "idle", count: 0 },
    spaceship: { status: "idle", count: 0 },
    dynadot: { status: "idle", count: 0 },
    porkbun: { status: "idle", count: 0 },
    "cf-registrar": { status: "idle", count: 0 },
    "cloudflare-zone": { status: "idle", count: 0 },
    namecheap: { status: "idle", count: 0 },
    aliyun: { status: "idle", count: 0 },
    tencent: { status: "idle", count: 0 },
    west: { status: "idle", count: 0 },
  });

  const persisted = useDomains();
  const [selected, setSelected] = useState<Set<string>>(new Set(persisted));

  useEffect(() => {
    setSelected(new Set(persisted));
  }, [persisted]);

  useEffect(() => {
    setSearchPending(true);
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setSearchPending(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, sourceFilter, nsFilter, zoneFilter, tldFilter, pageSize, sortKey, sortDir]);

  useEffect(() => {
    const rows = persistedAssets.data?.rows ?? [];
    if (rows.length === 0) return;
    setPulled((current) => {
      const next = { ...current };
      for (const source of Object.keys(next) as Source[]) {
        if (source === "manual" || source === "cloudflare-zone") continue;
        next[source] = rows
          .filter((row) => row.registrar === source)
          .map((row) => ({
            domain: row.domain,
            nameservers: row.nameservers ?? [],
            nsStatus: row.nsStatus ?? "unknown",
            nsProvider: row.nsProvider,
            nsError:
              row.syncStatus === "missing"
                ? "注册商本次同步未返回，已保留并标记为缺失"
                : row.nsError,
          }));
      }
      return next;
    });
    setPullState((current) => {
      const next = { ...current };
      for (const source of Object.keys(next) as Source[]) {
        if (source === "manual" || source === "cloudflare-zone") continue;
        const sourceRows = rows.filter((row) => row.registrar === source);
        if (sourceRows.length === 0) continue;
        next[source] = {
          status: "success",
          count: sourceRows.length,
          cloudflareCount: sourceRows.filter((row) => row.nsStatus === "cloudflare").length,
          at: new Date(
            Math.max(...sourceRows.map((row) => Date.parse(row.lastSyncedAt) || 0)),
          ).toISOString(),
        };
      }
      return next;
    });
  }, [persistedAssets.data?.rows]);

  const pull = useMutation({
    mutationFn: async (src: Source) => {
      if (src === "cloudflare-zone") {
        const r = (await zonesFn()) as { zones: CloudflareZoneRow[] };
        return {
          src,
          items: r.zones.map((z) => ({
            domain: z.name,
            nameservers: z.current_name_servers ?? [],
            nsStatus: z.ns_status ?? "unknown",
            nsError: z.ns_error,
            cloudflareStatus: z.status,
            expectedNameservers: z.name_servers ?? [],
          })) as PulledDomain[],
        };
      }
      const r = (await listFn({ data: { registrar: src as Registrar } })) as RegistrarSyncResult;
      return {
        src,
        items: (r.items ??
          r.domains.map((domain: string) => ({
            domain,
            nameservers: [],
            nsStatus: "unknown",
          }))) as PulledDomain[],
        syncJob: r.syncJob,
      };
    },
    onMutate: (src) => {
      setPullState((p) => ({ ...p, [src]: { ...p[src], status: "loading", error: undefined } }));
    },
    onSuccess: ({ src, items, syncJob }) => {
      const cloudflareCount = items.filter((item) => item.nsStatus === "cloudflare").length;
      setPulled((p) => ({ ...p, [src]: items }));
      setPullState((p) => ({
        ...p,
        [src]: {
          status: "success",
          count: items.length,
          cloudflareCount,
          at: new Date().toISOString(),
        },
      }));
      // 记录最近一次拉取摘要，仪表盘展示用
      try {
        localStorage.setItem(
          "domainops.lastPull",
          JSON.stringify({
            source: sourceLabel(src, sourceDefs),
            count: items.length,
            cloudflareCount,
            at: new Date().toISOString(),
          }),
        );
      } catch {
        // localStorage 不可用时忽略
      }
      if (src !== "cloudflare-zone") {
        persistedAssets.refetch();
        syncJobs.refetch();
      }
      toast.success(
        syncJob
          ? `${sourceLabel(src, sourceDefs)} 同步完成：新增 ${syncJob.createdCount}，更新 ${syncJob.updatedCount}，缺失标记 ${syncJob.missingCount}`
          : `${sourceLabel(src, sourceDefs)} 拉取完成：${items.length} 个域名，${cloudflareCount} 个已指向 Cloudflare`,
      );
    },
    onError: (e: unknown, src) => {
      const message = e instanceof Error ? e.message : "拉取域名失败";
      setPullState((p) => ({
        ...p,
        [src]: { ...p[src], status: "error", error: message, at: new Date().toISOString() },
      }));
      toast.error(message);
    },
  });

  const merged = useMemo<Entry[]>(() => {
    const map = new Map<string, Entry>();
    const add = (item: PulledDomain, source: Source) => {
      const domain = item.domain.toLowerCase();
      const entry =
        map.get(domain) ||
        ({
          domain,
          sources: new Set<Source>(),
          nameservers: [],
          nsStatus: "unknown",
          details: {},
        } satisfies Entry);
      entry.sources.add(source);
      entry.details[source] = item;
      if (item.nameservers.length > 0) {
        entry.nameservers = item.nameservers;
      }
      entry.nsStatus = combineNsStatus(entry.nsStatus, item.nsStatus);
      if (item.nsProvider) entry.nsProvider = item.nsProvider;
      if (!entry.nsError && item.nsError) entry.nsError = item.nsError;
      map.set(domain, entry);
    };
    (Object.keys(pulled) as Source[]).forEach((s) => pulled[s].forEach((item) => add(item, s)));
    return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  }, [pulled]);

  const cfZonePulled = pullState["cloudflare-zone"].status === "success";

  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return merged.filter((e) => {
      if (q && !e.domain.includes(q)) return false;
      if (sourceFilter !== "all" && !e.sources.has(sourceFilter)) return false;
      if (nsFilter !== "all" && e.nsStatus !== nsFilter) return false;
      if (zoneFilter === "in-zone" && !e.details["cloudflare-zone"]) return false;
      if (zoneFilter === "not-in-zone" && e.details["cloudflare-zone"]) return false;
      if (tldFilter !== "all" && domainTld(e.domain) !== tldFilter) return false;
      return true;
    });
  }, [merged, debouncedQuery, sourceFilter, nsFilter, zoneFilter, tldFilter]);

  const tldCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of merged) {
      const tld = domainTld(entry.domain);
      if (!tld) continue;
      counts.set(tld, (counts.get(tld) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [merged]);

  const sortedVisible = useMemo(() => {
    const rows = [...visible];
    rows.sort((a, b) => {
      const factor = sortDir === "asc" ? 1 : -1;
      if (sortKey === "sources") return (a.sources.size - b.sources.size) * factor;
      if (sortKey === "ns") return a.nsStatus.localeCompare(b.nsStatus) * factor;
      if (sortKey === "zone") {
        const az = a.details["cloudflare-zone"] ? 1 : 0;
        const bz = b.details["cloudflare-zone"] ? 1 : 0;
        return (az - bz) * factor;
      }
      return a.domain.localeCompare(b.domain) * factor;
    });
    return rows;
  }, [visible, sortDir, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sortedVisible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = sortedVisible.slice(pageStart, pageStart + pageSize);
  const activeFilterCount = [
    debouncedQuery.trim(),
    sourceFilter !== "all",
    nsFilter !== "all",
    zoneFilter !== "all",
    tldFilter !== "all",
  ].filter(Boolean).length;

  const sourceCounts = useMemo(() => {
    const counts: Partial<Record<Source, number>> = {};
    for (const entry of merged) {
      for (const source of entry.sources) counts[source] = (counts[source] ?? 0) + 1;
    }
    return counts;
  }, [merged]);

  const duplicateCount = merged.filter((e) => e.sources.size > 1).length;
  const cloudflareNsCount = merged.filter((e) => e.nsStatus === "cloudflare").length;
  const configuredCount = sourceDefs.filter((s) => Boolean(tokenPresence[s.tokenKey])).length;

  const toggle = (d: string) => {
    const next = new Set(selected);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setSelected(next);
  };

  const saveSelection = () => {
    setDomains([...selected]);
    toast.success(`已保存 ${selected.size} 个域名，可到「批量绑定 / 解析记录」使用`);
  };

  const openDns = async (domain: string) => {
    setDomains([domain]);
    toast.success(`已切换到 ${domain} 的 DNS 管理`);
    await router.navigate({ to: "/records" });
  };

  const exportCsv = () => {
    const rows = sortedVisible.map((entry) => [
      entry.domain,
      [...entry.sources].map((source) => sourceLabel(source, sourceDefs)).join(" / "),
      entry.nsStatus,
      entry.nsProvider ?? "",
      entry.nameservers.join(" / "),
      entry.nsError ?? "",
    ]);
    const csv = [["domain", "sources", "ns_status", "ns_provider", "nameservers", "note"], ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    downloadText(`dshunter-domains-${new Date().toISOString().slice(0, 10)}.csv`, `\ufeff${csv}`);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="flex max-w-7xl flex-col gap-5 2xl:h-[calc(100vh-7rem)] 2xl:min-h-[720px]">
      <div className="shrink-0 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">域名列表</h1>
          <p className="text-sm text-muted-foreground">
            从注册商和 Cloudflare 拉取域名，合并去重后进入绑定或单域名 DNS 管理。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Metric label="合并域名" value={merged.length} />
          <Metric label="已选中" value={selected.size} />
          <Metric label="已指向 CF" value={cloudflareNsCount} />
          <Metric label="重复来源" value={duplicateCount} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:min-h-0 2xl:flex-1 2xl:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="space-y-4 2xl:min-h-0 2xl:overflow-auto 2xl:pr-1">
          <Card className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-semibold">手动添加的域名？</div>
              <div className="text-xs text-muted-foreground">手动输入 / CSV 导入已移至独立页面</div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/manual">
                <PenLine className="mr-1 size-3.5" />
                去手动域名
              </Link>
            </Button>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">注册商连接</div>
                <div className="text-xs text-muted-foreground">
                  已配置 {configuredCount} / {sourceDefs.length} 个来源
                </div>
              </div>
              <Server className="size-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {sourceDefs.map((source) => (
                <SourcePullRow
                  key={source.id}
                  source={source}
                  configured={Boolean(tokenPresence[source.tokenKey])}
                  loading={pull.isPending && pull.variables === source.id}
                  state={pullState[source.id]}
                  count={pulled[source.id].length}
                  onPull={() => pull.mutate(source.id)}
                />
              ))}
              {sourceDefs.length === 0 && (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  暂无启用的注册商来源，请到系统设置新增或启用。
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">最近同步</div>
                <div className="text-xs text-muted-foreground">
                  写入后端持久化文件，刷新和容器重启后仍保留
                </div>
              </div>
              <Badge variant="secondary">{syncJobs.data?.rows?.length ?? 0}</Badge>
            </div>
            <div className="space-y-2 text-xs">
              {(syncJobs.data?.rows ?? []).slice(0, 5).map((job) => (
                <div key={job.id} className="rounded-md border bg-background p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{sourceLabel(job.registrar, sourceDefs)}</span>
                    <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>
                      {job.status === "failed"
                        ? "失败"
                        : job.status === "partial_success"
                          ? "部分成功"
                          : "成功"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    新增 {job.createdCount} · 更新 {job.updatedCount} · 缺失 {job.missingCount}
                  </div>
                  <div className="mt-1 text-muted-foreground">{formatDateTime(job.finishedAt)}</div>
                </div>
              ))}
              {(syncJobs.data?.rows ?? []).length === 0 && (
                <div className="rounded-md border border-dashed p-3 text-muted-foreground">
                  暂无同步记录
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="flex min-h-[560px] flex-col overflow-hidden 2xl:min-h-0">
          <div className="shrink-0 border-b bg-muted/30 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  <ListChecks className="size-4" />
                  合并结果
                  <Badge variant="secondary">
                    {sortedVisible.length} / {merged.length}
                  </Badge>
                  {activeFilterCount > 0 && (
                    <Badge className="bg-primary/12 text-primary hover:bg-primary/12">
                      {activeFilterCount} 个筛选
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  每个域名可单独进入 DNS 管理；保存选中后仍可用于批量绑定和批量解析。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(new Set(sortedVisible.map((m) => m.domain)))}
                  disabled={sortedVisible.length === 0}
                >
                  选择当前结果
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                  清空
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCsv}
                  disabled={sortedVisible.length === 0}
                >
                  导出 CSV
                </Button>
                <Button size="sm" onClick={saveSelection} disabled={selected.size === 0}>
                  保存选中 ({selected.size})
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_190px_170px_170px_140px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索域名"
                  className="pl-9"
                />
                {searchPending && (
                  <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </label>
              <Select
                value={sourceFilter}
                onValueChange={(value) => setSourceFilter(value as Source | "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="全部来源" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部来源</SelectItem>
                  {sourceDefs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label} ({sourceCounts[s.id] ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={nsFilter}
                onValueChange={(value) => setNsFilter(value as NsStatus | "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="全部 NS 状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部 NS 状态</SelectItem>
                  <SelectItem value="cloudflare">已指向 Cloudflare</SelectItem>
                  <SelectItem value="other">未指向 Cloudflare</SelectItem>
                  <SelectItem value="unknown">NS 未查到</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={zoneFilter}
                onValueChange={(value) => {
                  const v = value as ZoneFilter;
                  setZoneFilter(v);
                  if (v !== "all" && !cfZonePulled) {
                    toast.info("尚未拉取 Cloudflare Zone，请先在左侧拉取，否则结果可能不准确");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="全部 Zone 状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部 Zone 状态</SelectItem>
                  <SelectItem value="in-zone">已接入 CF Zone</SelectItem>
                  <SelectItem value="not-in-zone">未接入 CF Zone</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => setPageSize(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="每页 100" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">每页 50</SelectItem>
                  <SelectItem value="100">每页 100</SelectItem>
                  <SelectItem value="200">每页 200</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={chipClass(tldFilter === "all")}
                onClick={() => setTldFilter("all")}
              >
                全部 TLD
              </button>
              {tldCounts.map(([tld, count]) => (
                <button
                  key={tld}
                  type="button"
                  className={chipClass(tldFilter === tld)}
                  onClick={() => setTldFilter(tld)}
                >
                  .{tld} <span className="text-muted-foreground">{count}</span>
                </button>
              ))}
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setSourceFilter("all");
                    setNsFilter("all");
                    setZoneFilter("all");
                    setTldFilter("all");
                  }}
                >
                  清除筛选
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-[420px] overflow-auto 2xl:min-h-0 2xl:flex-1">
            <TooltipProvider delayDuration={150}>
              <table className="min-w-[960px] w-full text-sm">
                <thead className="sticky top-0 z-20 bg-background shadow-[0_1px_0_var(--color-border)]">
                  <tr>
                    <th className="sticky left-0 z-30 w-12 bg-background p-3"></th>
                    <th className="sticky left-12 z-30 w-72 bg-background p-3 text-left font-medium text-muted-foreground">
                      <SortHeader
                        label="域名"
                        sortKey="domain"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                      />
                    </th>
                    <th className="min-w-80 p-3 text-left font-medium text-muted-foreground">
                      <SortHeader
                        label="当前 NS"
                        sortKey="ns"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                      />
                    </th>
                    <th className="w-32 p-3 text-left font-medium text-muted-foreground">
                      <SortHeader
                        label="CF Zone"
                        sortKey="zone"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                      />
                    </th>
                    <th className="min-w-56 p-3 text-left font-medium text-muted-foreground">
                      <SortHeader
                        label="来源"
                        sortKey="sources"
                        activeKey={sortKey}
                        dir={sortDir}
                        onSort={toggleSort}
                      />
                    </th>
                    <th className="sticky right-0 z-30 w-44 bg-background p-3 text-right font-medium text-muted-foreground">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedVisible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center">
                        <Globe2 className="mx-auto mb-3 size-8 text-muted-foreground" />
                        {merged.length === 0 ? (
                          <>
                            <div className="font-medium">还没有可操作的域名</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              粘贴域名或从左侧来源拉取，结果会在这里合并显示。
                            </div>
                            {configuredCount === 0 && (
                              <Button asChild variant="outline" size="sm" className="mt-3">
                                <Link to="/settings">
                                  <Settings className="mr-1 size-3.5" />
                                  先去配置注册商 / Cloudflare 凭证
                                </Link>
                              </Button>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="font-medium">当前筛选没有匹配结果</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              共 {merged.length} 个域名被筛选条件隐藏。
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => {
                                setQuery("");
                                setSourceFilter("all");
                                setNsFilter("all");
                                setZoneFilter("all");
                                setTldFilter("all");
                              }}
                            >
                              清除全部筛选
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                  {pageRows.map((e) => (
                    <tr
                      key={e.domain}
                      className="group relative border-t odd:bg-background even:bg-muted/10 hover:bg-accent/40"
                    >
                      <td className="sticky left-0 z-10 bg-inherit p-3 before:absolute before:left-0 before:top-0 before:h-full before:w-0.5 before:bg-transparent group-hover:before:bg-primary">
                        <Checkbox
                          checked={selected.has(e.domain)}
                          onCheckedChange={() => toggle(e.domain)}
                          aria-label={`选择 ${e.domain}`}
                        />
                      </td>
                      <td className="sticky left-12 z-10 bg-inherit p-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="max-w-64 truncate font-mono font-medium">
                              {e.domain}
                            </div>
                          </TooltipTrigger>
                          {e.domain.length > 30 && (
                            <TooltipContent
                              side="bottom"
                              align="start"
                              className="font-mono text-xs"
                            >
                              {e.domain}
                            </TooltipContent>
                          )}
                        </Tooltip>
                        {e.sources.size > 1 && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {e.sources.size} 个来源重复命中
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {nsBadge(e.nsStatus)}
                            {e.nsProvider && e.nsStatus !== "cloudflare" && (
                              <Badge variant="outline" className="w-fit text-[10px]">
                                {e.nsProvider}
                              </Badge>
                            )}
                          </div>
                          {e.nameservers.length > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="max-w-xs cursor-help truncate font-mono text-xs text-muted-foreground">
                                  {e.nameservers.join(" / ")}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" align="start" className="max-w-sm">
                                <div className="space-y-0.5 font-mono text-xs">
                                  {e.nameservers.map((ns) => (
                                    <div key={ns}>{ns}</div>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="font-mono text-xs text-muted-foreground">
                              {e.nsError ? `查询失败：${e.nsError}` : "无 nameserver 数据"}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">{zoneBadge(e, cfZonePulled)}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {[...e.sources].map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">
                              {sourceLabel(s, sourceDefs)}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="sticky right-0 z-10 bg-inherit p-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDnsDomain(e.domain)}
                          >
                            <ScanSearch className="mr-1 size-3.5" />
                            DNS
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              await navigator.clipboard.writeText(e.domain);
                              toast.success("域名已复制");
                            }}
                            aria-label={`复制 ${e.domain}`}
                          >
                            <Copy className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TooltipProvider>
          </div>
          <div className="flex shrink-0 flex-col gap-3 border-t bg-card/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-mono text-xs text-muted-foreground">
              第 {currentPage} / {pageCount} 页 · 显示{" "}
              {sortedVisible.length === 0 ? 0 : pageStart + 1}-
              {Math.min(pageStart + pageRows.length, sortedVisible.length)} / {sortedVisible.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(1)}
                disabled={currentPage <= 1}
              >
                首页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage <= 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={currentPage >= pageCount}
              >
                下一页
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-4xl flex-col gap-3 rounded-xl border border-primary/30 bg-card/95 p-3 shadow-2xl shadow-black/35 backdrop-blur md:left-[calc(50%+2rem)] md:right-auto md:w-[min(44rem,calc(100vw-18rem))] md:-translate-x-1/2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
              <PackageCheck className="size-4" />
            </span>
            <div>
              <div className="text-sm font-medium">已选中 {selected.size} 个域名</div>
              <div className="text-xs text-muted-foreground">
                跨页选择已保留，可保存为工作集或导出。
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/bind">批量绑定</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              导出 CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              <Trash2 className="size-3.5" />
              清空
            </Button>
            <Button size="sm" onClick={saveSelection}>
              保存工作集
            </Button>
          </div>
        </div>
      )}

      <DnsDialog
        domain={dnsDomain}
        onClose={() => setDnsDomain(null)}
        onEditInCloudflare={openDns}
      />
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-accent hover:text-accent-foreground"
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )
      ) : (
        <ChevronsUpDown className="size-3.5 opacity-45" />
      )}
    </button>
  );
}

function chipClass(active: boolean) {
  return [
    "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs transition-colors",
    active
      ? "border-primary/40 bg-primary/12 text-primary"
      : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
  ].join(" ");
}

function domainTld(domain: string) {
  const parts = domain.split(".").filter(Boolean);
  return parts.length > 1 ? (parts.at(-1) ?? "") : "";
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-md border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function combineNsStatus(a: NsStatus, b: NsStatus): NsStatus {
  if (a === "cloudflare" || b === "cloudflare") return "cloudflare";
  if (a === "other" || b === "other") return "other";
  return "unknown";
}

function nsBadge(status: NsStatus) {
  if (status === "cloudflare") {
    return (
      <Badge className="w-fit bg-success text-success-foreground hover:bg-success">已指向 CF</Badge>
    );
  }
  if (status === "other")
    return (
      <Badge variant="outline" className="w-fit">
        非 CF NS
      </Badge>
    );
  return (
    <Badge variant="secondary" className="w-fit">
      NS 未查到
    </Badge>
  );
}

// CF Zone 接入状态：需要先拉取过 Cloudflare Zone 来源才能判断"未接入"
function zoneBadge(entry: Entry, cfZonePulled: boolean) {
  const zone = entry.details["cloudflare-zone"];
  if (zone) {
    const s = zone.cloudflareStatus ?? "unknown";
    if (s === "active") {
      return (
        <Badge className="bg-success text-success-foreground hover:bg-success text-[10px]">
          active
        </Badge>
      );
    }
    if (s === "pending") {
      return (
        <Badge variant="outline" className="border-warning/50 text-warning text-[10px]">
          pending
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px]">
        {s}
      </Badge>
    );
  }
  if (cfZonePulled) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        未接入
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function SourcePullRow({
  source,
  configured,
  loading,
  state,
  count,
  onPull,
}: {
  source: SourceDef;
  configured: boolean;
  loading: boolean;
  state: PullState;
  count: number;
  onPull: () => void;
}) {
  const status = loading ? "loading" : state.status;
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{source.label}</span>
            {configured ? (
              <CheckCircle2 className="size-3.5 text-success" />
            ) : (
              <XCircle className="size-3.5 text-muted-foreground" />
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{source.description}</div>
        </div>
        {configured ? (
          <Button size="sm" variant="outline" onClick={onPull} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <ExternalLink className="mr-1 size-3.5" />
            )}
            {source.id === "cloudflare-zone" ? "拉取" : "同步注册商域名"}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" asChild className="text-muted-foreground">
            <Link to="/settings">
              <Settings className="mr-1 size-3.5" />
              去设置
            </Link>
          </Button>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          {status === "success" ? (
            <CheckCircle2 className="size-3.5 text-success" />
          ) : status === "error" ? (
            <XCircle className="size-3.5 text-destructive" />
          ) : status === "loading" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Clock3 className="size-3.5" />
          )}
          <span>{statusLabel(status, count, state.cloudflareCount)}</span>
        </div>
        {state.at && <span>{formatDateTime(state.at)}</span>}
      </div>
      {state.error && (
        <div className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {state.error}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: PullState["status"], count: number, cloudflareCount = 0) {
  if (status === "loading") return "正在拉取";
  if (status === "success") return `已拉取 ${count} 个，${cloudflareCount} 个 CF NS`;
  if (status === "error") return "拉取失败";
  return "等待拉取";
}

function csvCell(value: string) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sourceLabel(source: Source, sourceDefs: readonly SourceDef[] = FALLBACK_SOURCE_DEFS) {
  if (source === "manual") return "手动";
  const found =
    sourceDefs.find((s) => s.id === source) ?? FALLBACK_SOURCE_DEFS.find((s) => s.id === source);
  return found?.label ?? source;
}

function buildSourceDefs(catalog: RegistrarCatalogItem[]): SourceDef[] {
  if (catalog.length === 0) return FALLBACK_SOURCE_DEFS;
  const rows = catalog.filter((row) => row.active && row.supportsSync);
  const defs = rows
    .map((row): SourceDef | null => {
      if (row.id === "cloudflare") {
        return {
          id: "cloudflare-zone",
          label: "Cloudflare Zone",
          description: "已接入 Cloudflare 的域名",
          tokenKey: "cloudflare",
          brandColor: row.brandColor,
        };
      }
      if (isSourceId(row.id)) {
        return {
          id: row.id,
          label: row.shortName || row.name,
          description: "注册商域名列表",
          tokenKey: row.id,
          brandColor: row.brandColor,
        };
      }
      return null;
    })
    .filter((row): row is SourceDef => Boolean(row));
  return defs;
}

function isSourceId(value: string): value is SourceDef["id"] {
  return (
    value === "spaceship" ||
    value === "dynadot" ||
    value === "porkbun" ||
    value === "cloudflare-zone" ||
    value === "namecheap" ||
    value === "aliyun" ||
    value === "tencent" ||
    value === "west"
  );
}
