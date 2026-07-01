import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { unlockSite } from "@/lib/gate.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Lock } from "lucide-react";

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await unlock({ data: { email, password: pw } });
      if (r.ok) {
        await router.navigate({ to: "/" });
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="size-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">dshunter</h1>
          <p className="text-sm text-muted-foreground">请输入后台账号和密码</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="email"
            value={email}
            autoComplete="username"
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
            placeholder="账号邮箱"
          />
          <Input
            type="password"
            value={pw}
            autoComplete="current-password"
            onChange={(e) => setPw(e.target.value)}
            placeholder="密码"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button className="w-full" disabled={loading || !email || !pw}>
            {loading ? "验证中..." : "登录"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
