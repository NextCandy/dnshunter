import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getTokenStatus, listRegistrarDomains } from "@/lib/registrars.functions";
import { listZones } from "@/lib/cloudflare.functions";
import { parseDomainList } from "@/lib/domain-utils";
import { setDomains, useDomains } from "@/lib/domain-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/domains")({
  head: () => ({ meta: [{ title: "域名列表 · DomainOps" }] }),
  component: DomainsPage,
});

type Source = "manual" | "spaceship" | "dynadot" | "cf-registrar" | "cloudflare-zone";
type Entry = { domain: string; sources: Set<Source> };

function DomainsPage() {
  const tokensFn = useServerFn(getTokenStatus);
  const listFn = useServerFn(listRegistrarDomains);
  const zonesFn = useServerFn(listZones);
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => tokensFn() });

  const [manual, setManual] = useState("");
  const [pulled, setPulled] = useState<Record<Source, string[]>>({
    manual: [],
    spaceship: [],
    dynadot: [],
    "cf-registrar": [],
    "cloudflare-zone": [],
  });

  const persisted = useDomains();
  const [selected, setSelected] = useState<Set<string>>(new Set(persisted));

  const pull = useMutation({
    mutationFn: async (src: Source) => {
      if (src === "cloudflare-zone") {
        const r = await zonesFn();
        return { src, domains: r.zones.map((z) => z.name) };
      }
      const r = await listFn({ data: { registrar: src as any } });
      return { src, domains: r.domains };
    },
    onSuccess: ({ src, domains }) => {
      setPulled((p) => ({ ...p, [src]: domains }));
      toast.success(`${src}: 拉取到 ${domains.length} 个域名`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const merged = useMemo<Entry[]>(() => {
    const map = new Map<string, Entry>();
    const add = (d: string, s: Source) => {
      const e = map.get(d) || { domain: d, sources: new Set<Source>() };
      e.sources.add(s);
      map.set(d, e);
    };
    parseDomainList(manual).forEach((d) => add(d, "manual"));
    (Object.keys(pulled) as Source[]).forEach((s) =>
      pulled[s].forEach((d) => add(d.toLowerCase(), s)),
    );
    return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  }, [manual, pulled]);

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

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">域名列表</h1>
      <p className="text-sm text-muted-foreground mb-6">
        从注册商拉取或手动粘贴，去重合并后选中要处理的域名。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="font-semibold mb-2">手动粘贴</div>
          <Textarea
            rows={6}
            placeholder={"每行一个域名，例如：\nexample.com\nfoo.io"}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            自动去掉 http(s)://、路径、www 前缀，非法行会被忽略。
          </p>
        </Card>

        <Card className="p-4">
          <div className="font-semibold mb-3">从服务拉取</div>
          <div className="flex flex-col gap-2">
            <PullButton
              label="Cloudflare（已存在的 Zone）"
              ok={tokens.data?.cloudflare}
              loading={pull.isPending && pull.variables === "cloudflare-zone"}
              count={pulled["cloudflare-zone"].length}
              onClick={() => pull.mutate("cloudflare-zone")}
            />
            <PullButton
              label="Spaceship"
              ok={tokens.data?.spaceship}
              loading={pull.isPending && pull.variables === "spaceship"}
              count={pulled.spaceship.length}
              onClick={() => pull.mutate("spaceship")}
            />
            <PullButton
              label="Dynadot"
              ok={tokens.data?.dynadot}
              loading={pull.isPending && pull.variables === "dynadot"}
              count={pulled.dynadot.length}
              onClick={() => pull.mutate("dynadot")}
            />
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">
            合并结果 <span className="text-muted-foreground">({merged.length})</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set(merged.map((m) => m.domain)))}
            >
              全选
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              清空
            </Button>
            <Button size="sm" onClick={saveSelection} disabled={selected.size === 0}>
              保存选中 ({selected.size})
            </Button>
          </div>
        </div>

        <div className="border rounded-md max-h-[500px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="w-10 p-2"></th>
                <th className="p-2 text-left">域名</th>
                <th className="p-2 text-left">来源</th>
              </tr>
            </thead>
            <tbody>
              {merged.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-muted-foreground">
                    还没有域名。粘贴或从上方拉取。
                  </td>
                </tr>
              )}
              {merged.map((e) => (
                <tr key={e.domain} className="border-t hover:bg-accent/40">
                  <td className="p-2">
                    <Checkbox
                      checked={selected.has(e.domain)}
                      onCheckedChange={() => toggle(e.domain)}
                    />
                  </td>
                  <td className="p-2 font-mono">{e.domain}</td>
                  <td className="p-2 flex gap-1 flex-wrap">
                    {[...e.sources].map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PullButton({
  label,
  ok,
  loading,
  count,
  onClick,
}: {
  label: string;
  ok: boolean | undefined;
  loading: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm">
        {label}
        {count > 0 && <span className="ml-2 text-muted-foreground">({count})</span>}
      </div>
      <Button size="sm" variant="outline" onClick={onClick} disabled={!ok || loading}>
        {loading ? "拉取中..." : ok ? "拉取" : "未配置"}
      </Button>
    </div>
  );
}
