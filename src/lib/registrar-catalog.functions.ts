import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";
import { recordOperationLog } from "./operation-log.server";
import {
  listRegistrarCatalog,
  softDeleteRegistrarCatalogItem,
  upsertRegistrarCatalogItem,
  type RegistrarCatalogPatch,
} from "./registrar-catalog.server";

export type {
  RegistrarCatalogItem,
  RegistrarCatalogPatch,
  RegistrarCredentialField,
  RegistrarSyncHeader,
  RegistrarSyncMethod,
  RegistrarSyncStrategy,
} from "./registrar-catalog.server";

export const listRegistrars = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    return { rows: await listRegistrarCatalog({ includeDeleted: true }) };
  });

export const saveRegistrar = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((data: RegistrarCatalogPatch) => data)
  .handler(async ({ data }) => {
    const row = await upsertRegistrarCatalogItem(data);
    await recordOperationLog({
      category: "registrar",
      action: row.builtin ? "registrar.update_builtin" : "registrar.save",
      title: row.builtin ? "更新内置注册商配置" : "保存注册商配置",
      detail: row.name,
      entityType: "registrar",
      entityId: row.id,
      severity: "success",
      metadata: {
        id: row.id,
        active: row.active,
        builtin: row.builtin,
        syncStrategy: row.syncStrategy,
        credentialFields: row.credentialFields.length,
      },
    });
    return { row };
  });

export const deleteRegistrar = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const row = await softDeleteRegistrarCatalogItem(data.id);
    await recordOperationLog({
      category: "registrar",
      action: "registrar.delete",
      title: row ? "停用注册商配置" : "停用注册商配置未命中",
      detail: row?.name ?? data.id,
      entityType: "registrar",
      entityId: row?.id ?? data.id,
      severity: row ? "warning" : "info",
      metadata: row
        ? { id: row.id, builtin: row.builtin, active: row.active }
        : { id: data.id, found: false },
    });
    return { row };
  });
