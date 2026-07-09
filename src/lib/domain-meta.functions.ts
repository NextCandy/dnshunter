import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";

export type DomainDisplayMetaPatch = {
  featured?: boolean;
  category?: string | null;
  sortOrder?: number | null;
};

// 按标准化域名统一设置展示 meta（精品 / 其他分类 / 排序权重）。
// 同一域名在注册商库和手动库的所有记录一起更新，保证后台编辑的是「合并后的唯一域名」。
export const setDomainDisplayMeta = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .validator((d: { domain: string; meta: DomainDisplayMetaPatch }) => d)
  .handler(async ({ data }) => {
    const [{ setRegistrarDomainMetaByDomain }, { setManualDomainMetaByDomain }] = await Promise.all(
      [import("./registrar-domain-store.server"), import("./manual-domain-store.server")],
    );
    const [registrarUpdated, manualUpdated] = await Promise.all([
      setRegistrarDomainMetaByDomain(data.domain, data.meta),
      setManualDomainMetaByDomain(data.domain, data.meta),
    ]);
    const updated = registrarUpdated + manualUpdated;
    const { recordOperationLog } = await import("./operation-log.server");
    await recordOperationLog({
      category: "domains",
      action: "domain_meta.update",
      title: updated > 0 ? "更新域名展示设置" : "更新域名展示设置未命中",
      detail: `${data.domain}：${[
        data.meta.featured !== undefined ? `精品=${data.meta.featured ? "是" : "否"}` : null,
        data.meta.category !== undefined ? `分类=${data.meta.category ?? "清空"}` : null,
        data.meta.sortOrder !== undefined ? `权重=${data.meta.sortOrder ?? "清空"}` : null,
      ]
        .filter(Boolean)
        .join("，")}`,
      entityType: "domain-meta",
      entityId: data.domain,
      severity: updated > 0 ? "success" : "warning",
      metadata: { registrarUpdated, manualUpdated },
    });
    return { updated, registrarUpdated, manualUpdated };
  });
