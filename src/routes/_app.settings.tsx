import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { getSecretsStatus, saveSecrets } from "@/lib/secrets.functions";
import {
  deleteRegistrar,
  listRegistrars,
  saveRegistrar,
  type RegistrarCatalogItem,
  type RegistrarCatalogPatch,
  type RegistrarCredentialField,
  type RegistrarSyncStrategy,
} from "@/lib/registrar-catalog.functions";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ServerCog,
  Trash2,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "系统设置 · dshunter" }] }),
  component: SettingsPage,
});

const STRATEGY_LABELS: Record<RegistrarSyncStrategy, string> = {
  rest: "REST",
  graphql: "GraphQL",
  scrape: "Scrape",
  manual: "手动",
};

function SettingsPage() {
  const statusFn = useServerFn(getSecretsStatus);
  const listRegistrarFn = useServerFn(listRegistrars);
  const secrets = useQuery({ queryKey: ["secrets"], queryFn: () => statusFn() });
  const registrars = useQuery({
    queryKey: ["registrar-catalog"],
    queryFn: () => listRegistrarFn(),
  });

  const rows = registrars.data?.rows ?? [];
  const activeRows = rows.filter((row) => row.active);
  const presence = secrets.data?.presence ?? {};
  const configuredCount = activeRows.filter((row) => isConfigured(row, presence)).length;

  const refreshAll = async () => {
    await Promise.all([secrets.refetch(), registrars.refetch()]);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">系统设置</h1>
          <p className="text-sm text-muted-foreground">
            管理主题、注册商来源、API 凭证与后续同步策略。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <SettingMetric label="来源" value={activeRows.length} />
          <SettingMetric label="已配置" value={configuredCount} />
          <SettingMetric label="停用" value={rows.length - activeRows.length} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <RegistrarManager rows={rows} loading={registrars.isLoading} onChanged={refreshAll} />

        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Power className="size-4 text-primary" />
              主题
            </div>
            <p className="mb-3 text-sm text-muted-foreground">选择浅色、深色或跟随系统。</p>
            <ThemeToggle />
          </Card>

          <Card className="p-5">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <ServerCog className="size-4 text-primary" />
              凭证安全
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              API 凭证加密保存在服务端，浏览器只显示配置状态。清除 UI 保存值后会回退到环境变量。
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={refreshAll}>
              <RefreshCw className="size-3.5" />
              刷新状态
            </Button>
          </Card>
        </div>
      </div>

      <CredentialAccordion
        rows={activeRows}
        presence={presence as Record<string, boolean>}
        onSaved={refreshAll}
      />
    </div>
  );
}

function SettingMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-md border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RegistrarManager({
  rows,
  loading,
  onChanged,
}: {
  rows: RegistrarCatalogItem[];
  loading: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<RegistrarCatalogItem | "new" | null>(null);

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 font-display text-lg font-semibold">
              <ServerCog className="size-5 text-primary" />
              注册商来源
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              内置来源可编辑展示信息；自定义来源会保留字段、颜色和默认 NS，等待接入同步适配器。
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" />
            新增注册商
          </Button>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {loading && (
          <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在载入注册商目录
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="p-8 text-center">
            <ServerCog className="mx-auto mb-3 size-8 text-muted-foreground" />
            <div className="font-medium">暂无注册商来源</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              新增注册商后，可配置品牌颜色、凭证字段和默认 NS，后续再接入同步逻辑。
            </p>
            <Button size="sm" className="mt-4" onClick={() => setEditing("new")}>
              新增注册商
            </Button>
          </div>
        )}
        {rows.map((row) => (
          <RegistrarRow key={row.id} row={row} onEdit={() => setEditing(row)} />
        ))}
      </div>

      <RegistrarEditor
        row={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onChanged={async () => {
          setEditing(null);
          await onChanged();
        }}
      />
    </Card>
  );
}

function RegistrarRow({ row, onEdit }: { row: RegistrarCatalogItem; onEdit: () => void }) {
  return (
    <div className={cn("grid gap-4 p-4 md:grid-cols-[1fr_auto]", !row.active && "opacity-60")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: row.brandColor }}
            aria-hidden="true"
          />
          <span className="font-medium">{row.name}</span>
          <Badge variant={row.active ? "secondary" : "outline"}>
            {row.active ? "启用" : "已停用"}
          </Badge>
          {row.builtin && <Badge variant="outline">内置</Badge>}
          {!row.supportsSync && <Badge variant="outline">待接入同步</Badge>}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {row.shortName} · {STRATEGY_LABELS[row.syncStrategy]} · {row.credentialFields.length}{" "}
          个凭证字段
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.hint}</p>
        {row.defaultNameservers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {row.defaultNameservers.map((ns) => (
              <Badge key={ns} variant="secondary" className="font-mono text-[10px]">
                {ns}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" />
          编辑
        </Button>
      </div>
    </div>
  );
}

function RegistrarEditor({
  row,
  onOpenChange,
  onChanged,
}: {
  row: RegistrarCatalogItem | "new" | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const saveFn = useServerFn(saveRegistrar);
  const deleteFn = useServerFn(deleteRegistrar);
  const [draft, setDraft] = useState<RegistrarCatalogPatch>(() => emptyRegistrarDraft());
  const [fieldsText, setFieldsText] = useState("");
  const [nameserversText, setNameserversText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    const source = row === "new" ? null : row;
    setDraft(
      source
        ? {
            id: source.id,
            name: source.name,
            shortName: source.shortName,
            hint: source.hint,
            link: source.link,
            logoUrl: source.logoUrl ?? "",
            brandColor: source.brandColor,
            credentialFields: source.credentialFields,
            syncStrategy: source.syncStrategy,
            defaultNameservers: source.defaultNameservers,
            active: source.active,
          }
        : emptyRegistrarDraft(),
    );
    setFieldsText(
      (source?.credentialFields ?? [])
        .map((field) =>
          [field.key, field.label, field.secret ? "secret" : "", field.optional ? "optional" : ""]
            .filter(Boolean)
            .join("|"),
        )
        .join("\n"),
    );
    setNameserversText((source?.defaultNameservers ?? []).join("\n"));
  }, [row]);

  const open = Boolean(row);
  const editingExisting = row && row !== "new";

  const save = async () => {
    if (!draft.name?.trim()) {
      toast.error("注册商名称不能为空");
      return;
    }
    setSaving(true);
    try {
      await saveFn({
        data: {
          ...draft,
          credentialFields: parseCredentialFields(fieldsText),
          defaultNameservers: parseLines(nameserversText),
        },
      });
      toast.success("注册商来源已保存");
      await onChanged();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async () => {
    if (!editingExisting) return;
    setSaving(true);
    try {
      await deleteFn({ data: { id: row.id } });
      toast.success("注册商已停用，历史记录会保留");
      await onChanged();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "停用失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingExisting ? "编辑注册商" : "新增注册商"}</DialogTitle>
          <DialogDescription>
            保存注册商展示信息、API 字段定义、同步方式和默认 NS。停用是软删除，不会清除历史域名。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldInput
            label="名称"
            value={draft.name ?? ""}
            onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
          />
          <FieldInput
            label="短名称"
            value={draft.shortName ?? ""}
            onChange={(value) => setDraft((current) => ({ ...current, shortName: value }))}
          />
          <FieldInput
            label="ID"
            value={draft.id ?? ""}
            disabled={Boolean(editingExisting)}
            placeholder="例如 namesilo"
            onChange={(value) => setDraft((current) => ({ ...current, id: value }))}
          />
          <FieldInput
            label="品牌色"
            value={draft.brandColor ?? "#3b82f6"}
            onChange={(value) => setDraft((current) => ({ ...current, brandColor: value }))}
          />
          <FieldInput
            label="凭证入口 URL"
            value={draft.link ?? ""}
            className="sm:col-span-2"
            onChange={(value) => setDraft((current) => ({ ...current, link: value }))}
          />
          <FieldInput
            label="Logo URL"
            value={draft.logoUrl ?? ""}
            className="sm:col-span-2"
            onChange={(value) => setDraft((current) => ({ ...current, logoUrl: value }))}
          />
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">说明</span>
            <Textarea
              value={draft.hint ?? ""}
              onChange={(event) =>
                setDraft((current) => ({ ...current, hint: event.target.value }))
              }
              rows={3}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">同步方式</span>
            <Select
              value={draft.syncStrategy ?? "manual"}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  syncStrategy: value as RegistrarSyncStrategy,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rest">REST</SelectItem>
                <SelectItem value="graphql">GraphQL</SelectItem>
                <SelectItem value="scrape">Scrape</SelectItem>
                <SelectItem value="manual">手动</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <span>
              <span className="block text-sm font-medium">启用来源</span>
              <span className="text-xs text-muted-foreground">关闭后从筛选和同步入口隐藏</span>
            </span>
            <Switch
              checked={draft.active !== false}
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, active: checked }))
              }
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">API 字段定义</span>
            <Textarea
              value={fieldsText}
              onChange={(event) => setFieldsText(event.target.value)}
              rows={5}
              placeholder="API_KEY|API Key|secret|optional"
              className="font-mono text-xs"
            />
            <span className="block text-[11px] text-muted-foreground">
              每行一个字段：KEY|显示名|secret|optional。自定义字段会先保存为元数据。
            </span>
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-muted-foreground">默认 Nameserver</span>
            <Textarea
              value={nameserversText}
              onChange={(event) => setNameserversText(event.target.value)}
              rows={3}
              placeholder="ns1.example.com"
              className="font-mono text-xs"
            />
          </label>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {editingExisting ? (
            <Button variant="ghost" onClick={softDelete} disabled={saving}>
              <Trash2 className="size-4" />
              停用
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  className,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={cn("space-y-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function CredentialAccordion({
  rows,
  presence,
  onSaved,
}: {
  rows: RegistrarCatalogItem[];
  presence: Record<string, boolean>;
  onSaved: () => Promise<void>;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/25 p-5">
        <div className="font-display text-lg font-semibold">API 凭证</div>
        <p className="mt-1 text-sm text-muted-foreground">
          按注册商折叠管理凭证。自定义来源的凭证会加密保存；自动同步需接入对应适配器。
        </p>
      </div>
      <Accordion type="multiple" className="px-5">
        {rows.map((row) => (
          <AccordionItem key={row.id} value={row.id}>
            <AccordionTrigger className="hover:no-underline">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: row.brandColor }}
                  aria-hidden="true"
                />
                <span className="truncate">{row.name}</span>
                {isConfigured(row, presence) ? (
                  <Badge className="bg-success/10 text-success hover:bg-success/10">
                    <CheckCircle2 className="size-3" />
                    已配置
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <XCircle className="size-3" />
                    未配置
                  </Badge>
                )}
                {!row.supportsSync && <Badge variant="secondary">元数据</Badge>}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <CredentialPanel row={row} presence={presence} onSaved={onSaved} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Card>
  );
}

function CredentialPanel({
  row,
  presence,
  onSaved,
}: {
  row: RegistrarCatalogItem;
  presence: Record<string, boolean>;
  onSaved: () => Promise<void>;
}) {
  const saveFn = useServerFn(saveSecrets);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const configured = isConfigured(row, presence);
  const editable = row.credentialFields.length > 0;
  const hasInput = Object.values(vals).some((value) => value.trim() !== "");

  async function save() {
    const patch: Record<string, string> = {};
    for (const [key, value] of Object.entries(vals)) {
      if (value.trim()) patch[key] = value.trim();
    }
    if (Object.keys(patch).length === 0) {
      toast.info("没有要保存的改动");
      return;
    }
    setSaving(true);
    try {
      await saveFn({ data: patch });
      setVals({});
      toast.success(`${row.name} 凭证已保存`);
      await onSaved();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    const patch: Record<string, string> = {};
    for (const field of row.credentialFields) patch[field.key] = "";
    setSaving(true);
    try {
      await saveFn({ data: patch });
      setVals({});
      toast.success(`${row.name} 凭证已清除`);
      await onSaved();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "清除失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {!editable && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          该来源暂无 API 字段定义。请先在注册商来源里添加字段，再保存凭证。
        </div>
      )}
      {editable && !row.supportsSync && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          该来源尚未接入自动同步适配器；凭证会加密保存，后续适配器上线后可直接使用。
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {row.credentialFields.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">
            暂无 API 字段。可在上方注册商来源中编辑字段定义。
          </div>
        )}
        {row.credentialFields.map((field) => (
          <CredentialInput
            key={field.key}
            field={field}
            disabled={!editable}
            present={Boolean(presence[field.key])}
            value={vals[field.key] ?? ""}
            visible={Boolean(visible[field.key])}
            onValueChange={(value) => setVals((state) => ({ ...state, [field.key]: value }))}
            onVisibleChange={() =>
              setVisible((state) => ({ ...state, [field.key]: !state[field.key] }))
            }
          />
        ))}
      </div>

      {row.id === "cloudflare" && <CloudflarePermissions />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={row.link || undefined}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex items-center gap-1 text-sm text-primary hover:underline",
            !row.link && "pointer-events-none text-muted-foreground",
          )}
        >
          获取凭证 <ExternalLink className="size-3" />
        </a>
        <div className="flex gap-2">
          {configured && editable && (
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={saving}>
              清除
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={saving || !hasInput || !editable}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function CredentialInput({
  field,
  value,
  present,
  visible,
  disabled,
  onValueChange,
  onVisibleChange,
}: {
  field: RegistrarCredentialField;
  value: string;
  present: boolean;
  visible: boolean;
  disabled: boolean;
  onValueChange: (value: string) => void;
  onVisibleChange: () => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">
        {field.label}
        {field.optional ? "（可选）" : ""}
      </label>
      <div className="relative">
        <Input
          type={field.secret && !visible ? "password" : "text"}
          autoComplete="off"
          disabled={disabled}
          placeholder={present ? "已保存（留空则不变）" : "未配置"}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={field.secret ? "pr-10" : undefined}
        />
        {field.secret && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={onVisibleChange}
            disabled={disabled}
            aria-label={visible ? "隐藏密钥" : "显示密钥"}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {present && field.secret && (
        <div className="mt-1 text-[11px] text-muted-foreground">已保存不再下发</div>
      )}
    </div>
  );
}

function CloudflarePermissions() {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs">
      <div className="mb-1.5 font-medium">Token 权限清单（按使用的功能勾选）：</div>
      <ul className="space-y-1 font-mono text-muted-foreground">
        <li>
          Zone → Zone → Read <span className="font-sans">（查找 / 列出 Zone，必需）</span>
        </li>
        <li>
          Zone → Zone → Edit <span className="font-sans">（批量绑定创建 Zone）</span>
        </li>
        <li>
          Zone → DNS → Read <span className="font-sans">（读取 DNS 记录）</span>
        </li>
        <li>
          Zone → DNS → Edit <span className="font-sans">（新增 / 修改 / 删除 DNS 记录）</span>
        </li>
        <li>
          Account → Account Settings → Read{" "}
          <span className="font-sans">（批量绑定时列出账户）</span>
        </li>
      </ul>
      <div className="mt-1.5 text-muted-foreground">
        Zone Resources 建议选择 All zones（或至少覆盖要管理的 Zone）。
      </div>
    </div>
  );
}

function isConfigured(row: RegistrarCatalogItem, presence: Record<string, boolean | undefined>) {
  const required = row.credentialFields.filter((field) => !field.optional);
  if (required.length === 0) return false;
  return required.every((field) => Boolean(presence[field.key]));
}

function emptyRegistrarDraft(): RegistrarCatalogPatch {
  return {
    id: "",
    name: "",
    shortName: "",
    hint: "",
    link: "",
    logoUrl: "",
    brandColor: "#3b82f6",
    credentialFields: [],
    syncStrategy: "manual",
    defaultNameservers: [],
    active: true,
  };
}

function parseLines(text: string) {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCredentialFields(text: string): RegistrarCredentialField[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawKey, rawLabel, flagA, flagB] = line.split("|").map((part) => part.trim());
      const flags = new Set([flagA, flagB].filter(Boolean).map((part) => part.toLowerCase()));
      const key = rawKey.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      return {
        key,
        label: rawLabel || key,
        secret: flags.has("secret"),
        optional: flags.has("optional"),
      };
    })
    .filter((field) => field.key);
}
