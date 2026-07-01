import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  diffAgainstLive,
  exportZoneRecords,
  restoreFromBackup,
  type BackupZone,
} from "@/lib/backup.functions";
import { useDomains } from "@/lib/domain-store";
import { downloadBlob, toCsv } from "@/lib/csv";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, GitCompare, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_app/backup")({
  head: () => ({ meta: [{ title: "备份与恢复 · DomainOps" }] }),
  component: BackupPage,
});

function BackupPage() {
  const domains = useDomains();
  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">备份 · 恢复 · 差异</h1>
      <p className="text-sm text-muted-foreground mb-6">
        当前选中 <Badge variant="secondary">{domains.length}</Badge> 个域名（在
        <Link to="/domains" className="text-primary underline mx-1">
          域名列表
        </Link>
        修改）。
      </p>

      {domains.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">请先到域名列表选中要处理的域名。</Card>
      ) : (
        <Tabs defaultValue="export">
          <TabsList>
            <TabsTrigger value="export">
              <Download className="size-4 mr-1" /> 导出
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
          `domainops-backup-${stamp}.json`,
          JSON.stringify(r.zones, null, 2),
          "application/json",
        );
      } else {
        const flat = r.zones.flatMap((z) =>
          z.records.map((rec) => ({ ...rec, domain: z.domain })),
        );
        downloadBlob(`domainops-backup-${stamp}.csv`, toCsv(flat), "text/csv");
      }
      return r;
    },
    onSuccess: (r) => {
      const total = r.zones.reduce((s, z) => s + z.records.length, 0);
      toast.success(`导出完成：${r.zones.length} 个 Zone / ${total} 条记录`);
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm">
        将实时从 Cloudflare 读取所有 DNS 记录并下载到本地，包含 type/name/content/ttl/proxied/priority。
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

function BackupFileInput({
  onLoad,
}: {
  onLoad: (zones: BackupZone[]) => void;
}) {
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
          } catch (err: any) {
            toast.error(err.message);
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
    onError: (e: any) => toast.error(e.message),
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
            {r.missingZone && <Badge variant="destructive" className="ml-2">CF 中不存在此 Zone</Badge>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <DiffCol title="仅在备份" color="text-blue-600" items={r.onlyInBackup.map((x) => `${x.type} ${x.name} → ${x.content}`)} />
            <DiffCol title="仅在线上" color="text-orange-600" items={r.onlyInLive.map((x) => `${x.type} ${x.name} → ${x.content}`)} />
            <DiffCol
              title="属性差异"
              color="text-purple-600"
              items={r.changed.map((c) => `${c.backup.type} ${c.backup.name}: ttl ${c.live.ttl}→${c.backup.ttl}, proxied ${c.live.proxied}→${c.backup.proxied}`)}
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
      <ul className="border rounded max-h-60 overflow-auto text-xs font-mono p-2 space-y-1 bg-muted/30">
        {items.length === 0 ? (
          <li className="text-muted-foreground">—</li>
        ) : (
          items.map((s, i) => <li key={i}>{s}</li>)
        )}
      </ul>
    </div>
  );
}

function RestoreTab() {
  const fn = useServerFn(restoreFromBackup);
  const [backup, setBackup] = useState<BackupZone[] | null>(null);
  const [strategy, setStrategy] = useState<"add-missing" | "overwrite" | "replace-all">(
    "add-missing",
  );
  const exec = useMutation({
    mutationFn: () => {
      if (!backup) throw new Error("先载入备份文件");
      return fn({ data: { backup, strategy } });
    },
    onSuccess: (r) => toast.success(`恢复完成：${r.results.length} 个 Zone`),
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <BackupFileInput onLoad={setBackup} />
          {backup && <Badge variant="secondary">{backup.length} zones 待恢复</Badge>}
        </div>
        <div>
          <div className="text-sm mb-1">恢复策略</div>
          <Select value={strategy} onValueChange={(v) => setStrategy(v as any)}>
            <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="add-missing">仅补齐缺失（线上已有则跳过）</SelectItem>
              <SelectItem value="overwrite">覆盖已存在（同 key 强制更新 ttl/proxied）</SelectItem>
              <SelectItem value="replace-all">完全替换（先删除备份中不存在的记录，再写入）⚠</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="destructive" onClick={() => exec.mutate()} disabled={!backup || exec.isPending}>
          {exec.isPending ? "执行中..." : "开始恢复"}
        </Button>
      </Card>
      {exec.data && (
        <Card className="p-4">
          <div className="font-semibold mb-2">结果</div>
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
                {exec.data.results.map((r) => (
                  <tr key={r.domain} className="border-t">
                    <td className="p-2 font-mono">{r.domain}</td>
                    <td className="p-2 text-center text-green-600">{r.created}</td>
                    <td className="p-2 text-center text-blue-600">{r.updated}</td>
                    <td className="p-2 text-center text-orange-600">{r.deleted}</td>
                    <td className="p-2 text-center text-muted-foreground">{r.skipped}</td>
                    <td className="p-2 text-xs text-destructive">
                      {r.errors.length === 0 ? "—" : r.errors.slice(0, 3).join("; ")}
                      {r.errors.length > 3 && ` (+${r.errors.length - 3})`}
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
