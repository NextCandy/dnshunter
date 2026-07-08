import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { bindDomains, listAccounts } from "@/lib/cloudflare.functions";
import { getTokenStatus } from "@/lib/registrars.functions";
import { setDomains, useDomains } from "@/lib/domain-store";
import { parseDomainList } from "@/lib/domain-utils";
import { downloadBlob } from "@/lib/csv";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Copy,
  Download,
  Globe2,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_app/bind")({
  head: () => ({ meta: [{ title: "批量绑定 · dshunter" }] }),
  component: BindPage,
});

function BindPage() {
  const domains = useDomains();
  const acctFn = useServerFn(listAccounts);
  const tokensFn = useServerFn(getTokenStatus);
  const bindFn = useServerFn(bindDomains);
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => acctFn() });
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => tokensFn() });

  const [accountId, setAccountId] = useState<string>("");
  const [updateNS, setUpdateNS] = useState<
    "" | "spaceship" | "dynadot" | "porkbun" | "cf-registrar"
  >("");
  const [cfRegAccountId, setCfRegAccountId] = useState<string>("");
  const [activationCheck, setActivationCheck] = useState(true);

  const bind = useMutation({
    mutationFn: () =>
      bindFn({
        data: {
          domains,
          accountId,
          updateNS: updateNS || null,
          cfRegAccountId: cfRegAccountId || undefined,
          activationCheck,
        },
      }),
    onSuccess: (r) => {
      const created = r.results.filter((x) => x.zoneCreated === "ok").length;
      const exists = r.results.filter((x) => x.zoneCreated === "exists").length;
      const failed = r.results.filter((x) => x.zoneCreated === "error").length;
      const msg = `Zone 新建 ${created} · 已存在 ${exists} · 失败 ${failed}`;
      if (failed > 0) toast.warning(`绑定完成：${msg}，详见结果表`);
      else toast.success(`绑定完成：${msg}`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "批量绑定失败"),
  });

  const results = bind.data?.results || [];

  return (
    <div className="flex max-w-7xl flex-col gap-4 xl:h-[calc(100vh-6.5rem)] xl:min-h-[640px]">
      <div className="flex shrink-0 flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">批量绑定到 Cloudflare</h1>
          <p className="text-sm text-muted-foreground">
            为目标域名创建 CF Zone；可选自动改注册商 NS，并触发激活检查。已存在的 Zone 不算失败。
          </p>
        </div>
        <div className="rounded-md border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">目标域名</span>
          <span className="ml-2 font-mono font-semibold">{domains.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[400px_1fr]">
        {/* 左：目标域名（可编辑，写回工作集） */}
        <DomainSetEditor domains={domains} disabled={bind.isPending} />

        {/* 右：配置 + 结果 */}
        <div className="flex min-h-0 flex-col gap-4">
          <Card className="shrink-0 space-y-4 p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-medium">Cloudflare 账户</div>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder={accounts.isLoading ? "载入账户中..." : "选择账户"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts.data?.accounts || []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} — {a.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!accounts.isLoading &&
                  !accounts.error &&
                  (accounts.data?.accounts?.length ?? 0) === 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      没有可用账户：请确认 Token 具有 Account Settings:Read 权限。
                    </p>
                  )}
              </div>

              <div>
                <div className="mb-1 text-sm font-medium">自动更新 NS（可选）</div>
                <Select
                  value={updateNS || "__none"}
                  onValueChange={(v) =>
                    setUpdateNS(
                      v === "__none"
                        ? ""
                        : (v as "spaceship" | "dynadot" | "porkbun" | "cf-registrar"),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="不改（只创建 Zone）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">不改（只创建 Zone）</SelectItem>
                    <SelectItem value="spaceship" disabled={!tokens.data?.spaceship}>
                      Spaceship {!tokens.data?.spaceship && "（未配置）"}
                    </SelectItem>
                    <SelectItem value="dynadot" disabled={!tokens.data?.dynadot}>
                      Dynadot {!tokens.data?.dynadot && "（未配置）"}
                    </SelectItem>
                    <SelectItem value="porkbun" disabled={!tokens.data?.porkbun}>
                      Porkbun {!tokens.data?.porkbun && "（未配置）"}
                    </SelectItem>
                    <SelectItem value="cf-registrar">Cloudflare Registrar</SelectItem>
                  </SelectContent>
                </Select>
                {updateNS === "cf-registrar" && (
                  <div className="mt-2">
                    <Select value={cfRegAccountId} onValueChange={setCfRegAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="CF Registrar 所在账户" />
                      </SelectTrigger>
                      <SelectContent>
                        {(accounts.data?.accounts || []).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {accounts.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-destructive">
                  <KeyRound className="size-3.5" />
                  无法列出 Cloudflare 账户
                </div>
                <div className="text-destructive/90">{(accounts.error as Error).message}</div>
                <div className="mt-1.5 text-muted-foreground">
                  列出账户需要 Token 具有 Account Settings:Read 权限；若 Token
                  未配置或已失效，请先到设置页处理。
                </div>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link to="/settings">
                    <Settings className="mr-1 size-3.5" />
                    去设置
                  </Link>
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={activationCheck}
                  onCheckedChange={(v) => setActivationCheck(Boolean(v))}
                />
                创建后立即触发 Cloudflare 激活检查
              </label>
              <Button
                onClick={() => bind.mutate()}
                disabled={!accountId || domains.length === 0 || bind.isPending}
                className="lg:min-w-56"
              >
                {bind.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    执行中，请勿关闭页面...
                  </>
                ) : (
                  <>
                    <Link2 className="mr-2 size-4" />
                    开始批量绑定 ({domains.length})
                  </>
                )}
              </Button>
            </div>
          </Card>

          {results.length > 0 ? (
            <Card className="flex min-h-[280px] flex-col overflow-hidden xl:min-h-0 xl:flex-1">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">结果（{results.length}）</span>
                  <Badge className="bg-success text-success-foreground hover:bg-success">
                    新建 {results.filter((r) => r.zoneCreated === "ok").length}
                  </Badge>
                  <Badge variant="secondary">
                    已存在 {results.filter((r) => r.zoneCreated === "exists").length}
                  </Badge>
                  {results.some((r) => r.zoneCreated === "error") && (
                    <Badge variant="destructive">
                      失败 {results.filter((r) => r.zoneCreated === "error").length}
                    </Badge>
                  )}
                  {results.some((r) => r.nsUpdate !== "skipped") && (
                    <Badge variant="outline">
                      NS 更新成功 {results.filter((r) => r.nsUpdate === "ok").length}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const esc = (v: string) =>
                      /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
                    const rows = results.map((r) =>
                      [
                        r.domain,
                        r.zoneCreated,
                        r.nsUpdate,
                        r.activation,
                        r.status ?? "",
                        (r.nameServers || []).join(" "),
                        esc(r.error ?? ""),
                      ].join(","),
                    );
                    downloadBlob(
                      "bind-results.csv",
                      [
                        "domain,zone,ns_update,activation,zone_status,cloudflare_ns,error",
                        ...rows,
                      ].join("\n"),
                      "text/csv",
                    );
                  }}
                >
                  <Download className="mr-1 size-3.5" />
                  导出结果
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_hsl(var(--border))]">
                    <tr>
                      <th className="p-2 text-left font-medium text-muted-foreground">域名</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">Zone</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">NS 更新</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">激活</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">Zone 状态</th>
                      <th className="p-2 text-left font-medium text-muted-foreground">
                        Cloudflare NS
                      </th>
                      <th className="p-2 text-left font-medium text-muted-foreground">错误</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.domain} className="border-t">
                        <td className="p-2 font-mono">{r.domain}</td>
                        <td className="p-2">
                          <StatusBadge status={r.zoneCreated} />
                        </td>
                        <td className="p-2">
                          <StatusBadge status={r.nsUpdate} />
                        </td>
                        <td className="p-2">
                          <StatusBadge status={r.activation} />
                        </td>
                        <td className="p-2 text-xs">{r.status ?? "—"}</td>
                        <td className="p-2 text-xs font-mono">
                          {(r.nameServers || []).length > 0 ? (
                            <div className="flex items-center gap-1">
                              <span>{(r.nameServers || []).join(", ")}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(
                                    (r.nameServers || []).join("\n"),
                                  );
                                  toast.success("NS 已复制");
                                }}
                                aria-label="复制 NS"
                              >
                                <Copy className="size-3" />
                              </Button>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="max-w-xs p-2 text-xs text-destructive" title={r.error}>
                          <div className="truncate">{r.error}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="hidden flex-1 items-center justify-center p-8 text-center xl:flex">
              <div>
                <Link2 className="mx-auto mb-3 size-8 text-muted-foreground" />
                <div className="font-medium">绑定结果会显示在这里</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  包含每个域名的 Zone 创建、NS 更新与激活状态。
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// 目标域名编辑器：直接增删工作集（与域名列表 / 解析记录共享）
function DomainSetEditor({ domains, disabled }: { domains: string[]; disabled: boolean }) {
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return domains;
    return domains.filter((d) => d.includes(f));
  }, [domains, filter]);

  const addFromInput = () => {
    const parsed = parseDomainList(input);
    if (parsed.length === 0) {
      toast.error("没有识别到有效域名（支持换行、逗号、空格分隔，自动去掉 URL 前缀）");
      return;
    }
    const merged = [...new Set([...domains, ...parsed])].sort();
    const added = merged.length - domains.length;
    setDomains(merged);
    setInput("");
    if (added > 0)
      toast.success(
        `已添加 ${added} 个域名${parsed.length - added > 0 ? `（${parsed.length - added} 个重复已忽略）` : ""}`,
      );
    else toast.info("这些域名已在列表中");
  };

  const remove = (d: string) => {
    setDomains(domains.filter((x) => x !== d));
  };

  const clearAll = () => {
    setDomains([]);
    setFilter("");
    toast.success("已清空目标域名");
  };

  return (
    <Card className="flex min-h-[360px] flex-col overflow-hidden xl:min-h-0">
      <div className="shrink-0 border-b bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold">目标域名</div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary">{domains.length}</Badge>
            {domains.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground"
                onClick={clearAll}
                disabled={disabled}
              >
                <Trash2 className="mr-1 size-3.5" />
                清空
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addFromInput();
            }}
            placeholder="输入或粘贴域名（可多个）后回车"
            className="font-mono text-sm"
            disabled={disabled}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={addFromInput}
            disabled={disabled || !input.trim()}
            aria-label="添加域名"
          >
            <Plus className="size-4" />
          </Button>
        </div>
        {domains.length > 8 && (
          <label className="relative mt-2 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="过滤域名"
              className="h-8 pl-8 text-sm"
            />
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {domains.length === 0 ? (
          <EmptyState
            compact
            icon={<Globe2 className="size-5" />}
            title="还没有目标域名"
            description="先在域名管理选中要绑定的域名"
            primaryAction={{
              label: "跳转到域名管理",
              href: "/domains",
              icon: <Globe2 className="mr-2 size-4" />,
            }}
          />
        ) : visible.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            没有匹配「{filter}」的域名
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {visible.map((d) => (
              <span
                key={d}
                className="group inline-flex items-center gap-1 rounded-md border bg-background py-0.5 pl-2 pr-1 font-mono text-xs"
              >
                {d}
                <button
                  type="button"
                  onClick={() => remove(d)}
                  disabled={disabled}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                  aria-label={`移除 ${d}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        修改会同步到工作集，「解析记录」页也会使用同一批域名。
      </div>
    </Card>
  );
}

const BIND_STATUS_LABEL: Record<string, string> = {
  ok: "成功",
  exists: "已存在",
  error: "失败",
  skipped: "跳过",
  unsupported: "不支持",
};

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "ok" || status === "exists"
      ? "bg-success/15 text-success"
      : status === "error"
        ? "bg-destructive/15 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${color}`}>
      {BIND_STATUS_LABEL[status] ?? status}
    </span>
  );
}
