import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { getSiteSettings, saveAdminSiteSettings } from "@/lib/site-settings.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeckMark } from "@/components/deck-mark";
import type { ContactLink, SiteSettings, SocialLink } from "@/lib/site-settings.server";

export const Route = createFileRoute("/_app/site-settings")({
  head: () => ({ meta: [{ title: "前台设置 · dshunter" }] }),
  component: SiteSettingsPage,
});

const EMPTY_SETTINGS: SiteSettings = {
  siteName: "DS Hunter",
  siteDescription: "专业的域名展示、筛选与管理工具",
  shortDescription: "域名展示与筛选工具",
  heroDescription: "集中展示、筛选和管理你的域名项目。",
  logoUrl: "",
  faviconUrl: "",
  contactEmail: "",
  contactText: "",
  contactWechat: "",
  contactTelegram: "",
  contactQQ: "",
  icpNumber: "",
  policeRecordNumber: "",
  footerText: "",
  showIcp: false,
  showPoliceRecord: false,
  showFooterText: true,
  seoTitle: "DS Hunter",
  seoDescription: "DS Hunter - 域名展示、筛选与管理工具",
  copyrightOwner: "DS Hunter",
  copyrightYear: String(new Date().getFullYear()),
  announcement: "",
  socialLinks: [],
  contactLinks: [],
};

function SiteSettingsPage() {
  const queryClient = useQueryClient();
  const getSettings = useServerFn(getSiteSettings);
  const saveSettings = useServerFn(saveAdminSiteSettings);
  const q = useQuery({ queryKey: ["site-settings"], queryFn: () => getSettings() });
  const [form, setForm] = useState<SiteSettings>(EMPTY_SETTINGS);
  const [socialText, setSocialText] = useState("");

  useEffect(() => {
    if (!q.data?.settings) return;
    setForm(q.data.settings);
    setSocialText(formatSocialLinks(q.data.settings.socialLinks));
  }, [q.data?.settings]);

  const save = useMutation({
    mutationFn: () =>
      saveSettings({ data: { ...form, socialLinks: parseSocialLinks(socialText) } }),
    onSuccess: async (result) => {
      setForm(result.settings);
      setSocialText(formatSocialLinks(result.settings.socialLinks));
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      toast.success("站点设置已保存");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "站点设置保存失败");
    },
  });

  const setText = (key: keyof SiteSettings) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setBool = (key: keyof SiteSettings) => (value: boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="mx-auto grid max-w-6xl gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">前台设置</h1>
          <p className="text-sm text-muted-foreground">
            管理前台品牌、介绍、图标、联系方式和页脚备案信息。
          </p>
        </div>

        <Card className="grid gap-4 p-4">
          <SectionTitle title="品牌与介绍" />
          <Field label="网站名称" hint="显示在导航栏、页脚、浏览器标题和后台品牌区域。">
            <Input
              aria-label="网站名称"
              value={form.siteName}
              onChange={(event) => setText("siteName")(event.target.value)}
            />
          </Field>
          <Field label="短介绍" hint="显示在导航品牌下方。">
            <Input
              aria-label="短介绍"
              value={form.shortDescription}
              onChange={(event) => setText("shortDescription")(event.target.value)}
            />
          </Field>
          <Field label="网站介绍" hint="用于关于文案和默认 SEO description。">
            <Textarea
              aria-label="网站介绍"
              rows={3}
              value={form.siteDescription}
              onChange={(event) => setText("siteDescription")(event.target.value)}
            />
          </Field>
          <Field label="Hero 介绍" hint="显示在首页主标题下方。">
            <Textarea
              aria-label="Hero 介绍"
              rows={3}
              value={form.heroDescription}
              onChange={(event) => setText("heroDescription")(event.target.value)}
            />
          </Field>
          <Field label="公告" hint="可留空；填写后在首页 Hero 区显示。">
            <Input
              aria-label="公告"
              value={form.announcement}
              onChange={(event) => setText("announcement")(event.target.value)}
            />
          </Field>
        </Card>

        <Card className="grid gap-4 p-4">
          <SectionTitle title="图标与 SEO" />
          <Field label="Logo URL" hint="只允许 http/https 图片 URL；加载失败会回退默认图标。">
            <Input
              aria-label="Logo URL"
              value={form.logoUrl}
              onChange={(event) => setText("logoUrl")(event.target.value)}
            />
          </Field>
          <Field label="Favicon URL" hint="只允许 http/https 图片 URL。">
            <Input
              aria-label="Favicon URL"
              value={form.faviconUrl}
              onChange={(event) => setText("faviconUrl")(event.target.value)}
            />
          </Field>
          <Field label="SEO 标题" hint="前台会同步到浏览器 title。">
            <Input
              aria-label="SEO 标题"
              value={form.seoTitle}
              onChange={(event) => setText("seoTitle")(event.target.value)}
            />
          </Field>
          <Field label="SEO 描述" hint="前台会同步到 description meta。">
            <Textarea
              aria-label="SEO 描述"
              rows={2}
              value={form.seoDescription}
              onChange={(event) => setText("seoDescription")(event.target.value)}
            />
          </Field>
        </Card>

        <Card className="grid gap-4 p-4">
          <SectionTitle title="联系方式" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="联系邮箱" hint="需符合邮箱格式；留空则隐藏。">
              <Input
                aria-label="联系邮箱"
                value={form.contactEmail}
                onChange={(event) => setText("contactEmail")(event.target.value)}
              />
            </Field>
            <Field label="联系文案" hint="例如工作时间或合作说明。">
              <Input
                aria-label="联系文案"
                value={form.contactText}
                onChange={(event) => setText("contactText")(event.target.value)}
              />
            </Field>
            <Field label="微信" hint="留空则隐藏。">
              <Input
                aria-label="微信"
                value={form.contactWechat}
                onChange={(event) => setText("contactWechat")(event.target.value)}
              />
            </Field>
            <Field label="Telegram" hint="留空则隐藏。">
              <Input
                aria-label="Telegram"
                value={form.contactTelegram}
                onChange={(event) => setText("contactTelegram")(event.target.value)}
              />
            </Field>
            <Field label="QQ" hint="留空则隐藏。">
              <Input
                aria-label="QQ"
                value={form.contactQQ}
                onChange={(event) => setText("contactQQ")(event.target.value)}
              />
            </Field>
          </div>
          <Field label="社交链接" hint="每行一个，格式：名称 | https://example.com">
            <Textarea
              aria-label="社交链接"
              rows={4}
              value={socialText}
              onChange={(event) => setSocialText(event.target.value)}
            />
          </Field>
        </Card>

        <Card className="grid gap-4 p-4">
          <SectionTitle title="联系方式图标链接（前台页脚）" />
          <p className="text-xs text-muted-foreground">
            前台页脚只显示这里启用的小图标超链接；类型决定图标，名称显示为悬停
            tooltip。邮箱可直接填邮箱地址（自动转 mailto），其余填 http(s) 链接。
          </p>
          <ContactLinksEditor
            links={form.contactLinks}
            onChange={(links) => setForm((current) => ({ ...current, contactLinks: links }))}
          />
        </Card>

        <Card className="grid gap-4 p-4">
          <SectionTitle title="页脚备案" />
          <Field label="页脚文案" hint="留空时使用网站介绍。">
            <Input
              aria-label="页脚文案"
              value={form.footerText}
              onChange={(event) => setText("footerText")(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="ICP备案号" hint="关闭显示或留空时前台不展示。">
              <Input
                aria-label="ICP备案号"
                value={form.icpNumber}
                onChange={(event) => setText("icpNumber")(event.target.value)}
              />
            </Field>
            <Toggle label="显示 ICP" checked={form.showIcp} onCheckedChange={setBool("showIcp")} />
            <Field label="公安备案号" hint="关闭显示或留空时前台不展示。">
              <Input
                aria-label="公安备案号"
                value={form.policeRecordNumber}
                onChange={(event) => setText("policeRecordNumber")(event.target.value)}
              />
            </Field>
            <Toggle
              label="显示公安备案"
              checked={form.showPoliceRecord}
              onCheckedChange={setBool("showPoliceRecord")}
            />
            <Field label="版权主体" hint="显示在页脚版权信息。">
              <Input
                aria-label="版权主体"
                value={form.copyrightOwner}
                onChange={(event) => setText("copyrightOwner")(event.target.value)}
              />
            </Field>
            <Field label="版权年份" hint="例如 2026。">
              <Input
                aria-label="版权年份"
                value={form.copyrightYear}
                onChange={(event) => setText("copyrightYear")(event.target.value)}
              />
            </Field>
          </div>
          <Toggle
            label="显示版权信息"
            checked={form.showFooterText}
            onCheckedChange={setBool("showFooterText")}
          />
        </Card>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur md:mx-0 md:rounded-lg md:border">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {q.isFetching ? "正在同步当前配置…" : "保存前会自动备份上一版配置。"}
            </span>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              保存站点设置
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-6 xl:h-fit">
        <Card className="overflow-hidden p-4">
          <SectionTitle title="预览" />
          <div className="mt-4 rounded-lg border border-border/60 bg-background p-4">
            <div className="flex items-center gap-3">
              <PreviewLogo url={form.logoUrl} />
              <div className="min-w-0">
                <div className="truncate font-display text-lg font-bold">{form.siteName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {form.shortDescription}
                </div>
              </div>
            </div>
            <div className="mt-5">
              <div className="text-xl font-semibold">{form.siteName}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{form.heroDescription}</p>
              {form.announcement && (
                <div className="mt-3 rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">
                  {form.announcement}
                </div>
              )}
            </div>
            <div className="mt-5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <div>{form.footerText || form.siteDescription}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {form.contactEmail && <span>{form.contactEmail}</span>}
                {form.contactWechat && <span>微信：{form.contactWechat}</span>}
                {form.contactTelegram && <span>Telegram：{form.contactTelegram}</span>}
                {form.contactQQ && <span>QQ：{form.contactQQ}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {form.showIcp && form.icpNumber && <span>{form.icpNumber}</span>}
                {form.showPoliceRecord && form.policeRecordNumber && (
                  <span>{form.policeRecordNumber}</span>
                )}
                {form.showFooterText && (
                  <span>
                    © {form.copyrightYear} {form.copyrightOwner}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Check className="size-4 text-success" />
            保存机制
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            配置保存到 data/site-settings.json；每次保存前备份旧文件，并保留最近 20 份。
          </p>
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <div className="font-semibold">{title}</div>;
}

const CONTACT_TYPE_OPTIONS: { value: ContactLink["type"]; label: string }[] = [
  { value: "email", label: "邮箱" },
  { value: "telegram", label: "Telegram" },
  { value: "wechat", label: "微信 / 二维码页" },
  { value: "x", label: "X / Twitter" },
  { value: "github", label: "GitHub" },
  { value: "custom", label: "自定义链接" },
];

function ContactLinksEditor({
  links,
  onChange,
}: {
  links: ContactLink[];
  onChange: (links: ContactLink[]) => void;
}) {
  const update = (index: number, patch: Partial<ContactLink>) => {
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  };
  const remove = (index: number) => onChange(links.filter((_, i) => i !== index));
  const add = () =>
    onChange([
      ...links,
      { type: "custom", label: "", url: "", enabled: true, sortOrder: links.length },
    ]);

  return (
    <div className="grid gap-2">
      {links.length === 0 && (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          暂未配置联系方式；前台不会显示任何联系方式图标。
        </div>
      )}
      {links.map((link, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-lg border border-border/60 p-3 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1.4fr)_70px_auto_auto] md:items-center"
        >
          <Select
            value={link.type}
            onValueChange={(value) => update(index, { type: value as ContactLink["type"] })}
          >
            <SelectTrigger aria-label="图标类型">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTACT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="显示名称"
            placeholder="显示名称"
            value={link.label}
            onChange={(event) => update(index, { label: event.target.value })}
          />
          <Input
            aria-label="链接地址"
            placeholder={link.type === "email" ? "hi@example.com 或 mailto:…" : "https://…"}
            value={link.url}
            onChange={(event) => update(index, { url: event.target.value })}
            className="font-mono text-xs"
          />
          <Input
            aria-label="排序"
            type="number"
            value={String(link.sortOrder)}
            onChange={(event) => update(index, { sortOrder: Number(event.target.value) || 0 })}
          />
          <div className="flex items-center gap-2">
            <Switch
              aria-label="是否启用"
              checked={link.enabled}
              onCheckedChange={(checked) => update(index, { enabled: checked })}
            />
            <span className="text-xs text-muted-foreground">{link.enabled ? "启用" : "停用"}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="删除该联系方式"
            onClick={() => remove(index)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={add}>
        <Plus className="size-3.5" />
        添加联系方式
      </Button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PreviewLogo({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/25">
        <DeckMark className="size-5" />
      </span>
    );
  }
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 ring-1 ring-inset ring-primary/25">
      <img src={url} alt="" className="size-7 object-contain" onError={() => setFailed(true)} />
    </span>
  );
}

function formatSocialLinks(links: SocialLink[]): string {
  return links.map((link) => `${link.label} | ${link.url}`).join("\n");
}

function parseSocialLinks(value: string): SocialLink[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...urlParts] = line.split("|");
      return { label: label.trim(), url: urlParts.join("|").trim() };
    })
    .filter((link) => link.label && link.url);
}
