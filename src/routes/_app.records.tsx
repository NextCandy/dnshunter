import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  bulkAddRecords,
  deleteDnsRecord,
  executeDeleteRecords,
  listDnsRecords,
  previewDeleteRecords,
  saveDnsRecord,
} from "@/lib/cloudflare.functions";
import {
  deleteDnsTemplate,
  listDnsTemplates,
  saveDnsTemplate,
  type DnsTemplate,
  type DnsTemplateRecord,
} from "@/lib/dns-templates.functions";
import { useDomains } from "@/lib/domain-store";
import {
  CF_TYPES,
  CSV_TEMPLATE,
  downloadBlob,
  parseAndValidateCsv,
  toCsv,
  validateContent,
  type CsvError,
  type ValidatedRecord,
} from "@/lib/csv";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  Download,
  FileWarning,
  KeyRound,
  Library,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_app/records")({
  head: () => ({ meta: [{ title: "解析记录 · dshunter" }] }),
  component: RecordsPage,
});

type RecTpl = {
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
};
type DnsForm = RecTpl & { id?: string };
type BulkAddRecord = RecTpl & { domain: string; content: string };
type ResultRow = {
  domain: string;
  type: string;
  name: string;
  content?: string;
  status: string;
  error?: string;
};
type DeleteMatch = {
  domain: string;
  zoneId: string;
  id: string;
  type: string;
  name: string;
  content: string;
};
type DnsRecord = {
  id: string;
  zoneId: string;
  domain: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  priority?: number;
  modified_on?: string;
};

const EMPTY_FORM: DnsForm = { type: "A", name: "@", content: "", ttl: 1, proxied: true };
const EMPTY_TEMPLATE_ROW: RecTpl = { type: "A", name: "@", content: "", ttl: 1, proxied: true };

function errorMessage(error: unknown, fallback = "操作失败") {
  return error instanceof Error ? error.message : fallback;
}

function RecordsPage() {
  const domains = useDomains();
  return (
    <div className="flex max-w-7xl flex-col gap-4 xl:h-[calc(100vh-6.5rem)] xl:min-h-[680px]">
      <div className="flex shrink-0 flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">解析记录</h1>
          <p className="text-sm text-muted-foreground">
            先处理一个域名的 DNS，再把稳定模板批量应用到工作集。
          </p>
        </div>
        <div className="rounded-md border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">当前工作集</span>
          <span className="ml-2 font-mono font-semibold">{domains.length}</span>
          <span className="ml-1 text-muted-foreground">个域名</span>
        </div>
      </div>

      <Tabs defaultValue="single" className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
        <TabsList className="shrink-0">
          <TabsTrigger value="single">单域名 DNS</TabsTrigger>
          <TabsTrigger value="add" disabled={domains.length === 0}>
            批量添加
          </TabsTrigger>
          <TabsTrigger value="delete" disabled={domains.length === 0}>
            批量删除
          </TabsTrigger>
        </TabsList>
        <TabsContent value="single" className="xl:min-h-0 xl:flex-1">
          <SingleDomainTab domains={domains} />
        </TabsContent>
        <TabsContent value="add" className="xl:min-h-0 xl:flex-1 xl:overflow-auto">
          {domains.length === 0 ? <NoDomains /> : <AddTab domains={domains} />}
        </TabsContent>
        <TabsContent value="delete" className="xl:min-h-0 xl:flex-1 xl:overflow-auto">
          {domains.length === 0 ? <NoDomains /> : <DeleteTab domains={domains} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SingleDomainTab({ domains }: { domains: string[] }) {
  const listFn = useServerFn(listDnsRecords);
  const saveFn = useServerFn(saveDnsRecord);
  const deleteFn = useServerFn(deleteDnsRecord);
  const [domain, setDomain] = useState(domains[0] ?? "");
  const [manualDomain, setManualDomain] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [form, setForm] = useState<DnsForm>(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] = useState<DnsRecord | null>(null);

  useEffect(() => {
    if (!domain && domains[0]) setDomain(domains[0]);
  }, [domain, domains]);

  const knownDomainSelected = domains.includes(domain);
  const domainSelectValue = knownDomainSelected
    ? domain
    : domain
      ? "__manual-current"
      : "__manual-empty";

  const q = useQuery({
    queryKey: ["dns-records", domain],
    queryFn: () => listFn({ data: { domain } }),
    enabled: Boolean(domain),
  });

  // listDnsRecords 返回联合类型：ok:false 时带错误分类（no-token/token-invalid/forbidden/no-zone/api）
  const listError = q.data && !q.data.ok ? q.data : null;
  const zone = q.data?.ok ? q.data.zone : null;
  const records = useMemo(() => (q.data?.ok ? (q.data.records as DnsRecord[]) : []), [q.data]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return records.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (!text) return true;
      return [r.name, r.content, r.type].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(text),
      );
    });
  }, [records, query, typeFilter]);

  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    for (const r of records) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    return [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [records]);

  // 表单实时校验：content 格式 / MX priority / TTL 范围
  const formError = useMemo(() => {
    const content = form.content.trim();
    if (!content) return null;
    const contentErr = validateContent(form.type, content);
    if (contentErr) return contentErr;
    if (form.type === "MX" && (form.priority === undefined || Number.isNaN(form.priority))) {
      return "MX 记录必须填写 priority";
    }
    if (!(form.ttl === 1 || (form.ttl >= 60 && form.ttl <= 86400))) {
      return "TTL 必须为 1（Auto）或 60-86400 秒";
    }
    return null;
  }, [form]);

  const save = useMutation({
    mutationFn: () => {
      if (!domain) throw new Error("请先选择或输入域名");
      if (!form.content.trim()) throw new Error("content 不能为空");
      if (formError) throw new Error(formError);
      return saveFn({
        data: { domain, ...form, content: form.content.trim(), name: form.name.trim() || "@" },
      });
    },
    onSuccess: async () => {
      toast.success(form.id ? "DNS 记录已更新" : "DNS 记录已创建");
      setForm(EMPTY_FORM);
      await q.refetch();
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "保存 DNS 记录失败")),
  });

  const remove = useMutation({
    mutationFn: (record: DnsRecord) =>
      deleteFn({ data: { domain, id: record.id, zoneId: record.zoneId } }),
    onSuccess: async () => {
      toast.success("DNS 记录已删除");
      setPendingDelete(null);
      await q.refetch();
    },
    onError: (e: unknown) => {
      toast.error(errorMessage(e, "删除 DNS 记录失败"));
      setPendingDelete(null);
    },
  });

  const applyManualDomain = () => {
    const next = manualDomain.trim().toLowerCase();
    if (!next) return;
    setDomain(next);
    setManualDomain("");
    setForm(EMPTY_FORM);
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4 xl:min-h-0 xl:overflow-auto xl:pr-1">
        <Card className="p-4">
          <div className="mb-3 font-semibold">域名选择</div>
          {domains.length > 0 ? (
            <Select
              value={domainSelectValue}
              onValueChange={(v) => {
                if (v.startsWith("__manual")) return;
                setDomain(v);
                setForm(EMPTY_FORM);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择工作集中的域名" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value={domain && !knownDomainSelected ? "__manual-current" : "__manual-empty"}
                >
                  {domain && !knownDomainSelected ? `手动：${domain}` : "手动输入域名"}
                </SelectItem>
                {domains.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <NoDomains compact />
          )}
          <div className="mt-3 flex gap-2">
            <Input
              value={manualDomain}
              onChange={(e) => setManualDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyManualDomain();
              }}
              placeholder="或输入 example.com"
              className="font-mono"
            />
            <Button variant="outline" onClick={applyManualDomain}>
              载入
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            这里管理的是 Cloudflare Zone 的 DNS 记录；域名需要已经接入 Cloudflare。
          </p>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold">{form.id ? "编辑记录" : "新增记录"}</div>
            {form.id && (
              <Button variant="ghost" size="sm" onClick={() => setForm(EMPTY_FORM)}>
                取消编辑
              </Button>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Type</label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((s) => ({
                    ...s,
                    type: v,
                    proxied: ["A", "AAAA", "CNAME"].includes(v) ? s.proxied : false,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CF_TYPES.map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="@ 或子域"
                className="font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Content</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((s) => ({ ...s, content: e.target.value }))}
                placeholder="记录值"
                className="min-h-20 font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">TTL</label>
                <Input
                  type="number"
                  value={form.ttl}
                  onChange={(e) => setForm((s) => ({ ...s, ttl: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Priority</label>
                <Input
                  type="number"
                  value={form.priority ?? ""}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      priority: e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                  placeholder="MX"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.proxied}
                disabled={!["A", "AAAA", "CNAME"].includes(form.type)}
                onCheckedChange={(v) => setForm((s) => ({ ...s, proxied: Boolean(v) }))}
              />
              Cloudflare 代理
            </label>
            {formError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                {formError}
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => save.mutate()}
              disabled={save.isPending || !domain || !form.content.trim() || Boolean(formError)}
            >
              {save.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              {form.id ? "保存修改" : "新增 DNS 记录"}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col overflow-hidden xl:min-h-0">
        <div className="shrink-0 border-b bg-muted/30 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                {domain || "未选择域名"}
                {zone && (
                  <Badge
                    className={
                      zone.status === "active"
                        ? "bg-success text-success-foreground hover:bg-success text-[10px]"
                        : "text-[10px]"
                    }
                    variant={zone.status === "active" ? "default" : "outline"}
                  >
                    Zone {zone.status}
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="secondary">{records.length} 条记录</Badge>
                {stats.map(([type, count]) => (
                  <Badge key={type} variant="outline">
                    {type} {count}
                  </Badge>
                ))}
              </div>
              {zone && zone.name_servers?.length > 0 && (
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  CF NS: {zone.name_servers.join(" / ")}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => q.refetch()}
                disabled={!domain || q.isFetching}
              >
                {q.isFetching ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 size-3.5" />
                )}
                刷新
              </Button>
              {records.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadBlob(
                      `${domain}-dns-records.csv`,
                      toCsv(
                        records.map((r) => ({
                          domain,
                          type: r.type,
                          name: r.name,
                          content: r.content,
                          ttl: r.ttl,
                          proxied: Boolean(r.proxied),
                          priority: r.priority,
                        })),
                      ),
                      "text/csv",
                    )
                  }
                >
                  <Download className="mr-1 size-3.5" />
                  导出
                </Button>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_160px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索 name / content"
                className="pl-9"
              />
            </label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {CF_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {q.error || listError ? (
          <DnsLoadError
            kind={listError?.kind ?? "api"}
            message={listError?.message ?? (q.error as Error)?.message ?? "载入失败"}
            domain={domain}
          />
        ) : q.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在载入 DNS 记录
          </div>
        ) : (
          <div className="overflow-auto xl:min-h-0 xl:flex-1 max-h-[680px] xl:max-h-none">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_hsl(var(--border))]">
                <tr>
                  <th className="p-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">Content</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">TTL</th>
                  <th className="p-3 text-left font-medium text-muted-foreground">代理</th>
                  <th className="w-40 p-3 text-right font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                      {domain ? "没有匹配的 DNS 记录" : "选择一个域名后查看 DNS 记录"}
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-accent/30">
                    <td className="p-3">{typeBadge(r.type)}</td>
                    <td className="p-3 font-mono text-xs">{r.name}</td>
                    <td className="max-w-md truncate p-3 font-mono text-xs">{r.content}</td>
                    <td className="p-3 font-mono text-xs">{r.ttl === 1 ? "Auto" : r.ttl}</td>
                    <td className="p-3 text-xs">
                      {["A", "AAAA", "CNAME"].includes(r.type)
                        ? r.proxied
                          ? "开启"
                          : "关闭"
                        : "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            await navigator.clipboard.writeText(r.content);
                            toast.success("记录值已复制");
                          }}
                          aria-label="复制记录值"
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setForm({
                              id: r.id,
                              type: r.type,
                              name: r.name,
                              content: r.content,
                              ttl: r.ttl,
                              proxied: Boolean(r.proxied),
                              priority: r.priority,
                            })
                          }
                          aria-label="编辑记录"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDelete(r)}
                          disabled={remove.isPending}
                          aria-label="删除记录"
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 DNS 记录？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {pendingDelete && (
                  <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs">
                    <div>
                      {pendingDelete.type}{" "}
                      {pendingDelete.name === "@" ? domain : `${pendingDelete.name}.${domain}`}
                    </div>
                    <div className="mt-1 break-all text-muted-foreground">
                      {pendingDelete.content}
                    </div>
                  </div>
                )}
                <p className="mt-2 text-sm">删除后立即生效且不可恢复。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && remove.mutate(pendingDelete)}
              disabled={remove.isPending}
            >
              {remove.isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// DNS 载入失败：按错误类型给出可执行的下一步
function DnsLoadError({
  kind,
  message,
  domain,
}: {
  kind: "no-token" | "token-invalid" | "forbidden" | "no-zone" | "api";
  message: string;
  domain: string;
}) {
  const icon =
    kind === "no-zone" ? (
      <Link2 className="size-4" />
    ) : kind === "forbidden" || kind === "token-invalid" || kind === "no-token" ? (
      <KeyRound className="size-4" />
    ) : (
      <ShieldAlert className="size-4" />
    );
  const title =
    kind === "no-zone"
      ? "该域名尚未接入 Cloudflare"
      : kind === "no-token"
        ? "Cloudflare Token 未配置"
        : kind === "token-invalid"
          ? "Cloudflare Token 无效"
          : kind === "forbidden"
            ? "Cloudflare Token 权限不足"
            : "无法载入 DNS 记录";
  return (
    <div className="p-8">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <div className="mb-1 flex items-center gap-2 font-medium text-destructive">
          {icon}
          {title}
        </div>
        <div className="text-destructive/90">{message}</div>
        {kind === "no-zone" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/bind">
                <Link2 className="mr-1 size-3.5" />
                去批量绑定创建 Zone
              </Link>
            </Button>
            <span className="text-xs text-muted-foreground">
              创建 Zone 后 Cloudflare 会分配 NS，再把注册商 NS 指向它即可。
            </span>
          </div>
        )}
        {(kind === "no-token" || kind === "token-invalid") && (
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to="/settings">
              <Settings className="mr-1 size-3.5" />
              去设置配置 Token
            </Link>
          </Button>
        )}
        {kind === "forbidden" && (
          <div className="mt-3 rounded-md border bg-background p-3 text-xs">
            <div className="mb-1 font-medium">
              Token 需要以下权限（在 Cloudflare Dashboard → API Tokens 编辑）：
            </div>
            <ul className="list-inside list-disc space-y-0.5 font-mono">
              <li>Zone → DNS → Read（读取记录）</li>
              <li>Zone → DNS → Edit（新增 / 修改 / 删除记录）</li>
              <li>Zone → Zone → Read（查找 Zone）</li>
            </ul>
            <div className="mt-2 text-muted-foreground">
              修改权限后无需重新保存 Token；若重新生成了 Token，请到设置页更新。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AddTab({ domains }: { domains: string[] }) {
  const addFn = useServerFn(bulkAddRecords);
  const listTemplateFn = useServerFn(listDnsTemplates);
  const saveTemplateFn = useServerFn(saveDnsTemplate);
  const deleteTemplateFn = useServerFn(deleteDnsTemplate);
  const [mode, setMode] = useState<"template" | "csv">("template");
  const [upsert, setUpsert] = useState(true);
  const [tpls, setTpls] = useState<RecTpl[]>([EMPTY_TEMPLATE_ROW]);
  const [csv, setCsv] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("__none");
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["dns-templates"],
    queryFn: () => listTemplateFn(),
  });
  const templates = templatesQuery.data?.rows ?? [];
  const selectedTemplate = templates.find((tpl) => tpl.id === selectedTemplateId);

  const parsed = useMemo(() => (mode === "csv" ? parseAndValidateCsv(csv) : null), [mode, csv]);

  const exec = useMutation({
    mutationFn: async () => {
      let records: BulkAddRecord[] = [];
      if (mode === "template") {
        // 模板行先做与 CSV 相同的内容校验，避免整批打到 API 才报错
        validateTemplateRows(tpls);
        for (const d of domains) {
          for (const t of tpls) {
            if (!t.content.trim()) continue;
            records.push({ domain: d, ...t, content: t.content.trim() });
          }
        }
      } else {
        if (!parsed || parsed.errors.length > 0) throw new Error("CSV 存在校验错误，请先修正");
        records = parsed.valid;
      }
      if (records.length === 0) throw new Error("没有可执行的记录");
      return addFn({ data: { records, upsert } });
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "批量添加失败")),
    onSuccess: (r) => {
      const n = (s: string) => r.results.filter((x) => x.status === s).length;
      const failed = n("error") + n("no-zone");
      const msg = `新建 ${n("created")} · 更新 ${n("updated")} · 跳过 ${n("skipped")} · 失败 ${failed}`;
      if (failed > 0) toast.warning(`批量添加完成：${msg}`);
      else toast.success(`批量添加完成：${msg}`);
    },
  });

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const records = getCompleteTemplateRows(tpls);
      validateTemplateRows(records);
      const name = templateName.trim();
      if (!name) throw new Error("请填写模板名称");
      return saveTemplateFn({
        data: {
          id: selectedTemplateId === "__none" ? undefined : selectedTemplateId,
          name,
          description: templateDesc,
          records,
        },
      });
    },
    onSuccess: async (r) => {
      toast.success("DNS 模板已保存");
      setSelectedTemplateId(r.row.id);
      setTemplateName(r.row.name);
      setTemplateDesc(r.row.description ?? "");
      await templatesQuery.refetch();
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "保存模板失败")),
  });

  const removeTemplate = useMutation({
    mutationFn: async () => {
      if (selectedTemplateId === "__none") throw new Error("请先选择模板");
      return deleteTemplateFn({ data: { id: selectedTemplateId } });
    },
    onSuccess: async () => {
      toast.success("DNS 模板已删除");
      setSelectedTemplateId("__none");
      setTemplateName("");
      setTemplateDesc("");
      await templatesQuery.refetch();
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "删除模板失败")),
  });

  const csvValidCount = parsed?.valid.length ?? 0;
  const csvErrorCount = parsed?.errors.length ?? 0;
  const canExecute =
    mode === "template" ? tpls.some((t) => t.content) : csvValidCount > 0 && csvErrorCount === 0;

  return (
    <div className="space-y-4">
      {mode === "template" && (
        <Card className="p-4">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <Library className="size-4 text-primary" />
                DNS 模板库
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                保存常用解析组合，后续可一键套用到当前批量添加表单。
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => templatesQuery.refetch()}
              disabled={templatesQuery.isFetching}
            >
              {templatesQuery.isFetching ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 size-4" />
              )}
              刷新模板
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[220px_1fr_1fr_auto] lg:items-center">
            <Select
              value={selectedTemplateId}
              onValueChange={(value) => {
                setSelectedTemplateId(value);
                if (value === "__none") {
                  setTemplateName("");
                  setTemplateDesc("");
                  return;
                }
                const tpl = templates.find((item) => item.id === value);
                if (tpl) {
                  setTemplateName(tpl.name);
                  setTemplateDesc(tpl.description ?? "");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择模板" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">新建模板</SelectItem>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name}（{tpl.records.length}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="模板名称，例如：基础官网解析"
            />
            <Input
              value={templateDesc}
              onChange={(event) => setTemplateDesc(event.target.value)}
              placeholder="说明（可选）"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedTemplate}
                onClick={() => {
                  if (!selectedTemplate) return;
                  setTpls(templateToRows(selectedTemplate));
                  toast.success(`已套用模板：${selectedTemplate.name}`);
                }}
              >
                套用
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedTemplateId("__none");
                  setTemplateName("");
                  setTemplateDesc("");
                }}
              >
                新建
              </Button>
              <Button
                size="sm"
                onClick={() => saveTemplate.mutate()}
                disabled={saveTemplate.isPending}
              >
                {saveTemplate.isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Save className="mr-1 size-4" />
                )}
                保存
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeTemplate.mutate()}
                disabled={!selectedTemplate || removeTemplate.isPending}
              >
                <Trash2 className="mr-1 size-4" />
                删除
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            variant={mode === "template" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("template")}
          >
            模板模式
          </Button>
          <Button
            variant={mode === "csv" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("csv")}
          >
            CSV 导入
          </Button>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <Checkbox checked={upsert} onCheckedChange={(v) => setUpsert(Boolean(v))} />
            存在则更新（upsert）
          </label>
        </div>

        {mode === "template" ? (
          <div className="space-y-2">
            {tpls.map((t, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 md:grid-cols-[100px_1fr_2fr_80px_100px_40px] md:items-center"
              >
                <Select value={t.type} onValueChange={(v) => update(i, { type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CF_TYPES.map((x) => (
                      <SelectItem key={x} value={x}>
                        {x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="name (@ 或子域)"
                  value={t.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <Input
                  placeholder="content"
                  value={t.content}
                  onChange={(e) => update(i, { content: e.target.value })}
                />
                <Input
                  type="number"
                  value={t.ttl}
                  onChange={(e) => update(i, { ttl: Number(e.target.value) })}
                />
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox
                    checked={t.proxied}
                    disabled={!["A", "AAAA", "CNAME"].includes(t.type)}
                    onCheckedChange={(v) => update(i, { proxied: Boolean(v) })}
                  />
                  proxied
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTpls(tpls.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTpls([...tpls, EMPTY_TEMPLATE_ROW])}
            >
              <Plus className="mr-1 size-4" /> 添加一条
            </Button>
            <p className="text-xs text-muted-foreground">
              模板将应用到全部 {domains.length} 个域名。TTL=1 表示 Auto。
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadBlob("records-template.csv", CSV_TEMPLATE, "text/csv")}
              >
                <Download className="mr-1 size-4" /> 下载 CSV 模板
              </Button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent">
                上传 CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setCsv(await f.text());
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <Textarea
              rows={10}
              className="font-mono text-xs"
              placeholder={
                "domain,type,name,content,ttl,proxied,priority\nexample.com,A,@,1.2.3.4,1,true,"
              }
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              必填列：domain, type, name, content。可选：ttl（1=auto）、proxied、priority（MX
              必填）。
            </p>
            {parsed && csv.trim() && <CsvReport parsed={parsed} />}
          </div>
        )}
      </Card>

      <Button onClick={() => exec.mutate()} disabled={exec.isPending || !canExecute}>
        {exec.isPending ? "执行中..." : "执行批量添加"}
      </Button>

      {exec.data && <ResultTable results={exec.data.results} kind="add" />}
    </div>
  );

  function update(i: number, patch: Partial<RecTpl>) {
    setTpls(tpls.map((t, j) => (i === j ? { ...t, ...patch } : t)));
  }
}

function getCompleteTemplateRows(rows: RecTpl[]): DnsTemplateRecord[] {
  return rows
    .filter((row) => row.content.trim())
    .map((row) => ({
      type: row.type,
      name: row.name.trim() || "@",
      content: row.content.trim(),
      ttl: row.ttl,
      proxied: ["A", "AAAA", "CNAME"].includes(row.type) ? Boolean(row.proxied) : false,
      priority: row.priority,
    }));
}

function validateTemplateRows(rows: RecTpl[]) {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const content = row.content.trim();
    if (!content) continue;
    const err = validateContent(row.type, content);
    if (err) throw new Error(`模板第 ${i + 1} 行：${err}`);
    if (!(row.ttl === 1 || (row.ttl >= 60 && row.ttl <= 86400))) {
      throw new Error(`模板第 ${i + 1} 行：TTL 必须为 1（Auto）或 60-86400 秒`);
    }
    if (row.type === "MX" && (row.priority === undefined || Number.isNaN(row.priority))) {
      throw new Error(`模板第 ${i + 1} 行：MX 记录必须填写 priority`);
    }
    if (
      row.priority !== undefined &&
      (!Number.isInteger(row.priority) || row.priority < 0 || row.priority > 65535)
    ) {
      throw new Error(`模板第 ${i + 1} 行：priority 必须为 0-65535`);
    }
  }
}

function templateToRows(template: DnsTemplate): RecTpl[] {
  return template.records.map((record) => ({
    type: record.type,
    name: record.name,
    content: record.content,
    ttl: record.ttl,
    proxied: record.proxied,
    priority: record.priority,
  }));
}

function CsvReport({
  parsed,
}: {
  parsed: { valid: ValidatedRecord[]; errors: CsvError[]; totalRows: number };
}) {
  const hasErr = parsed.errors.length > 0;
  return (
    <Card
      className={`p-3 border ${hasErr ? "border-destructive/50 bg-destructive/5" : "border-success/40 bg-success/5"}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {hasErr ? (
            <FileWarning className="size-4 text-destructive" />
          ) : (
            <CheckCircle2 className="size-4 text-success" />
          )}
          <span>
            共 {parsed.totalRows} 行 ·{" "}
            <span className="text-success">{parsed.valid.length} 通过</span>
            {hasErr && <span className="ml-1 text-destructive">· {parsed.errors.length} 错误</span>}
          </span>
        </div>
        {hasErr && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadBlob(
                "csv-errors.csv",
                "row,field,message\n" +
                  parsed.errors
                    .map((e) => `${e.row},${e.field},"${e.message.replace(/"/g, '""')}"`)
                    .join("\n"),
                "text/csv",
              )
            }
          >
            <Download className="mr-1 size-4" /> 下载错误清单
          </Button>
        )}
      </div>
      {hasErr && (
        <div className="max-h-56 overflow-auto rounded border bg-background">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="w-16 p-2 text-left">行号</th>
                <th className="w-24 p-2 text-left">字段</th>
                <th className="p-2 text-left">错误</th>
              </tr>
            </thead>
            <tbody>
              {parsed.errors.map((e, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 font-mono">{e.row}</td>
                  <td className="p-2 font-mono">{e.field}</td>
                  <td className="p-2 text-destructive">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DeleteTab({ domains }: { domains: string[] }) {
  const previewFn = useServerFn(previewDeleteRecords);
  const executeFn = useServerFn(executeDeleteRecords);
  const [type, setType] = useState<string>("");
  const [nameContains, setNameContains] = useState("");
  const [contentContains, setContentContains] = useState("");
  const [matches, setMatches] = useState<DeleteMatch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const preview = useMutation({
    mutationFn: () =>
      previewFn({
        data: {
          domains,
          filter: {
            type: type || undefined,
            nameContains: nameContains || undefined,
            contentContains: contentContains || undefined,
          },
        },
      }),
    onSuccess: (r) => {
      setMatches(r.matches);
      setSelected(new Set(r.matches.map((m) => m.id)));
      toast.success(`匹配到 ${r.matches.length} 条`);
    },
    onError: (e: unknown) => toast.error(errorMessage(e, "预览匹配记录失败")),
  });

  const exec = useMutation({
    mutationFn: () => {
      const items = matches
        .filter((m) => selected.has(m.id))
        .map((m) => ({ zoneId: m.zoneId, id: m.id, domain: m.domain, name: m.name, type: m.type }));
      if (items.length === 0) throw new Error("未选中任何记录");
      return executeFn({ data: { items } });
    },
    onSuccess: (r) => {
      setConfirmOpen(false);
      const ok = r.results.filter((x) => x.status === "ok").length;
      const failed = r.results.length - ok;
      if (failed > 0) toast.warning(`删除完成：${ok} 成功 · ${failed} 失败，详见下方结果`);
      else toast.success(`删除完成：${ok} 成功`);
      setMatches([]);
      setSelected(new Set());
    },
    onError: (e: unknown) => {
      setConfirmOpen(false);
      toast.error(errorMessage(e, "批量删除失败"));
    },
  });

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <div>
          <div className="mb-1 text-sm">类型（可选）</div>
          <Select value={type || "__all"} onValueChange={(v) => setType(v === "__all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="任意类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">任意类型</SelectItem>
              {CF_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="mb-1 text-sm">name 包含（可选）</div>
          <Input value={nameContains} onChange={(e) => setNameContains(e.target.value)} />
        </div>
        <div>
          <div className="mb-1 text-sm">content 包含（可选）</div>
          <Input value={contentContains} onChange={(e) => setContentContains(e.target.value)} />
        </div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={() => preview.mutate()} disabled={preview.isPending}>
          {preview.isPending ? "扫描中..." : "预览匹配记录"}
        </Button>
        {matches.length > 0 && (
          <Button
            variant="outline"
            onClick={() =>
              downloadBlob(
                "matched-records.csv",
                toCsv(
                  matches.map((m) => ({
                    domain: m.domain,
                    type: m.type,
                    name: m.name,
                    content: m.content,
                    ttl: 1,
                    proxied: false,
                  })),
                ),
                "text/csv",
              )
            }
          >
            <Download className="mr-1 size-4" /> 导出匹配 CSV
          </Button>
        )}
      </div>

      {matches.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold">
              匹配 {matches.length} 条，已选 <Badge>{selected.size}</Badge>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set(matches.map((m) => m.id)))}
              >
                全选
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                清空
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={exec.isPending || selected.size === 0}
              >
                {exec.isPending ? "删除中..." : `删除选中 (${selected.size})`}
              </Button>
            </div>
          </div>
          <div className="max-h-[500px] overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="w-8 p-2"></th>
                  <th className="p-2 text-left">域名</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Content</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2">
                      <Checkbox
                        checked={selected.has(m.id)}
                        onCheckedChange={() => {
                          const n = new Set(selected);
                          if (n.has(m.id)) n.delete(m.id);
                          else n.add(m.id);
                          setSelected(n);
                        }}
                      />
                    </td>
                    <td className="p-2 font-mono">{m.domain}</td>
                    <td className="p-2">{typeBadge(m.type)}</td>
                    <td className="p-2 font-mono text-xs">{m.name}</td>
                    <td className="max-w-xs truncate p-2 font-mono text-xs">{m.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {exec.data && <ResultTable results={exec.data.results} kind="delete" />}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除 {selected.size} 条 DNS 记录？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {selected.size} 条记录，此操作不可撤销。受影响域名数：
              {new Set(matches.filter((m) => selected.has(m.id)).map((m) => m.domain)).size}。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => exec.mutate()}
              disabled={exec.isPending}
            >
              {exec.isPending ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const RESULT_STATUS_LABEL: Record<string, { text: string; ok: boolean | null }> = {
  created: { text: "已创建", ok: true },
  updated: { text: "已更新", ok: true },
  ok: { text: "成功", ok: true },
  skipped: { text: "跳过（内容相同）", ok: null },
  "no-zone": { text: "无 Zone", ok: false },
  error: { text: "失败", ok: false },
};

function ResultTable({ results, kind }: { results: ResultRow[]; kind: "add" | "delete" }) {
  const okCount = results.filter((r) => RESULT_STATUS_LABEL[r.status]?.ok === true).length;
  const skipCount = results.filter((r) => r.status === "skipped").length;
  const failCount = results.length - okCount - skipCount;
  const exportResults = () => {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = results.map((r) =>
      [
        esc(r.domain),
        esc(r.type),
        esc(r.name),
        esc(r.content ?? ""),
        esc(r.status),
        esc(r.error ?? ""),
      ].join(","),
    );
    downloadBlob(
      `bulk-${kind}-results.csv`,
      ["domain,type,name,content,status,error", ...rows].join("\n"),
      "text/csv",
    );
  };
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">结果（{results.length}）</span>
          <Badge className="bg-success text-success-foreground hover:bg-success">
            {okCount} 成功
          </Badge>
          {skipCount > 0 && <Badge variant="secondary">{skipCount} 跳过</Badge>}
          {failCount > 0 && <Badge variant="destructive">{failCount} 失败</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={exportResults}>
          <Download className="mr-1 size-3.5" />
          导出结果 CSV
        </Button>
      </div>
      <div className="max-h-96 overflow-auto rounded border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="p-2 text-left">域名</th>
              <th className="p-2 text-left">Type</th>
              <th className="p-2 text-left">Name</th>
              {kind === "add" && <th className="p-2 text-left">Content</th>}
              <th className="p-2 text-left">状态</th>
              <th className="p-2 text-left">错误</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const s = RESULT_STATUS_LABEL[r.status] ?? { text: r.status, ok: false };
              return (
                <tr key={i} className="border-t">
                  <td className="p-2 font-mono">{r.domain}</td>
                  <td className="p-2">{typeBadge(r.type)}</td>
                  <td className="p-2 font-mono text-xs">{r.name}</td>
                  {kind === "add" && (
                    <td className="max-w-xs truncate p-2 font-mono text-xs">{r.content}</td>
                  )}
                  <td className="p-2">
                    <span
                      className={
                        s.ok === true
                          ? "text-success"
                          : s.ok === false
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {s.text}
                    </span>
                  </td>
                  <td className="max-w-xs p-2 text-xs text-destructive" title={r.error}>
                    <div className="truncate">{r.error}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NoDomains({ compact = false }: { compact?: boolean }) {
  return (
    <EmptyState
      compact={compact}
      icon={<Link2 className="size-5" />}
      title="请选择域名"
      description="请选择一个已绑定 Cloudflare 的域名 Zone"
      primaryAction={{
        label: "选择域名",
        href: "/domains",
        icon: <Link2 className="mr-2 size-4" />,
      }}
    />
  );
}

function typeBadge(type: string) {
  const cls: Record<string, string> = {
    A: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300",
    AAAA: "border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-300",
    CNAME: "border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300",
    MX: "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300",
    TXT: "border-border/60 bg-muted/70 text-muted-foreground",
    NS: "border-primary/40 bg-primary/10 text-primary",
    SRV: "border-pink-500/40 bg-pink-500/10 text-pink-600 dark:text-pink-300",
    CAA: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  };
  return (
    <Badge variant="outline" className={cls[type] ?? "border-border/60 bg-muted/70"}>
      {type}
    </Badge>
  );
}
