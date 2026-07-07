import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { motion } from "motion/react";
import { unlockSite } from "@/lib/gate.functions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { DeckMark } from "@/components/deck-mark";
import { Checkbox } from "@/components/ui/checkbox";
import { AtSign, KeyRound, Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "登录 · dshunter" },
      { name: "description", content: "登录 dshunter 域名管理控制台。" },
    ],
  }),
  component: UnlockPage,
});

function UnlockPage() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [remember, setRemember] = useState(true);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await unlock({ data: { email, password: pw } });
      if (r.ok) {
        await router.navigate({ to: "/dashboard" });
      } else {
        setErr("账号或密码错误");
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-60" />

      <div className="relative grid w-full max-w-5xl animate-in grid-cols-1 overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-2xl shadow-black/20 backdrop-blur-xl fade-in slide-in-from-bottom-2 duration-300 md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[520px] flex-col justify-between overflow-hidden border-r border-border/60 bg-sidebar p-8 md:flex">
          <div className="absolute inset-0 bg-blueprint opacity-50" />
          <div className="relative">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/25">
                <DeckMark className="size-6" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight">DS Hunter</h1>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Domain Command Deck
                </p>
              </div>
            </div>
            <div className="max-w-md">
              <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs text-success">
                <ShieldCheck className="size-3.5" />
                私有资产控制台
              </div>
              <p className="mt-6 text-3xl font-bold leading-tight tracking-tight">
                管理域名、注册商与 Cloudflare 状态，从这里进入。
              </p>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                登录后可拉取注册商域名、合并筛选、批量绑定 Zone，并维护公开资产台账。
              </p>
            </div>
          </div>
          <div className="relative grid grid-cols-3 gap-3 text-xs">
            {["493 域名", "42 Zones", "3 注册商"].map((item) => (
              <div key={item} className="rounded-lg border border-border/60 bg-card/60 p-3">
                <div className="font-mono text-sm font-semibold">{item}</div>
                <div className="text-muted-foreground">当前资产</div>
              </div>
            ))}
          </div>
        </section>

        <Card className="relative overflow-hidden rounded-none border-0 bg-card/90 p-8 md:p-10">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-primary/70 to-transparent" />

          <div className="mb-6 flex flex-col items-center gap-3 text-center md:hidden">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary shadow-lg shadow-primary/25 ring-1 ring-inset ring-primary/25">
              <DeckMark className="size-6" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">DS Hunter</h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Command Deck · 登录
              </p>
            </div>
          </div>

          <div className="mb-6 hidden md:block">
            <h2 className="font-display text-xl font-bold tracking-tight">登录控制台</h2>
            <p className="mt-1 text-sm text-muted-foreground">使用管理员邮箱继续。</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <label className="relative block">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                autoComplete="username"
                autoFocus
                onChange={(e) => setEmail(e.target.value)}
                placeholder="账号邮箱"
                className="pl-9 font-mono"
              />
            </label>
            <label className="relative block">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="password"
                value={pw}
                autoComplete="current-password"
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                placeholder="密码"
                className="pl-9 font-mono"
              />
            </label>
            <div className="flex items-center justify-between gap-3 text-xs">
              <label className="flex items-center gap-2 text-muted-foreground">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(checked) => setRemember(checked === true)}
                />
                记住本机
              </label>
              <Link to="/site-settings" className="text-primary hover:underline">
                忘记密码？
              </Link>
            </div>
            {capsLock && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <span className="signal signal-warning" />
                大写锁定已开启
              </p>
            )}
            {err && (
              <motion.div
                initial={{ x: 0 }}
                animate={{ x: [0, -6, 6, -4, 4, 0] }}
                transition={{ duration: 0.28 }}
              >
                <Alert variant="destructive" className="border-destructive/70 bg-destructive/10">
                  <AlertDescription>账号或密码错误</AlertDescription>
                </Alert>
              </motion.div>
            )}
            <Button className="w-full font-medium" disabled={loading || !email || !pw}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  登录中…
                </>
              ) : (
                "进入指挥台"
              )}
            </Button>
          </form>
        </Card>

        <div className="absolute bottom-4 right-8 text-center">
          <Link
            to="/"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ← 返回资产台账
          </Link>
        </div>
      </div>
    </div>
  );
}
