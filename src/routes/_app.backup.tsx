import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  applyRestorePlan,
  diffAgainstLive,
  exportZoneRecords,
  planRestoreFromBackup,
  type BackupZone,
  type ZonePlan,
} from "@/lib/backup.functions";
import { useDomains } from "@/lib/domain-store";
import { downloadBlob, toCsv } from "@/lib/csv";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, GitCompare, RotateCcw, ListChecks, Play } from "lucide-react";

type RestoreStrategy = "add-missing" | "overwrite" | "replace-all";

export const Route = createFileRoute("/_app/backup")({
  head: () => ({ meta: [{ title: "数据管理 · dshunter" }] }),
  component: BackupPage,
});

function BackupPage() {
  const domains = useDomains();
  return (
    <div className="max-w-6xl">
      <h1 className="font-display text-2xl font-bold mb-1">数据管理</h1>
      <div className="text-sm text-muted-foreground mb-6">
        备份、恢复、差异审计与导入导出都在这里处理。当前选中{" "}
        <Badge variant="secondary">{domains.length}</Badge> 个域名（在
        <Link to="/domains" className="text-primary underline mx-1">
          域名列表
        </Link>
        修改）。
      </div>

      {domains.length === 0 ? (
        <EmptyState
          icon={<Download className="size-5" />}
          title="请选择要备份的 Zone"
          description="导出当前 Zone 的所有 DNS 记录到 JSON/CSV"
          primaryAction={{
            label: "选择要导出的 Zone",
            href: "/domains",
            icon: <Download className="mr-2 size-4" />,
          }}
        />
      ) : (
        <Tabs defaultValue="export">
          <TabsList>
            <TabsTrigger value="export">
              <Download className="size-4 mr-1" /> 导入 / 导出
            </TabsTrigger>
            <TabsTrigger value="diff">
              <GitCompare className="size-4 mr-1" /> 差异对比
            </TabsTrigger>
            <TabsTrigger value="restore">
              <RotateCcw className="size-4 mr-1" /> 恢复
            </TabsTrigger>
          </TabsList>
          <TabsContent value="export">
            <ExportTab domains={domains} />
          </TabsContent>
          <TabsContent value="diff">
            <DiffTab />
          </TabsContent>
          <TabsContent value="restore">
            <RestoreTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ExportTab({ domains }: { domains: string[] }) {
  const fn = useServerFn(exportZoneRecords);
  const exec = useMutation({
    mutationFn: async (fmt: "json" | "csv") => {
      const r = await fn({ data: { domains } });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      if (fmt === "json") {
        downloadBlob(
          `dshunter-backup-${stamp}.json`,
          JSON.stringify(r.zones, null, 2),
          "application/json",
        );
      } else {
        const flat = r.zones.flatMap((z) => z.records.map((rec) => ({ ...rec, domain: z.domain })));
        downloadBlob(`dshunter-backup-${stamp}.csv`, toCsv(flat), "text/csv");
      }
      return r;
    },
    onSuccess: (r) => {
      const total = r.zones.reduce((s, z) => s + z.records.length, 0);
      toast.success(`导出完成：${r.zones.length} 个 Zone / ${total} 条记录`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "导出失败"),
  });
  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm">
        将实时从 Cloudflare 读取所有 DNS 记录并下载到本地，包含
        type/name/content/ttl/proxied/priority。
      </p>
      <div className="flex gap-2">
        <Button onClick={() => exec.mutate("json")} disabled={exec.isPending}>
          <Download className="size-4 mr-1" /> 导出 JSON
        </Button>
        <Button variant="outline" onClick={() => exec.mutate("csv")} disabled={exec.isPending}>
          <Download className="size-4 mr-1" /> 导出 CSV
        </Button>
      </div>
    </Card>
  );
}

function BackupFileInput({ onLoad }: { onLoad: (zones: BackupZone[]) => void }) {
  return (
    <label className="inline-flex items-center gap-2 border border-input rounded-md px-3 py-2 text-sm cursor-pointer bg-background hover:bg-accent">
      <Upload className="size-4" />
      选择备份 JSON 文件
      <input
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const txt = await f.text();
            const parsed = JSON.parse(txt);
            if (!Array.isArray(parsed)) throw new Error("文件格式错误：需要 BackupZone[] 数组");
            onLoad(parsed as BackupZone[]);
            toast.success(`已载入 ${parsed.length} 个 Zone`);
          } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "读取备份文件失败");
          }
          e.target.value = "";
        }}
      />
    </label>
  );
}

function DiffTab() {
  const fn = useServerFn(diffAgainstLive);
  const [backup, setBackup] = useState<BackupZone[] | null>(null);
  const exec = useMutation({
    mutationFn: () => {
      if (!backup) throw new Error("先载入备份文件");
      return fn({ data: { backup } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "差异对比失败"),
  });
  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center gap-3 flex-wrap">
        <BackupFileInput onLoad={setBackup} />
        {backup && <Badge variant="secondary">{backup.length} zones 待比对</Badge>}
        <Button
          className="ml-auto"
          disabled={!backup || exec.isPending}
          onClick={() => exec.mutate()}
        >
          {exec.isPending ? "对比中..." : "开始对比"}
        </Button>
      </Card>
      {exec.data?.results.map((r) => (
        <Card key={r.domain} className="p-4">
          <div className="font-mono font-semibold mb-2">
            {r.domain}
            {r.missingZone && (
              <Badge variant="destructive" className="ml-2">
                CF 中不存在此 Zone
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <DiffCol
              title="仅在备份"
              color="text-primary"
              items={r.onlyInBackup.map((x) => `${x.type} ${x.name} → ${x.content}`)}
            />
            <DiffCol
              title="仅在线上"
              color="text-warning"
              items={r.onlyInLive.map((x) => `${x.type} ${x.name} → ${x.content}`)}
            />
            <DiffCol
              title="属性差异"
              color="text-purple-600"
              items={r.changed.map(
                (c) =>
                  `${c.backup.type} ${c.backup.name}: ttl ${c.live.ttl}→${c.backup.ttl}, proxied ${c.live.proxied}→${c.backup.proxied}`,
              )}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

function DiffCol({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <div>
      <div className={`font-semibold mb-1 ${color}`}>
        {title} ({items.length})
      </div>
      <pre className="max-h-60 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-2 text-xs">
        {items.length === 0 ? (
          <span className="text-muted-foreground">--</span>
        ) : (
          items.map((s) => s).join("\n")
        )}
      </pre>
    </div>
  );
}

function RestoreTab() {
  const planFn = useServerFn(planRestoreFromBackup);
  const applyFn = useServerFn(applyRestorePlan);
  const [backup, setBackup] = useState<BackupZone[] | null>(null);
  const [strategy, setStrategy] = useState<RestoreStrategy>("add-missing");
  const [plans, setPlans] = useState<ZonePlan[] | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<null | {
    results: {
      domain: string;
      created: number;
      updated: number;
      deleted: number;
      skipped: number;
      errors: string[];
    }[];
  }>(null);

  const planMut = useMutation({
    mutationFn: async () => {
      if (!backup) throw new Error("先载入备份文件");
      const r = await planFn({ data: { backup, strategy } });
      return r.plans;
    },
    onSuccess: (p) => {
      setPlans(p);
      setApplied(null);
      const total = p.reduce(
        (s, z) => s + z.summary.create + z.summary.update + z.summary.delete,
        0,
      );
      toast.success(`已生成计划：${total} 项变更（跳过不计）`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "生成变更计划失败"),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      if (!plans) throw new Error("请先生成变更计划");
      return applyFn({ data: { plans } });
    },
    onSuccess: (r) => {
      setApplied(r);
      toast.success(`已应用到 Cloudflare：${r.results.length} 个 Zone`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "应用恢复计划失败"),
  });

  const totals = plans
    ? plans.reduce(
        (s, p) => ({
          create: s.create + p.summary.create,
          update: s.update + p.summary.update,
          delete: s.delete + p.summary.delete,
          skip: s.skip + p.summary.skip,
        }),
        { create: 0, update: 0, delete: 0, skip: 0 },
      )
    : null;
  const hasChanges = totals && totals.create + totals.update + totals.delete > 0;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <BackupFileInput
            onLoad={(z) => {
              setBackup(z);
              setPlans(null);
              setApplied(null);
            }}
          />
          {backup && <Badge variant="secondary">{backup.length} zones 待恢复</Badge>}
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">恢复策略</div>
          <RadioGroup
            value={strategy}
            onValueChange={(v) => {
              setStrategy(v as RestoreStrategy);
              setPlans(null);
              setApplied(null);
            }}
            className="grid gap-2 md:grid-cols-3"
          >
            <StrategyCard
              value="add-missing"
              title="仅补齐"
              description="只创建线上缺失的记录，线上已有记录保持不变。"
            />
            <StrategyCard
              value="overwrite"
              title="覆盖属性"
              description="同 key 记录会按备份更新 ttl、proxied 与 priority。"
            />
            <StrategyCard
              value="replace-all"
              title="完全替换"
              description="先删除备份中不存在的记录，再写入备份内容。"
            />
          </RadioGroup>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => planMut.mutate()} disabled={!backup || planMut.isPending}>
            <ListChecks className="size-4 mr-1" />
            {planMut.isPending ? "计算中..." : "生成变更计划"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => applyMut.mutate()}
            disabled={!plans || !hasChanges || applyMut.isPending}
          >
            <Play className="size-4 mr-1" />
            {applyMut.isPending
              ? "应用中..."
              : hasChanges
                ? `确认应用到 Cloudflare（${totals!.create + totals!.update + totals!.delete} 项）`
                : "确认应用到 Cloudflare"}
          </Button>
        </div>
      </Card>

      {plans && totals && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">变更计划预览</div>
            <Badge className="bg-success text-success-foreground hover:bg-success">
              创建 {totals.create}
            </Badge>
            <Badge className="bg-primary text-primary-foreground hover:bg-primary">
              更新 {totals.update}
            </Badge>
            <Badge variant="destructive">删除 {totals.delete}</Badge>
            <Badge variant="secondary">跳过 {totals.skip}</Badge>
            {!hasChanges && (
              <span className="text-sm text-muted-foreground ml-2">
                线上已与备份一致，无需应用。
              </span>
            )}
          </div>

          <div className="space-y-2">
            {plans.map((p) => {
              const key = p.domain;
              const isOpen = expanded[key] ?? false;
              const visible = p.ops.filter((o) => o.op !== "skip");
              return (
                <div key={key} className="border rounded">
                  <button
                    className="w-full flex items-center gap-2 p-3 hover:bg-accent text-left"
                    onClick={() => setExpanded({ ...expanded, [key]: !isOpen })}
                  >
                    <span className="font-mono font-semibold">{p.domain}</span>
                    {p.missingZone ? (
                      <Badge variant="destructive">Zone 不存在</Badge>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-success border-success/40">
                          +{p.summary.create}
                        </Badge>
                        <Badge variant="outline" className="text-primary border-primary/40">
                          ~{p.summary.update}
                        </Badge>
                        <Badge variant="outline" className="text-destructive border-destructive/40">
                          −{p.summary.delete}
                        </Badge>
                        <Badge variant="outline" className="text-muted-foreground">
                          skip {p.summary.skip}
                        </Badge>
                      </>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {isOpen ? "收起" : `展开 ${visible.length} 项`}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t max-h-80 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="p-2 text-left w-16">操作</th>
                            <th className="p-2 text-left w-16">Type</th>
                            <th className="p-2 text-left">Name</th>
                            <th className="p-2 text-left">Content</th>
                            <th className="p-2 text-left">详情</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.ops.map((o, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2">
                                <OpBadge op={o.op} />
                              </td>
                              <td className="p-2 font-mono">{o.record.type}</td>
                              <td className="p-2 font-mono">{o.record.name}</td>
                              <td className="p-2 font-mono truncate max-w-xs">
                                {o.record.content}
                              </td>
                              <td className="p-2 text-muted-foreground">
                                {o.op === "update"
                                  ? `ttl ${o.from.ttl}→${o.record.ttl}, proxied ${o.from.proxied}→${o.record.proxied}${o.from.priority !== o.record.priority ? `, prio ${o.from.priority ?? "-"}→${o.record.priority ?? "-"}` : ""}`
                                  : o.op === "skip"
                                    ? o.reason
                                    : `ttl ${o.record.ttl}${["A", "AAAA", "CNAME"].includes(o.record.type) ? `, proxied ${o.record.proxied}` : ""}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {applied && (
        <Card className="p-4">
          <div className="font-semibold mb-2">应用结果</div>
          <div className="border rounded max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left">域名</th>
                  <th className="p-2">创建</th>
                  <th className="p-2">更新</th>
                  <th className="p-2">删除</th>
                  <th className="p-2">跳过</th>
                  <th className="p-2 text-left">错误</th>
                </tr>
              </thead>
              <tbody>
                {applied.results.map((r) => (
                  <tr key={r.domain} className="border-t">
                    <td className="p-2 font-mono">{r.domain}</td>
                    <td className="p-2 text-center text-success">{r.created}</td>
                    <td className="p-2 text-center text-primary">{r.updated}</td>
                    <td className="p-2 text-center text-destructive">{r.deleted}</td>
                    <td className="p-2 text-center text-muted-foreground">{r.skipped}</td>
                    <td className="p-2 text-xs text-destructive">
                      {r.errors.length === 0
                        ? "—"
                        : r.errors.slice(0, 3).join("; ") +
                          (r.errors.length > 3 ? ` (+${r.errors.length - 3})` : "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function OpBadge({ op }: { op: "create" | "update" | "delete" | "skip" }) {
  const map: Record<string, { label: string; cls: string }> = {
    create: { label: "创建", cls: "bg-success/15 text-success" },
    update: { label: "更新", cls: "bg-primary/15 text-primary" },
    delete: { label: "删除", cls: "bg-destructive text-destructive-foreground" },
    skip: { label: "跳过", cls: "bg-muted text-muted-foreground" },
  };
  const { label, cls } = map[op];
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function StrategyCard({
  value,
  title,
  description,
}: {
  value: RestoreStrategy;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-border/60 bg-card/60 p-3 text-sm">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}
