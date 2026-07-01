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
      { title: "解锁 · DomainOps" },
      { name: "description", content: "输入访问密码以进入 DomainOps 域名管理控制台。" },
    ],
  }),
  component: UnlockPage,
});

function UnlockPage() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const r = await unlock({ data: { password: pw } });
      if (r.ok) {
        await router.navigate({ to: "/" });
      } else {
        setErr("密码错误");
      }
    } catch (e: any) {
      setErr(e.message || "请求失败");
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
          <h1 className="text-xl font-semibold">DomainOps</h1>
          <p className="text-sm text-muted-foreground">请输入访问密码</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="password"
            value={pw}
            autoFocus
            onChange={(e) => setPw(e.target.value)}
            placeholder="密码"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button className="w-full" disabled={loading || !pw}>
            {loading ? "验证中..." : "进入"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
