import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { checkGate, lockSite } from "@/lib/gate.functions";
import { Button } from "@/components/ui/button";
import { Globe, Link2, ListTree, Settings, LogOut, LayoutDashboard, DatabaseBackup } from "lucide-react";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const r = await checkGate();
    if (!r.unlocked) throw redirect({ to: "/unlock" });
  },
  component: AppLayout,
});

function AppLayout() {
  const router = useRouter();
  const lock = useServerFn(lockSite);
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-56 border-r border-border p-4 flex flex-col gap-1">
        <div className="px-2 py-3 mb-2">
          <div className="font-bold text-lg">DomainOps</div>
          <div className="text-xs text-muted-foreground">批量域名管理</div>
        </div>
        <NavItem to="/" icon={<LayoutDashboard className="size-4" />}>
          仪表盘
        </NavItem>
        <NavItem to="/domains" icon={<Globe className="size-4" />}>
          域名列表
        </NavItem>
        <NavItem to="/bind" icon={<Link2 className="size-4" />}>
          批量绑定
        </NavItem>
        <NavItem to="/records" icon={<ListTree className="size-4" />}>
          解析记录
        </NavItem>
        <NavItem to="/backup" icon={<DatabaseBackup className="size-4" />}>
          备份与恢复
        </NavItem>
        <NavItem to="/settings" icon={<Settings className="size-4" />}>
          设置
        </NavItem>
        <div className="mt-auto">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => {
              await lock();
              router.navigate({ to: "/unlock" });
            }}
          >
            <LogOut className="size-4 mr-2" /> 锁定
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent"
      activeOptions={{ exact: to === "/" }}
      activeProps={{ className: "flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-accent font-medium" }}
    >
      {icon}
      {children}
    </Link>
  );
}
