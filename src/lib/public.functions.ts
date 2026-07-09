import { createServerFn } from "@tanstack/react-start";
import { normalizeDomainLoose } from "./domain-utils";

export type PublicDomainRow = {
  domain: string;
  registrar: string;
  nsStatus: "cloudflare" | "other" | "unknown";
  lastSyncedAt: string;
  syncStatus: "ok" | "missing" | "warning";
  nsProvider?: string;
  registeredAt?: string;
  expiresAt?: string;
  source: "registrar" | "manual";
  /** 精品域名标记，旧数据默认 false */
  featured: boolean;
  /** 其他分类，旧数据默认空字符串 */
  category: string;
  /** 排序权重，越小越靠前；无权重时前台按字母序 */
  sortOrder?: number;
};

// 前台资产台账：合并「注册商 API 域名」与「手动域名」。
// 必须先按标准化域名去重（大小写 / www / 协议路径差异都视为同一域名），
// 再交给前台做筛选、排序、分页；精品/分类等展示字段跨来源合并（任一精品即精品）。
export const listPublicDomainAssets = createServerFn({ method: "GET" }).handler(async () => {
  // 动态 import，避免 node:fs 泄漏进客户端 bundle（与 gate.functions.ts 同风格）
  const [{ listPersistedRegistrarDomains }, { listManualDomains }] = await Promise.all([
    import("./registrar-domain-store.server"),
    import("./manual-domain-store.server"),
  ]);
  const [registrarRows, manualRows] = await Promise.all([
    listPersistedRegistrarDomains(),
    listManualDomains(),
  ]);

  const byDomain = new Map<string, PublicDomainRow>();

  const mergeMeta = (
    current: PublicDomainRow,
    incoming: { featured?: boolean; category?: string; sortOrder?: number },
  ) => {
    current.featured = current.featured || Boolean(incoming.featured);
    if (!current.category && incoming.category) current.category = incoming.category;
    if (incoming.sortOrder !== undefined) {
      current.sortOrder =
        current.sortOrder !== undefined
          ? Math.min(current.sortOrder, incoming.sortOrder)
          : incoming.sortOrder;
    }
  };

  for (const row of registrarRows) {
    const key = normalizeDomainLoose(row.domain);
    if (!key) continue;
    const existing = byDomain.get(key);
    if (existing) {
      // 同一域名跨注册商重复：保留信息更新的一条，精品/分类/权重合并
      mergeMeta(existing, row);
      if ((row.lastSyncedAt || "") > (existing.lastSyncedAt || "")) {
        existing.registrar = row.registrar;
        existing.nsStatus = row.nsStatus;
        existing.lastSyncedAt = row.lastSyncedAt;
        existing.syncStatus = row.syncStatus;
        existing.nsProvider = row.nsProvider ?? existing.nsProvider;
        existing.registeredAt = row.registeredAt ?? existing.registeredAt;
        existing.expiresAt = row.expiresAt ?? existing.expiresAt;
      }
      continue;
    }
    byDomain.set(key, {
      domain: key,
      registrar: row.registrar,
      nsStatus: row.nsStatus,
      lastSyncedAt: row.lastSyncedAt,
      syncStatus: row.syncStatus,
      nsProvider: row.nsProvider,
      registeredAt: row.registeredAt,
      expiresAt: row.expiresAt,
      source: "registrar",
      featured: Boolean(row.featured),
      category: row.category ?? "",
      sortOrder: row.sortOrder,
    });
  }

  for (const row of manualRows) {
    const key = normalizeDomainLoose(row.domain);
    if (!key) continue;
    const existing = byDomain.get(key);
    if (existing) {
      // 注册商记录优先，但精品/分类/权重从手动记录合并，避免用户设置丢失
      mergeMeta(existing, row);
      continue;
    }
    byDomain.set(key, {
      domain: key,
      registrar: row.registrar ?? "manual",
      nsStatus: row.nsStatus,
      lastSyncedAt: row.updatedAt,
      syncStatus: "ok",
      nsProvider: row.nsProvider,
      registeredAt: row.registeredAt,
      expiresAt: row.expiresAt,
      source: "manual",
      featured: Boolean(row.featured),
      category: row.category ?? "",
      sortOrder: row.sortOrder,
    });
  }

  return { rows: [...byDomain.values()] };
});
