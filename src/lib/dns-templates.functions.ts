import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";
import { recordOperationLog } from "./operation-log.server";
import {
  deleteDnsTemplate as removeTemplate,
  listDnsTemplates as listTemplates,
  saveDnsTemplate as persistTemplate,
  type DnsTemplatePatch,
} from "./dns-templates.server";

export type { DnsTemplate, DnsTemplatePatch, DnsTemplateRecord } from "./dns-templates.server";

export const listDnsTemplates = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => ({ rows: await listTemplates() }));

export const saveDnsTemplate = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((data: DnsTemplatePatch) => data)
  .handler(async ({ data }) => {
    const row = await persistTemplate(data);
    await recordOperationLog({
      category: "dns",
      action: data.id ? "dns_template.update" : "dns_template.create",
      title: data.id ? "更新 DNS 模板" : "新增 DNS 模板",
      detail: row.name,
      entityType: "dns-template",
      entityId: row.id,
      severity: "success",
      metadata: { id: row.id, records: row.records.length },
    });
    return { row };
  });

export const deleteDnsTemplate = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const row = await removeTemplate(data.id);
    await recordOperationLog({
      category: "dns",
      action: "dns_template.delete",
      title: row ? "删除 DNS 模板" : "删除 DNS 模板未命中",
      detail: row?.name ?? data.id,
      entityType: "dns-template",
      entityId: row?.id ?? data.id,
      severity: row ? "warning" : "info",
      metadata: row ? { id: row.id, records: row.records.length } : { id: data.id, found: false },
    });
    return { row };
  });
