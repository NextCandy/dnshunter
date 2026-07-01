import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTokenStatus } from "@/lib/registrars.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Token 设置 · DomainOps" }] }),
  component: TokensPage,
});

function TokensPage() {
  const fn = useServerFn(getTokenStatus);
  const q = useQuery({ queryKey: ["tokens"], queryFn: () => fn() });
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Token 设置</h1>
      <p className="text-sm text-muted-foreground mb-6">
        所有 Token 只保存在服务端（加密的项目密钥），永远不会发送到浏览器。
        添加或修改请通过 Lovable → Cloud → Secrets 页面，或让 AI 助手 使用「添加密钥」工具。
      </p>

      <div className="space-y-3">
        <TokenRow
          name="Cloudflare"
          ok={q.data?.cloudflare}
          env="CLOUDFLARE_API_TOKEN"
          hint="需权限：Zone:Read/Edit, DNS:Edit（可选 Account:Read 用于列出账户）。"
          link="https://dash.cloudflare.com/profile/api-tokens"
        />
        <TokenRow
          name="Spaceship"
          ok={q.data?.spaceship}
          env="SPACESHIP_API_KEY + SPACESHIP_API_SECRET"
          hint="Spaceship 后台 → API → 生成 Key 与 Secret。"
          link="https://www.spaceship.com/application/api-manager/"
        />
        <TokenRow
          name="Dynadot"
          ok={q.data?.dynadot}
          env="DYNADOT_API_KEY"
          hint="Dynadot 后台 → Tools → API → 启用 API v3。"
          link="https://www.dynadot.com/account/domain/setting/api.html"
        />
      </div>

      <Card className="mt-8 p-4 text-sm text-muted-foreground">
        提示：Cloudflare Registrar（在 CF 上注册的域名）与 Cloudflare Zone 使用同一个 API Token，
        无需额外配置。
      </Card>

      <div className="mt-6">
        <Button variant="outline" onClick={() => q.refetch()}>
          刷新状态
        </Button>
      </div>
    </div>
  );
}

function TokenRow({
  name,
  ok,
  env,
  hint,
  link,
}: {
  name: string;
  ok: boolean | undefined;
  env: string;
  hint: string;
  link: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-semibold">{name}</div>
          <code className="text-xs text-muted-foreground">{env}</code>
        </div>
        {ok ? (
          <span className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="size-4" /> 已配置
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <XCircle className="size-4" /> 未配置
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="text-sm inline-flex items-center gap-1 text-primary mt-2 hover:underline"
      >
        获取 Token <ExternalLink className="size-3" />
      </a>
    </Card>
  );
}
