import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTokenStatus } from "@/lib/registrars.functions";
import { listZones } from "@/lib/cloudflare.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Globe, Link2, ListTree, Settings } from "lucide-react";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "仪表盘 · DomainOps" }] }),
  component: Dashboard,
});

function Dashboard() {
  const tokenFn = useServerFn(getTokenStatus);
  const zonesFn = useServerFn(listZones);
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => tokenFn() });
  const hasCF = tokens.data?.cloudflare;
  const zones = useQuery({
    queryKey: ["zones-summary"],
    queryFn: () => zonesFn(),
    enabled: !!hasCF,
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">仪表盘</h1>
      <p className="text-sm text-muted-foreground mb-6">
        批量将域名接入 Cloudflare，并统一管理 DNS 解析。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <TokenCard name="Cloudflare" ok={tokens.data?.cloudflare} />
        <TokenCard name="Spaceship" ok={tokens.data?.spaceship} />
        <TokenCard name="Dynadot" ok={tokens.data?.dynadot} />
      </div>

      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="font-semibold">Cloudflare 域名</div>
            <div className="text-sm text-muted-foreground">当前账户下已接入的 Zone 数量</div>
          </div>
          <div className="text-3xl font-bold">
            {zones.isLoading ? "…" : (zones.data?.zones?.length ?? "—")}
          </div>
        </div>
        {zones.error && (
          <p className="text-sm text-destructive">{(zones.error as Error).message}</p>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <QuickLink to="/domains" icon={<Globe className="size-5" />} title="域名列表" />
        <QuickLink to="/bind" icon={<Link2 className="size-5" />} title="批量绑定" />
        <QuickLink to="/records" icon={<ListTree className="size-5" />} title="解析记录" />
        <QuickLink to="/settings" icon={<Settings className="size-5" />} title="Token 设置" />
      </div>
    </div>
  );
}

function TokenCard({ name, ok }: { name: string; ok: boolean | undefined }) {
  return (
    <Card className="p-4 flex items-center justify-between">
      <div>
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">API Token</div>
      </div>
      {ok === undefined ? (
        <Badge variant="secondary">…</Badge>
      ) : ok ? (
        <span className="flex items-center gap-1 text-sm text-green-600">
          <CheckCircle2 className="size-4" /> 已配置
        </span>
      ) : (
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <XCircle className="size-4" /> 未配置
        </span>
      )}
    </Card>
  );
}

function QuickLink({ to, icon, title }: { to: string; icon: React.ReactNode; title: string }) {
  return (
    <Link to={to}>
      <Card className="p-4 hover:bg-accent transition-colors flex flex-col gap-2">
        {icon}
        <div className="font-medium">{title}</div>
      </Card>
    </Link>
  );
}
