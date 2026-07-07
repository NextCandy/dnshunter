import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";
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
    return { row: await upsertRegistrarCatalogItem(data) };
  });

export const deleteRegistrar = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    return { row: await softDeleteRegistrarCatalogItem(data.id) };
  });
