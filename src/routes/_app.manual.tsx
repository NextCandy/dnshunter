import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  listManualDomains,
  addManualDomains,
  updateManualDomain,
  updateManualDomains,
  deleteManualDomain,
  deleteManualDomains,
  listManualBackups,
  restoreManualBackup,
  type ManualDomain,
  type ManualDomainPatch,
} from "@/lib/manual-domains.functions";
import { parseDomainList } from "@/lib/domain-utils";
import { setDomains } from "@/lib/domain-store";
import { formatDate, formatDateTime } from "@/lib/date-format";
import { DnsDialog } from "@/components/dns-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Upload,
  Plus,
  ScanSearch,
  Pencil,
  Trash2,
  ExternalLink,
  Globe2,
  Loader2,
  Search,
  X,
  History,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/_app/manual")({
  head: () => ({ meta: [{ title: "手动域名 · dshunter" }] }),
  component: ManualDomainsPage,
});

function ManualDomainsPage() {
  const router = useRouter();
  const listFn = useServerFn(listManualDomains);
  const addFn = useServerFn(addManualDomains);
  const delFn = useServerFn(deleteManualDomain);
  const batchDelFn = useServerFn(deleteManualDomains);
  const q = useQuery({ queryKey: ["manual-domains"], queryFn: () => listFn() });
  const rows = (q.data?.rows ?? []) as ManualDomain[];

  const [manual, setManual] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [dnsDomain, setDnsDomain] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<ManualDomain | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchEdit, setBatchEdit] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  const parsed = parseDomainList(manual);
  const visible = rows.filter((r) => !search || r.domain.includes(search.trim().toLowerCase()));
  const allChecked = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const add = useMutation({
    mutationFn: (domains: string[]) => addFn({ data: { domains } }),
    onSuccess: (r) => {
      toast.success(`已添加 ${r.added} 个域名${r.skipped ? `，跳过 ${r.skipped} 个重复` : ""}`);
      setManual("");
      q.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "添加失败"),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("已删除");
      q.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const batchDel = useMutation({
    mutationFn: (ids: string[]) => batchDelFn({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`已删除 ${r.deleted} 个域名`);
      setSelected(new Set());
      q.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "批量删除失败"),
  });

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const found = parseDomainList(text);
      if (found.length === 0) {
        toast.error("未从文件解析到有效域名");
        return;
      }
      setManual((prev) => [...new Set([...parseDomainList(prev), ...found])].join("\n"));
      toast.success(`已载入 ${found.length} 个域名，确认后点击添加`);
    } catch {
      toast.error("读取文件失败");
    }
  };

  const openInCloudflare = (domain: string) => {
    setDomains([domain]);
    toast.success(`已切换到 ${domain} 的 DNS 管理`);
    router.navigate({ to: "/records" });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (allChecked) {
        const next = new Set(prev);
        visible.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      visible.forEach((r) => next.add(r.id));
      return next;
    });
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">手动域名</h1>
        <p className="text-sm text-muted-foreground">
          手动输入或导入的域名，独立持久化保存；添加时自动查一次 NS，可编辑注册商、DNS
          修改地址与各类信息。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,380px)_1fr]">
        {/* 添加区 */}
        <Card className="h-fit p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="font-semibold">添加域名</div>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importFile(f);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-3.5" />
                导入
              </Button>
              <Badge variant="secondary">{parsed.length}</Badge>
            </div>
          </div>
          <Textarea
            rows={7}
            placeholder={"每行一个域名，例如：\nexample.com\nfoo.io"}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            className="font-mono text-sm"
          />
          <Button
            className="mt-3 w-full gap-1.5"
            disabled={parsed.length === 0 || add.isPending}
            onClick={() => add.mutate(parsed)}
          >
            {add.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            添加{parsed.length > 0 ? ` ${parsed.length} 个` : ""}域名
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            支持 CSV / TXT 导入，自动提取域名并去重；添加时会自动查询 NS 托管，稍等片刻。
          </p>
        </Card>

        {/* 列表 */}
        <Card className="flex min-h-[560px] flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/30 p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Globe2 className="size-4" />
              手动域名
              <Badge variant="secondary">
                {visible.length} / {rows.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setBackupOpen(true)}
              >
                <History className="size-3.5" />
                备份 / 恢复
              </Button>
              <label className="relative w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索域名"
                  className="pl-9"
                />
              </label>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex shrink-0 items-center gap-2 border-b bg-primary/5 px-4 py-2 text-sm">
              <span className="font-medium">已选 {selected.size} 项</span>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setBatchEdit(true)}>
                  <Pencil className="mr-1 size-3.5" />
                  批量编辑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={batchDel.isPending}
                  onClick={() => {
                    if (window.confirm(`确定删除选中的 ${selected.size} 个域名？`))
                      batchDel.mutate([...selected]);
                  }}
                >
                  <Trash2 className="mr-1 size-3.5" />
                  批量删除
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          <div className="min-h-[420px] flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b">
                  <th className="w-10 p-3">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={toggleAll}
                      aria-label="全选当前结果"
                    />
                  </th>
                  <Th>域名</Th>
                  <Th>注册商</Th>
                  <Th>NS 托管 / DNS 地址</Th>
                  <Th>到期</Th>
                  <Th>标签</Th>
                  <th className="w-32 p-3 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-sm text-muted-foreground">
                      {q.isLoading
                        ? "加载中…"
                        : rows.length === 0
                          ? "还没有手动域名，从左侧输入或导入后添加。"
                          : "没有匹配的域名。"}
                    </td>
                  </tr>
                )}
                {visible.map((row) => (
                  <tr key={row.id} className="border-b border-border/40 hover:bg-muted/40">
                    <td className="p-3">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={() => toggleOne(row.id)}
                        aria-label={`选择 ${row.domain}`}
                      />
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-sm font-medium">{row.domain}</span>
                    </td>
                    <td className="p-3">
                      {row.registrar ? (
                        <Badge variant="secondary">{row.registrar}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">未设置</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs">
                          {row.nsProvider ?? (row.nsStatus === "cloudflare" ? "Cloudflare" : "—")}
                        </span>
                        {row.dnsManageUrl && (
                          <a
                            href={row.dnsManageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline"
                          >
                            DNS 修改地址
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {row.expiresAt ? formatDate(row.expiresAt) : "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {row.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDnsDomain(row.domain)}
                          aria-label={`查看 ${row.domain} 的 DNS`}
                        >
                          <ScanSearch className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditRow(row)}
                          aria-label={`编辑 ${row.domain}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm(`确定删除 ${row.domain}？`)) del.mutate(row.id);
                          }}
                          aria-label={`删除 ${row.domain}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <DnsDialog
        domain={dnsDomain}
        onClose={() => setDnsDomain(null)}
        onEditInCloudflare={openInCloudflare}
      />
      <EditManualDialog
        row={editRow}
        onClose={() => setEditRow(null)}
        onSaved={() => {
          setEditRow(null);
          q.refetch();
        }}
      />
      <BatchEditDialog
        open={batchEdit}
        ids={[...selected]}
        onClose={() => setBatchEdit(false)}
        onSaved={() => {
          setBatchEdit(false);
          setSelected(new Set());
          q.refetch();
        }}
      />
      <BackupDialog
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        onRestored={() => {
          setBackupOpen(false);
          setSelected(new Set());
          q.refetch();
        }}
      />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="p-3 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </th>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function EditManualDialog({
  row,
  onClose,
  onSaved,
}: {
  row: ManualDomain | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateManualDomain);
  const [registrar, setRegistrar] = useState("");
  const [dnsManageUrl, setDnsManageUrl] = useState("");
  const [nameservers, setNameservers] = useState("");
  const [registeredAt, setRegisteredAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [group, setGroup] = useState("");

  useEffect(() => {
    if (!row) return;
    setRegistrar(row.registrar ?? "");
    setDnsManageUrl(row.dnsManageUrl ?? "");
    setNameservers(row.nameservers.join("\n"));
    setRegisteredAt(row.registeredAt ? row.registeredAt.slice(0, 10) : "");
    setExpiresAt(row.expiresAt ? row.expiresAt.slice(0, 10) : "");
    setNote(row.note ?? "");
    setTags(row.tags.join(", "));
    setGroup(row.group ?? "");
  }, [row]);

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: row!.id,
          patch: {
            registrar: registrar.trim() || null,
            dnsManageUrl: dnsManageUrl.trim() || null,
            nameservers: nameservers
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean),
            registeredAt: registeredAt.trim() || null,
            expiresAt: expiresAt.trim() || null,
            note: note.trim() || null,
            tags: tags
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            group: group.trim() || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("已保存");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{row?.domain}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="注册商">
            <Input
              value={registrar}
              onChange={(e) => setRegistrar(e.target.value)}
              placeholder="如 Spaceship / 阿里云 / GoDaddy…"
            />
          </Field>
          <Field label="DNS 修改地址（点击可跳转的管理台 URL）">
            <Input
              value={dnsManageUrl}
              onChange={(e) => setDnsManageUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="NS 服务器（每行/逗号一个）">
            <Textarea
              rows={2}
              value={nameservers}
              onChange={(e) => setNameservers(e.target.value)}
              className="font-mono text-xs"
              placeholder="ns1.example.com&#10;ns2.example.com"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="注册日期">
              <Input
                type="date"
                value={registeredAt}
                onChange={(e) => setRegisteredAt(e.target.value)}
              />
            </Field>
            <Field label="到期日期">
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
          </div>
          <Field label="分组">
            <Input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="如 主力 / 观察"
            />
          </Field>
          <Field label="标签（逗号分隔）">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="投资, 已备案"
            />
          </Field>
          <Field label="备注">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BatchEditDialog({
  open,
  ids,
  onClose,
  onSaved,
}: {
  open: boolean;
  ids: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateManualDomains);
  const [registrar, setRegistrar] = useState("");
  const [dnsManageUrl, setDnsManageUrl] = useState("");
  const [group, setGroup] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (open) {
      setRegistrar("");
      setDnsManageUrl("");
      setGroup("");
      setTags("");
    }
  }, [open]);

  const save = useMutation({
    mutationFn: () => {
      const patch: ManualDomainPatch = {};
      if (registrar.trim()) patch.registrar = registrar.trim();
      if (dnsManageUrl.trim()) patch.dnsManageUrl = dnsManageUrl.trim();
      if (group.trim()) patch.group = group.trim();
      if (tags.trim())
        patch.tags = tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      return updateFn({ data: { ids, patch } });
    },
    onSuccess: (r) => {
      toast.success(`已更新 ${r.updated} 个域名`);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "批量更新失败"),
  });

  const nothingToApply = !registrar.trim() && !dnsManageUrl.trim() && !group.trim() && !tags.trim();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>批量编辑 {ids.length} 个域名</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            仅填写的字段会被应用到选中的 {ids.length} 个域名，留空的字段保持不变。
          </p>
          <Field label="注册商">
            <Input
              value={registrar}
              onChange={(e) => setRegistrar(e.target.value)}
              placeholder="统一设为…"
            />
          </Field>
          <Field label="DNS 修改地址">
            <Input
              value={dnsManageUrl}
              onChange={(e) => setDnsManageUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="分组">
            <Input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="统一分组…"
            />
          </Field>
          <Field label="标签（逗号分隔，将覆盖原标签）">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="投资, 已备案"
            />
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || nothingToApply}>
            {save.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
            应用到 {ids.length} 个
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BackupDialog({
  open,
  onClose,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const listFn = useServerFn(listManualBackups);
  const restoreFn = useServerFn(restoreManualBackup);
  const q = useQuery({
    queryKey: ["manual-backups"],
    queryFn: () => listFn(),
    enabled: open,
  });
  const rows = (q.data?.rows ?? []) as { file: string; at: string; count: number }[];

  const restore = useMutation({
    mutationFn: (file: string) => restoreFn({ data: { file } }),
    onSuccess: (r) => {
      toast.success(`已恢复 ${r.count} 个域名`);
      onRestored();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "恢复失败"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>备份与恢复</DialogTitle>
        </DialogHeader>
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          每次改动前会自动备份，保留最近 20
          份。选择一份可恢复到该时间点（恢复前的当前状态也会被再次备份）。
        </p>
        <div className="max-h-[50vh] space-y-2 overflow-auto">
          {q.isPending ? (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无备份记录</div>
          ) : (
            rows.map((b) => (
              <div
                key={b.file}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs">{formatDateTime(b.at)}</div>
                  <div className="text-[11px] text-muted-foreground">{b.count} 个域名</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={restore.isPending}
                  onClick={() => {
                    if (window.confirm(`恢复到此备份（${b.count} 个域名）？当前数据会先自动备份。`))
                      restore.mutate(b.file);
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  恢复
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
