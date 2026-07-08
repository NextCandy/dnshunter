import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import { DeckMark } from "@/components/deck-mark";

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-50" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative max-w-md text-center">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/25">
          <DeckMark className="size-6" />
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Error 404
        </div>
        <h1 className="mt-2 font-display text-6xl font-bold tracking-tight text-foreground">404</h1>
        <h2 className="mt-3 text-lg font-semibold text-foreground">页面不存在</h2>
        <p className="mt-2 text-sm text-muted-foreground">你访问的页面不存在，或已经被移动。</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-blueprint opacity-50" />
      <div className="relative max-w-md text-center">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-destructive/12 text-destructive ring-1 ring-inset ring-destructive/25">
          <DeckMark className="size-6" />
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          System Error
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
          页面载入失败
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          服务器返回了异常。你可以重试，或返回首页。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            重试
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            返回首页
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "dshunter · 批量域名管理" },
      {
        name: "description",
        content: "批量将域名接入 Cloudflare，通过注册商 API 或粘贴导入，一键管理 DNS 解析记录。",
      },
      { property: "og:title", content: "dshunter · 批量域名管理" },
      {
        property: "og:description",
        content: "批量将域名接入 Cloudflare，通过注册商 API 或粘贴导入，一键管理 DNS 解析记录。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "dshunter · 批量域名管理" },
      {
        name: "twitter:description",
        content: "批量将域名接入 Cloudflare，通过注册商 API 或粘贴导入，一键管理 DNS 解析记录。",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
