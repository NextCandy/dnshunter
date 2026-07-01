import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { bindDomains, listAccounts } from "@/lib/cloudflare.functions";
import { getTokenStatus } from "@/lib/registrars.functions";
import { useDomains } from "@/lib/domain-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/bind")({
  head: () => ({ meta: [{ title: "批量绑定 · DomainOps" }] }),
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
  const [updateNS, setUpdateNS] = useState<"" | "spaceship" | "dynadot" | "cf-registrar">("");
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
    onError: (e: any) => toast.error(e.message),
  });

  const results = bind.data?.results || [];

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">批量绑定到 Cloudflare</h1>
      <p className="text-sm text-muted-foreground mb-6">
        为选中的域名创建 CF Zone；可选自动改 NS + 触发激活检查。
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
        <>
          <Card className="p-4 mb-4">
            <div className="font-semibold mb-2">目标（{domains.length} 个域名）</div>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-auto">
              {domains.map((d) => (
                <Badge key={d} variant="secondary" className="font-mono">
                  {d}
                </Badge>
              ))}
            </div>
          </Card>

          <Card className="p-4 mb-4 space-y-4">
            <div>
              <div className="text-sm font-medium mb-1">Cloudflare 账户</div>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择账户" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts.data?.accounts || []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — {a.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="text-sm font-medium mb-1">自动更新 NS（可选）</div>
              <Select value={updateNS} onValueChange={(v) => setUpdateNS(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="不改（只创建 Zone）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不改（只创建 Zone）</SelectItem>
                  <SelectItem value="spaceship" disabled={!tokens.data?.spaceship}>
                    Spaceship
                  </SelectItem>
                  <SelectItem value="dynadot" disabled={!tokens.data?.dynadot}>
                    Dynadot
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

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={activationCheck}
                onCheckedChange={(v) => setActivationCheck(Boolean(v))}
              />
              创建后立即触发 Cloudflare 激活检查
            </label>

            <Button
              onClick={() => bind.mutate()}
              disabled={!accountId || bind.isPending}
              className="w-full"
            >
              {bind.isPending ? "执行中，请勿关闭页面..." : `开始批量绑定 (${domains.length})`}
            </Button>
          </Card>

          {results.length > 0 && (
            <Card className="p-4">
              <div className="font-semibold mb-2">
                结果（成功 {results.filter((r) => r.zoneCreated !== "error").length} /{" "}
                {results.length}）
              </div>
              <div className="border rounded max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-left">域名</th>
                      <th className="p-2 text-left">Zone</th>
                      <th className="p-2 text-left">NS 更新</th>
                      <th className="p-2 text-left">激活</th>
                      <th className="p-2 text-left">Cloudflare NS</th>
                      <th className="p-2 text-left">错误</th>
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
                        <td className="p-2 text-xs font-mono">
                          {(r.nameServers || []).join(", ")}
                        </td>
                        <td className="p-2 text-xs text-destructive max-w-xs truncate">
                          {r.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "ok" || status === "exists"
      ? "bg-green-500/15 text-green-700 dark:text-green-400"
      : status === "error"
        ? "bg-destructive/15 text-destructive"
        : "bg-muted text-muted-foreground";
  return <span className={`px-2 py-0.5 rounded text-xs ${color}`}>{status}</span>;
}
