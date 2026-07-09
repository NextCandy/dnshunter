import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";
import { recordOperationLog } from "./operation-log.server";
import {
  listManualDomains as listManual,
  addManualDomains as addManual,
  updateManualDomain as updateManual,
  updateManualDomains as updateManualBatch,
  deleteManualDomain as deleteManual,
  deleteManualDomains as deleteManualBatch,
  listManualBackups as listBackups,
  restoreManualBackup as restoreBackup,
  type ManualDomainPatch,
} from "./manual-domain-store.server";

export type { ManualDomain, ManualDomainPatch } from "./manual-domain-store.server";

export const listManualDomains = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => ({ rows: await listManual() }));

export const addManualDomains = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .validator((d: { domains: string[] }) => d)
  .handler(async ({ data }) => {
    // 跨库查重：已由注册商同步管理的域名不再重复录入手动库，
    // 避免同一域名在后台出现两条管理记录。
    const [{ listPersistedRegistrarDomains }, { normalizeDomainLoose }] = await Promise.all([
      import("./registrar-domain-store.server"),
      import("./domain-utils"),
    ]);
    const registrarDomains = new Set(
      (await listPersistedRegistrarDomains()).map((row) => normalizeDomainLoose(row.domain)),
    );
    const input = [...new Set(data.domains.map((d) => normalizeDomainLoose(d)).filter(Boolean))];
    const toAdd = input.filter((d) => !registrarDomains.has(d));
    const registrarSkipped = input.length - toAdd.length;
    const result = await addManual(toAdd);
    result.skipped += registrarSkipped;
    await recordOperationLog({
      category: "domains",
      action: "manual_domains.add",
      title: "添加手动域名",
      detail: `新增 ${result.added} 个，跳过 ${result.skipped} 个。`,
      entityType: "manual-domain",
      severity: result.added > 0 ? "success" : "info",
      metadata: {
        added: result.added,
        skipped: result.skipped,
        sample: data.domains.slice(0, 8),
      },
    });
    return result;
  });

export const updateManualDomain = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .validator((d: { id: string; patch: ManualDomainPatch }) => d)
  .handler(async ({ data }) => {
    const row = await updateManual(data.id, data.patch);
    await recordOperationLog({
      category: "domains",
      action: "manual_domain.update",
      title: row ? "更新手动域名" : "更新手动域名未命中",
      detail: row?.domain ?? data.id,
      entityType: "manual-domain",
      entityId: data.id,
      severity: row ? "success" : "warning",
      metadata: { fields: Object.keys(data.patch) },
    });
    return row;
  });

export const updateManualDomains = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .validator((d: { ids: string[]; patch: ManualDomainPatch }) => d)
  .handler(async ({ data }) => {
    const result = await updateManualBatch(data.ids, data.patch);
    await recordOperationLog({
      category: "domains",
      action: "manual_domains.batch_update",
      title: "批量更新手动域名",
      detail: `更新 ${result.updated} 个域名。`,
      entityType: "manual-domain",
      severity: result.updated > 0 ? "success" : "info",
      metadata: {
        requested: data.ids.length,
        updated: result.updated,
        fields: Object.keys(data.patch),
      },
    });
    return result;
  });

export const deleteManualDomain = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const ok = await deleteManual(data.id);
    await recordOperationLog({
      category: "domains",
      action: "manual_domain.delete",
      title: ok ? "删除手动域名" : "删除手动域名未命中",
      detail: data.id,
      entityType: "manual-domain",
      entityId: data.id,
      severity: ok ? "warning" : "info",
    });
    return { ok };
  });

export const deleteManualDomains = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .validator((d: { ids: string[] }) => d)
  .handler(async ({ data }) => {
    const result = await deleteManualBatch(data.ids);
    await recordOperationLog({
      category: "domains",
      action: "manual_domains.batch_delete",
      title: "批量删除手动域名",
      detail: `删除 ${result.deleted} 个域名。`,
      entityType: "manual-domain",
      severity: result.deleted > 0 ? "warning" : "info",
      metadata: { requested: data.ids.length, deleted: result.deleted },
    });
    return result;
  });

export const listManualBackups = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => ({ rows: await listBackups() }));

export const restoreManualBackup = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .validator((d: { file: string }) => d)
  .handler(async ({ data }) => {
    const result = await restoreBackup(data.file);
    await recordOperationLog({
      category: "backup",
      action: "manual_domains.restore_backup",
      title: "恢复手动域名备份",
      detail: `从备份恢复 ${result.count} 个域名。`,
      entityType: "manual-domain-backup",
      entityId: data.file,
      severity: "warning",
      metadata: { file: data.file, count: result.count },
    });
    return result;
  });
