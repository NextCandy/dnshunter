import { createFileRoute } from "@tanstack/react-router";
import { requireUnlocked } from "@/lib/session.server";
import { listRegistrarCatalog } from "@/lib/registrar-catalog.server";
import { BUILTIN_REGISTRAR_IDS, syncRegistrarDomains } from "@/lib/registrar-sync.server";

export const Route = createFileRoute("/api/registrars/$id/sync-domains")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          await requireUnlocked();
          const registrar = params.id;
          const custom = (await listRegistrarCatalog()).find((row) => row.id === registrar);
          const valid =
            BUILTIN_REGISTRAR_IDS.includes(registrar as (typeof BUILTIN_REGISTRAR_IDS)[number]) ||
            Boolean(custom?.active && custom.supportsSync);
          if (!valid) {
            return Response.json({ error: "注册商无效或尚未配置同步端点" }, { status: 400 });
          }
          const body = await request.json().catch(() => ({}));
          const accountId = typeof body.accountId === "string" ? body.accountId : undefined;
          const result = await syncRegistrarDomains({ registrar, accountId });
          return Response.json(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : "同步失败";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
