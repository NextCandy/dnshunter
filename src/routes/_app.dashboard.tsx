import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getTokenStatus } from "@/lib/registrars.functions";
import { listRegistrars, type RegistrarCatalogItem } from "@/lib/registrar-catalog.functions";
import { getCfHealth } from "@/lib/cloudflare.functions";
import { useDomains } from "@/lib/domain-store";
import { formatDateTime } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, Link2, ListTree, Settings, KeyRound, ShieldCheck, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "指挥台 · dshunter" }] }),
  component: Dashboard,
});

type LastPull = { source: string; count: number; cloudflareCount: number; at: string };
type TokenMap = Record<string, boolean | undefined>;

function Dashboard() {
  const tokenFn = useServerFn(getTokenStatus);
  const listRegistrarFn = useServerFn(listRegistrars);
  const healthFn = useServerFn(getCfHealth);
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => tokenFn() });
  const registrars = useQuery({
    queryKey: ["registrar-catalog"],
    queryFn: () => listRegistrarFn(),
  });
  const health = useQuery({ queryKey: ["cf-health"], queryFn: () => healthFn() });
  const workingSet = useDomains();
  const activeRegistrars = (registrars.data?.rows ?? []).filter((row) => row.active);
  const tokenMap: TokenMap = tokens.data ?? {};

  const [lastPull, setLastPull] = useState<LastPull | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("domainops.lastPull");
      if (raw) setLastPull(JSON.parse(raw));
    } catch {
      // 忽略损坏的缓存
    }
  }, []);

  const configuredCount = tokens.data
    ? activeRegistrars.filter((source) => registrarConfigured(source, tokenMap)).length
    : null;

  const stats: StatReadout[] = [
    {
      label: "已配置来源",
      value: configuredCount === null ? "…" : `${configuredCount}/${activeRegistrars.length}`,
      dot: "signal-primary",
      to: "/settings",
    },
    {
      label: "Cloudflare Zone",
      value: health.isLoading
        ? "…"
        : health.data?.zoneCount != null
          ? String(health.data.zoneCount)
          : "—",
      sub:
        health.data?.zoneCount != null && health.data.activeZones != null
          ? `${health.data.activeZones} 个已激活`
          : undefined,
      dot: "signal-success",
      to: "/domains",
    },
    {
      label: "工作集域名",
      value: String(workingSet.length),
      sub: workingSet.length > 0 ? "可直接批量绑定 / 解析" : "到域名列表选择",
      dot: workingSet.length > 0 ? "signal-warning" : "signal-muted",
      to: "/records",
    },
    {
      label: "最近拉取",
      value: lastPull ? String(lastPull.count) : "—",
      sub: lastPull ? `${lastPull.source} · ${formatDateTime(lastPull.at)}` : "还没有拉取记录",
      dot: "signal-muted",
      to: "/domains",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* 概览横幅 */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-50" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative p-5 md:p-6">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <span className="signal signal-success signal-pulse" />
            System Overview
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">运营概览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            来源配置、Cloudflare 接入与工作集状态一览。
          </p>

          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 md:grid-cols-4">
            {stats.map((s) => (
              <Link
                key={s.label}
                to={s.to}
                className="group bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn("signal", s.dot)} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </span>
                </div>
                <div className="mt-2 font-display text-2xl font-bold tabular">{s.value}</div>
                {s.sub && (
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.sub}</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Cloudflare 健康状态 */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            {health.isLoading ? (
              <>
                <span className="signal signal-muted" />
                <span className="text-muted-foreground">检测中…</span>
              </>
            ) : health.data?.tokenStatus === "active" && !health.data.error ? (
              <>
                <span className="signal signal-success" />
                <ShieldCheck className="size-4 text-success" />
                <span className="text-success">Cloudflare Token 有效，Zone 读取正常</span>
              </>
            ) : health.data?.tokenStatus === "active" && health.data.error ? (
              <>
                <span className="signal signal-warning" />
                <ShieldAlert className="size-4 text-warning" />
                <span className="text-warning">Token 有效但权限不足</span>
              </>
            ) : health.data?.tokenStatus === "invalid" ? (
              <>
                <span className="signal signal-danger" />
                <ShieldAlert className="size-4 text-destructive" />
                <span className="text-destructive">Cloudflare Token 无效（verify 未通过）</span>
              </>
            ) : (
              <>
                <span className="signal signal-muted" />
                <KeyRound className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Cloudflare Token 未配置</span>
              </>
            )}
          </div>
          {health.data && (health.data.tokenStatus !== "active" || health.data.error) && (
            <Button asChild size="sm" variant="outline">
              <Link to="/settings">
                <Settings className="mr-1 size-3.5" />
                去设置
              </Link>
            </Button>
          )}
        </div>
        {health.data?.error && <p className="mt-2 text-xs text-destructive">{health.data.error}</p>}
        {health.error && (
          <p className="mt-2 text-xs text-destructive">{(health.error as Error).message}</p>
        )}
      </Card>

      {/* 来源凭证矩阵 */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display font-semibold">API 凭证状态</div>
          <Button asChild size="sm" variant="ghost">
            <Link to="/settings">管理</Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {activeRegistrars.map((s) => {
            const ok = tokens.data ? registrarConfigured(s, tokenMap) : undefined;
            return (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: s.brandColor }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{s.shortName}</span>
                </span>
                <span
                  className={cn(
                    "signal",
                    ok === undefined ? "signal-muted" : ok ? "signal-success" : "signal-muted",
                    ok === false && "opacity-40",
                  )}
                />
              </div>
            );
          })}
          {activeRegistrars.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
              暂无启用的注册商来源，请到系统设置新增或启用来源。
            </div>
          )}
        </div>
      </Card>

      {/* 快捷入口 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <QuickLink
          to="/domains"
          icon={<Globe className="size-5" />}
          title="域名列表"
          desc="拉取 / 合并 / 筛选域名"
        />
        <QuickLink
          to="/bind"
          icon={<Link2 className="size-5" />}
          title="批量绑定"
          desc="创建 Zone + 自动改 NS"
        />
        <QuickLink
          to="/records"
          icon={<ListTree className="size-5" />}
          title="解析记录"
          desc="单域名 + 批量 DNS 管理"
        />
        <QuickLink
          to="/settings"
          icon={<Settings className="size-5" />}
          title="系统设置"
          desc="API 凭证、注册商与偏好"
        />
      </div>
    </div>
  );
}

function registrarConfigured(row: RegistrarCatalogItem, tokens: TokenMap) {
  if (row.id === "cloudflare") return Boolean(tokens.cloudflare);
  if (!row.supportsSync) return false;
  return Boolean(tokens[row.id]);
}

type StatReadout = {
  label: string;
  value: string;
  sub?: string;
  dot: string;
  to: string;
};

function QuickLink({
  to,
  icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:bg-muted/30"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
        {icon}
      </span>
      <div className="mt-3 font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </Link>
  );
}
