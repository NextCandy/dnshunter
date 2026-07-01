import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTokenStatus } from "@/lib/registrars.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ExternalLink, FileText } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "设置 · DomainOps" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const fn = useServerFn(getTokenStatus);
  const q = useQuery({ queryKey: ["tokens"], queryFn: () => fn() });
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">设置</h1>
      <p className="text-sm text-muted-foreground mb-6">
        管理外观、Token 状态，以及查看 Vercel 部署指南。
      </p>

      <Card className="p-4 mb-6">
        <div className="font-semibold mb-2">主题</div>
        <p className="text-sm text-muted-foreground mb-3">选择浅色、深色或跟随系统。</p>
        <ThemeToggle />
      </Card>

      <h2 className="text-lg font-semibold mb-2">Token 状态</h2>
      <p className="text-sm text-muted-foreground mb-4">
        所有 Token 只保存在服务端（加密的项目环境变量），永远不会发送到浏览器。修改请在 Lovable
        → Cloud → Secrets（或 Vercel 项目环境变量）。
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
        <TokenRow
          name="Namecheap"
          ok={q.data?.namecheap}
          env="NAMECHEAP_API_USER + NAMECHEAP_API_KEY + NAMECHEAP_USERNAME + NAMECHEAP_CLIENT_IP"
          hint="需要把服务器出口 IP 加入 Namecheap 白名单；ClientIp 必须与实际出口 IP 一致。"
          link="https://ap.www.namecheap.com/settings/tools/apiaccess/"
        />
        <TokenRow
          name="阿里云（万网）"
          ok={q.data?.aliyun}
          env="ALIYUN_ACCESS_KEY_ID + ALIYUN_ACCESS_KEY_SECRET"
          hint="RAM 用户 AccessKey，最少授予 AliyunDomainFullAccess。"
          link="https://ram.console.aliyun.com/manage/ak"
        />
        <TokenRow
          name="腾讯云（DNSPod / 域名）"
          ok={q.data?.tencent}
          env="TENCENT_SECRET_ID + TENCENT_SECRET_KEY"
          hint="子账号密钥，授予 QcloudDomainFullAccess。"
          link="https://console.cloud.tencent.com/cam/capi"
        />
        <TokenRow
          name="西部数码 West.cn"
          ok={q.data?.west}
          env="WEST_USERNAME + WEST_API_PASSWORD"
          hint="后台 → 账户设置 → API 接口，启用并设置 API 密码（不同于登录密码）。"
          link="https://www.west.cn/manager/API/"
        />
      </div>

      <Card className="mt-8 p-4 text-sm text-muted-foreground">
        提示：Cloudflare Registrar（在 CF 上注册的域名）与 Cloudflare Zone 使用同一个 API Token，
        无需额外配置。
      </Card>

      <div className="mt-6 mb-8">
        <Button variant="outline" onClick={() => q.refetch()}>
          刷新状态
        </Button>
      </div>

      <Accordion type="single" collapsible className="mt-6">
        <AccordionItem value="deploy">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <FileText className="size-4" /> 部署到 Vercel（含环境变量与数据库说明）
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <DeployGuide />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function DeployGuide() {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm space-y-3">
      <ol className="list-decimal ml-5 space-y-2">
        <li>把代码推到 GitHub 仓库。</li>
        <li>
          Vercel <em>New Project → Import</em>，Framework 选 <strong>Other</strong>。
        </li>
        <li>
          Build：<code>bun run build</code>，Output：<code>.output/public</code>，Node 20+。
        </li>
        <li>
          Project Settings → Environment Variables 逐个添加：
          <ul className="list-disc ml-5 mt-1">
            <li><code>SESSION_SECRET</code>（<code>openssl rand -hex 32</code>）</li>
            <li><code>SITE_PASSWORD</code></li>
            <li><code>CLOUDFLARE_API_TOKEN</code></li>
            <li>各注册商 Token（按需，未配置的入口会置灰）</li>
          </ul>
        </li>
        <li>
          <strong>无需数据库</strong>：域名与解析实时读写 Cloudflare / 注册商，
          选中列表存 <code>localStorage</code>；只保留一个加密 Cookie 存"已解锁"。
        </li>
        <li>
          <strong>服务端函数</strong>：<code>createServerFn</code> 会自动编译为
          <code>/_serverFn/*</code>，Vercel 作为 Node Serverless 函数部署，
          不需要额外 <code>api/</code> 目录或 <code>vercel.json</code>。
        </li>
        <li>访问 <code>/settings</code> 检查各 Token 状态；然后到 <code>/domains</code> 开始使用。</li>
      </ol>
      <p>
        完整清单见项目根目录的
        <code className="mx-1">DEPLOY_VERCEL.md</code>
        （随仓库一起）。
      </p>
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
          <code className="text-xs text-muted-foreground break-all">{env}</code>
        </div>
        {ok ? (
          <span className="flex items-center gap-1 text-sm text-green-600 shrink-0 ml-2">
            <CheckCircle2 className="size-4" /> 已配置
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-muted-foreground shrink-0 ml-2">
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
