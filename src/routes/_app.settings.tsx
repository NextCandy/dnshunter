import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getSecretsStatus, saveSecrets } from "@/lib/secrets.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "设置 · dshunter" }] }),
  component: SettingsPage,
});

type Field = { key: string; label: string; secret?: boolean; optional?: boolean };
type RegistrarDef = {
  id: string;
  name: string;
  hint: string;
  link: string;
  fields: Field[];
};

// 每个注册商 / Cloudflare 所需的凭证字段。字段名与后端 SECRET_KEYS 一一对应。
const REGISTRARS: RegistrarDef[] = [
  {
    id: "cloudflare",
    name: "Cloudflare",
    hint: "需权限：Zone:Read/Edit、DNS:Edit（可选 Account:Read 用于列出账户）。Cloudflare Registrar 域名共用同一 Token。",
    link: "https://dash.cloudflare.com/profile/api-tokens",
    fields: [{ key: "CLOUDFLARE_API_TOKEN", label: "API Token", secret: true }],
  },
  {
    id: "spaceship",
    name: "Spaceship",
    hint: "Spaceship 后台 → API Manager → 生成 API Key 与 Secret。",
    link: "https://www.spaceship.com/application/api-manager/",
    fields: [
      { key: "SPACESHIP_API_KEY", label: "API Key" },
      { key: "SPACESHIP_API_SECRET", label: "API Secret", secret: true },
    ],
  },
  {
    id: "dynadot",
    name: "Dynadot",
    hint: "Dynadot 后台 → Tools → API → 启用 API v3。",
    link: "https://www.dynadot.com/account/domain/setting/api.html",
    fields: [{ key: "DYNADOT_API_KEY", label: "API Key", secret: true }],
  },
  {
    id: "namecheap",
    name: "Namecheap",
    hint: "需把服务器出口 IP 加入 Namecheap 白名单；Client IP 必须与实际出口 IP 一致。",
    link: "https://ap.www.namecheap.com/settings/tools/apiaccess/",
    fields: [
      { key: "NAMECHEAP_API_USER", label: "API User" },
      { key: "NAMECHEAP_API_KEY", label: "API Key", secret: true },
      { key: "NAMECHEAP_USERNAME", label: "Username（留空=同 API User）", optional: true },
      { key: "NAMECHEAP_CLIENT_IP", label: "Client IP" },
    ],
  },
  {
    id: "aliyun",
    name: "阿里云（万网）",
    hint: "建议单独 RAM 用户 AccessKey，最少授予 AliyunDomainFullAccess。",
    link: "https://ram.console.aliyun.com/manage/ak",
    fields: [
      { key: "ALIYUN_ACCESS_KEY_ID", label: "AccessKey ID" },
      { key: "ALIYUN_ACCESS_KEY_SECRET", label: "AccessKey Secret", secret: true },
    ],
  },
  {
    id: "tencent",
    name: "腾讯云（域名）",
    hint: "子账号密钥，授予 QcloudDomainFullAccess。",
    link: "https://console.cloud.tencent.com/cam/capi",
    fields: [
      { key: "TENCENT_SECRET_ID", label: "SecretId" },
      { key: "TENCENT_SECRET_KEY", label: "SecretKey", secret: true },
    ],
  },
  {
    id: "west",
    name: "西部数码 West.cn",
    hint: "后台 → 账户设置 → API 接口，启用并设置 API 密码（不同于登录密码）。",
    link: "https://www.west.cn/manager/API/",
    fields: [
      { key: "WEST_USERNAME", label: "用户名" },
      { key: "WEST_API_PASSWORD", label: "API 密码", secret: true },
    ],
  },
];

function SettingsPage() {
  const statusFn = useServerFn(getSecretsStatus);
  const q = useQuery({ queryKey: ["secrets"], queryFn: () => statusFn() });
  const presence = q.data?.presence ?? {};

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">设置</h1>
      <p className="text-sm text-muted-foreground mb-6">管理外观，以及各注册商 / Cloudflare 的 API 凭证。</p>

      <Card className="p-4 mb-6">
        <div className="font-semibold mb-2">主题</div>
        <p className="text-sm text-muted-foreground mb-3">选择浅色、深色或跟随系统。</p>
        <ThemeToggle />
      </Card>

      <h2 className="text-lg font-semibold mb-2">API 凭证</h2>
      <p className="text-sm text-muted-foreground mb-4">
        在此填写并保存各服务的 API 凭证。凭证会<strong>加密保存在服务端</strong>（也可用环境变量预置），
        页面只显示「已配置 / 未配置」，明文永远不会回传浏览器。填写后点「保存」即刻生效，无需重启。
      </p>

      <div className="space-y-3">
        {REGISTRARS.map((reg) => (
          <RegistrarCard
            key={reg.id}
            reg={reg}
            presence={presence as Record<string, boolean>}
            onSaved={() => q.refetch()}
          />
        ))}
      </div>

      <div className="mt-6 mb-8">
        <Button variant="outline" onClick={() => q.refetch()}>
          刷新状态
        </Button>
      </div>
    </div>
  );
}

function RegistrarCard({
  reg,
  presence,
  onSaved,
}: {
  reg: RegistrarDef;
  presence: Record<string, boolean>;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveSecrets);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const configured = reg.fields.filter((f) => !f.optional).every((f) => presence[f.key]);
  const hasInput = Object.values(vals).some((v) => v.trim() !== "");

  async function save() {
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(vals)) if (v.trim() !== "") patch[k] = v.trim();
    if (Object.keys(patch).length === 0) {
      toast.info("没有要保存的改动");
      return;
    }
    setSaving(true);
    try {
      await saveFn({ data: patch });
      setVals({});
      toast.success(`${reg.name} 凭证已保存`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    const patch: Record<string, string> = {};
    for (const f of reg.fields) patch[f.key] = "";
    setSaving(true);
    try {
      await saveFn({ data: patch });
      setVals({});
      toast.success(`${reg.name} 凭证已清除`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "清除失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">{reg.name}</div>
        {configured ? (
          <span className="flex items-center gap-1 text-sm text-green-600 shrink-0 ml-2">
            <CheckCircle2 className="size-4" /> 已配置
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-muted-foreground shrink-0 ml-2">
            <XCircle className="size-4" /> 未配置
          </span>
        )}
      </div>

      <div className="space-y-2 mb-3">
        {reg.fields.map((f) => (
          <div key={f.key}>
            <label className="text-xs text-muted-foreground">{f.label}</label>
            <Input
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              placeholder={presence[f.key] ? "已保存（留空则不变）" : "未配置"}
              value={vals[f.key] ?? ""}
              onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-2">{reg.hint}</p>

      <div className="flex items-center justify-between">
        <a
          href={reg.link}
          target="_blank"
          rel="noreferrer"
          className="text-sm inline-flex items-center gap-1 text-primary hover:underline"
        >
          获取凭证 <ExternalLink className="size-3" />
        </a>
        <div className="flex gap-2">
          {configured && (
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={saving}>
              清除
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={saving || !hasInput}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
