import { createFileRoute } from "@tanstack/react-router";
import { requireUnlocked } from "@/lib/session.server";
import {
  getPersistedRegistrarDomain,
  updatePersistedRegistrarDomain,
} from "@/lib/registrar-domain-store.server";

export const Route = createFileRoute("/api/registrar-domains/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          await requireUnlocked();
          const row = await getPersistedRegistrarDomain(params.id);
          if (!row) return Response.json({ error: "域名不存在" }, { status: 404 });
          return Response.json({ row });
        } catch (error) {
          const status = error instanceof Response ? error.status : 500;
          const message = error instanceof Error ? error.message : "读取域名失败";
          return Response.json({ error: message }, { status });
        }
      },
      PATCH: async ({ params, request }) => {
        try {
          await requireUnlocked();
          const body = await request.json().catch(() => ({}));
          const patch: Parameters<typeof updatePersistedRegistrarDomain>[1] = {};
          if ("note" in body && (typeof body.note === "string" || body.note === null)) {
            patch.note = body.note;
          }
          if ("group" in body && (typeof body.group === "string" || body.group === null)) {
            patch.group = body.group;
          }
          if ("tags" in body && (Array.isArray(body.tags) || body.tags === null)) {
            patch.tags = body.tags;
          }
          if (
            "estimatedValue" in body &&
            (typeof body.estimatedValue === "number" || body.estimatedValue === null)
          ) {
            patch.estimatedValue = body.estimatedValue;
          }
          if ("favorite" in body && typeof body.favorite === "boolean") {
            patch.favorite = body.favorite;
          }
          if ("featured" in body && typeof body.featured === "boolean") {
            patch.featured = body.featured;
          }
          if ("category" in body && (typeof body.category === "string" || body.category === null)) {
            patch.category = body.category;
          }
          if (
            "sortOrder" in body &&
            (typeof body.sortOrder === "number" || body.sortOrder === null)
          ) {
            patch.sortOrder = body.sortOrder;
          }
          if (
            "autoRenew" in body &&
            (typeof body.autoRenew === "boolean" || body.autoRenew === null)
          ) {
            patch.autoRenew = body.autoRenew;
          }
          if (
            "domainLock" in body &&
            (typeof body.domainLock === "boolean" || body.domainLock === null)
          ) {
            patch.domainLock = body.domainLock;
          }
          if (
            "privacyProtection" in body &&
            (typeof body.privacyProtection === "boolean" || body.privacyProtection === null)
          ) {
            patch.privacyProtection = body.privacyProtection;
          }
          const row = await updatePersistedRegistrarDomain(params.id, patch);
          if (!row) return Response.json({ error: "域名不存在" }, { status: 404 });
          return Response.json({ row });
        } catch (error) {
          const status = error instanceof Response ? error.status : 500;
          const message = error instanceof Error ? error.message : "保存域名失败";
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
