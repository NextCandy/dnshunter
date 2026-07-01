import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  bulkAddRecords,
  executeDeleteRecords,
  previewDeleteRecords,
} from "@/lib/cloudflare.functions";
import { useDomains } from "@/lib/domain-store";
import {
  CF_TYPES,
  CSV_TEMPLATE,
  downloadBlob,
  parseAndValidateCsv,
  toCsv,
  type CsvError,
  type ValidatedRecord,
} from "@/lib/csv";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Plus, Download, FileWarning, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_app/records")({
  head: () => ({ meta: [{ title: "解析记录 · dshunter" }] }),
  component: RecordsPage,
});

type RecTpl = { type: string; name: string; content: string; ttl: number; proxied: boolean };

function RecordsPage() {
  const domains = useDomains();
  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">解析记录</h1>
      <p className="text-sm text-muted-foreground mb-6">
        对已保存选中的 {domains.length} 个域名批量添加或删除 DNS 记录。
      </p>

      {domains.length === 0 ? (
        <Card className="p-6 text-center">
          尚未选择域名。请先到{" "}
          <Link to="/domains" className="text-primary underline">
            域名列表
          </Link>{" "}
          选中要处理的域名。
        </Card>
      ) : (
        <Tabs defaultValue="add">
          <TabsList>
            <TabsTrigger value="add">批量添加</TabsTrigger>
            <TabsTrigger value="delete">批量删除</TabsTrigger>
          </TabsList>
          <TabsContent value="add">
            <AddTab domains={domains} />
          </TabsContent>
          <TabsContent value="delete">
            <DeleteTab domains={domains} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function AddTab({ domains }: { domains: string[] }) {
  const addFn = useServerFn(bulkAddRecords);
  const [mode, setMode] = useState<"template" | "csv">("template");
  const [upsert, setUpsert] = useState(true);
  const [tpls, setTpls] = useState<RecTpl[]>([
    { type: "A", name: "@", content: "", ttl: 1, proxied: true },
  ]);
  const [csv, setCsv] = useState("");

  const parsed = useMemo(() => (mode === "csv" ? parseAndValidateCsv(csv) : null), [mode, csv]);

  const exec = useMutation({
    mutationFn: async () => {
      let records: any[] = [];
      if (mode === "template") {
        for (const d of domains) {
          for (const t of tpls) {
            if (!t.content) continue;
            records.push({ domain: d, ...t });
          }
        }
      } else {
        if (!parsed || parsed.errors.length > 0) throw new Error("CSV 存在校验错误，请先修正");
        records = parsed.valid;
      }
      if (records.length === 0) throw new Error("没有可执行的记录");
      return addFn({ data: { records, upsert } });
    },
    onError: (e: any) => toast.error(e.message),
    onSuccess: (r) => toast.success(`完成：${r.results.length} 条`),
  });

  const csvValidCount = parsed?.valid.length ?? 0;
  const csvErrorCount = parsed?.errors.length ?? 0;
  const canExecute =
    mode === "template" ? tpls.some((t) => t.content) : csvValidCount > 0 && csvErrorCount === 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex gap-2 mb-3 flex-wrap">
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
              <div key={i} className="grid grid-cols-[100px_1fr_2fr_80px_100px_40px] gap-2 items-center">
                <Select value={t.type} onValueChange={(v) => update(i, { type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CF_TYPES.map((x) => (
                      <SelectItem key={x} value={x}>{x}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="name (@ 或子域)" value={t.name} onChange={(e) => update(i, { name: e.target.value })} />
                <Input placeholder="content" value={t.content} onChange={(e) => update(i, { content: e.target.value })} />
                <Input type="number" value={t.ttl} onChange={(e) => update(i, { ttl: Number(e.target.value) })} />
                <label className="flex items-center gap-1 text-xs">
                  <Checkbox
                    checked={t.proxied}
                    disabled={!["A", "AAAA", "CNAME"].includes(t.type)}
                    onCheckedChange={(v) => update(i, { proxied: Boolean(v) })}
                  />
                  proxied
                </label>
                <Button variant="ghost" size="icon" onClick={() => setTpls(tpls.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setTpls([...tpls, { type: "A", name: "@", content: "", ttl: 1, proxied: true }])
              }
            >
              <Plus className="size-4 mr-1" /> 添加一条
            </Button>
            <p className="text-xs text-muted-foreground">
              模板将应用到全部 {domains.length} 个域名。TTL=1 表示 Auto。
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadBlob("records-template.csv", CSV_TEMPLATE, "text/csv")}
              >
                <Download className="size-4 mr-1" /> 下载 CSV 模板
              </Button>
              <label className="inline-flex items-center gap-1 border border-input rounded-md px-3 py-1.5 text-sm cursor-pointer bg-background hover:bg-accent">
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
              placeholder={"domain,type,name,content,ttl,proxied,priority\nexample.com,A,@,1.2.3.4,1,true,"}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              必填列：domain, type, name, content。可选：ttl（1=auto）、proxied、priority（MX 必填）。
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

function CsvReport({
  parsed,
}: {
  parsed: { valid: ValidatedRecord[]; errors: CsvError[]; totalRows: number };
}) {
  const hasErr = parsed.errors.length > 0;
  return (
    <Card className={`p-3 border ${hasErr ? "border-destructive/50 bg-destructive/5" : "border-green-500/40 bg-green-500/5"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm flex items-center gap-2">
          {hasErr ? (
            <>
              <FileWarning className="size-4 text-destructive" />
              <span>
                共 {parsed.totalRows} 行 · <span className="text-green-600">{parsed.valid.length} 通过</span> ·
                <span className="text-destructive ml-1">{parsed.errors.length} 错误</span>
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4 text-green-600" />
              <span>
                共 {parsed.totalRows} 行 · 全部通过 ({parsed.valid.length})
              </span>
            </>
          )}
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
            <Download className="size-4 mr-1" /> 下载错误清单
          </Button>
        )}
      </div>
      {hasErr && (
        <div className="border rounded max-h-56 overflow-auto bg-background">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="p-2 text-left w-16">行号</th>
                <th className="p-2 text-left w-24">字段</th>
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
  const [matches, setMatches] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
    onError: (e: any) => toast.error(e.message),
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
      toast.success(`删除完成：${r.results.filter((x) => x.status === "ok").length} 成功`);
      setMatches([]);
      setSelected(new Set());
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className="text-sm mb-1">类型（可选）</div>
          <Select value={type || "__all"} onValueChange={(v) => setType(v === "__all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="任意类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">任意类型</SelectItem>
              {CF_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-sm mb-1">name 包含（可选）</div>
          <Input value={nameContains} onChange={(e) => setNameContains(e.target.value)} />
        </div>
        <div>
          <div className="text-sm mb-1">content 包含（可选）</div>
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
            <Download className="size-4 mr-1" /> 导出匹配 CSV
          </Button>
        )}
      </div>

      {matches.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">
              匹配 {matches.length} 条，已选 <Badge>{selected.size}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set(matches.map((m) => m.id)))}>全选</Button>
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>清空</Button>
              <Button variant="destructive" size="sm" onClick={() => exec.mutate()} disabled={exec.isPending}>
                {exec.isPending ? "删除中..." : `删除选中 (${selected.size})`}
              </Button>
            </div>
          </div>
          <div className="border rounded max-h-[500px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
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
                    <td className="p-2">{m.type}</td>
                    <td className="p-2 font-mono text-xs">{m.name}</td>
                    <td className="p-2 font-mono text-xs truncate max-w-xs">{m.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {exec.data && <ResultTable results={exec.data.results} kind="delete" />}
    </div>
  );
}

function ResultTable({ results, kind }: { results: any[]; kind: "add" | "delete" }) {
  return (
    <Card className="p-4">
      <div className="font-semibold mb-2">结果（{results.length}）</div>
      <div className="border rounded max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
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
            {results.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono">{r.domain}</td>
                <td className="p-2">{r.type}</td>
                <td className="p-2 font-mono text-xs">{r.name}</td>
                {kind === "add" && <td className="p-2 font-mono text-xs">{r.content}</td>}
                <td className="p-2">
                  <span
                    className={
                      r.status === "created" || r.status === "updated" || r.status === "ok"
                        ? "text-green-600"
                        : "text-destructive"
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="p-2 text-xs text-destructive max-w-xs truncate">{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
