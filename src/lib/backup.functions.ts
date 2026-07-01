import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";

export type BackupRecord = {
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
};

export type BackupZone = {
  domain: string;
  exportedAt: string;
  records: BackupRecord[];
};

function normRec(r: any): BackupRecord {
  return {
    type: String(r.type),
    name: String(r.name),
    content: String(r.content),
    ttl: Number(r.ttl ?? 1),
    proxied: Boolean(r.proxied),
    priority: r.priority == null ? undefined : Number(r.priority),
  };
}

export const exportZoneRecords = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { domains: string[] }) => d)
  .handler(async ({ data }) => {
    const cf = await import("./registrars/cloudflare.server");
    const zones: BackupZone[] = [];
    const now = new Date().toISOString();
    for (const domain of data.domains) {
      const z = await cf.cfFindZoneByName(domain);
      if (!z) {
        zones.push({ domain, exportedAt: now, records: [] });
        continue;
      }
      const recs = await cf.cfListDNS(z.id);
      zones.push({ domain, exportedAt: now, records: recs.map(normRec) });
    }
    return { zones };
  });

function keyOf(r: BackupRecord) {
  return `${r.type}|${r.name}|${r.content}`;
}

export const diffAgainstLive = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { backup: BackupZone[] }) => d)
  .handler(async ({ data }) => {
    const cf = await import("./registrars/cloudflare.server");
    const results: {
      domain: string;
      onlyInBackup: BackupRecord[];
      onlyInLive: BackupRecord[];
      changed: { key: string; backup: BackupRecord; live: BackupRecord }[];
      missingZone: boolean;
    }[] = [];
    for (const b of data.backup) {
      const z = await cf.cfFindZoneByName(b.domain);
      if (!z) {
        results.push({
          domain: b.domain,
          onlyInBackup: b.records,
          onlyInLive: [],
          changed: [],
          missingZone: true,
        });
        continue;
      }
      const live = (await cf.cfListDNS(z.id)).map(normRec);
      const bMap = new Map(b.records.map((r) => [keyOf(r), r]));
      const lMap = new Map(live.map((r) => [keyOf(r), r]));
      const onlyInBackup = b.records.filter((r) => !lMap.has(keyOf(r)));
      const onlyInLive = live.filter((r) => !bMap.has(keyOf(r)));
      const changed: { key: string; backup: BackupRecord; live: BackupRecord }[] = [];
      for (const [k, br] of bMap) {
        const lr = lMap.get(k);
        if (!lr) continue;
        if (br.ttl !== lr.ttl || br.proxied !== lr.proxied || (br.priority ?? -1) !== (lr.priority ?? -1)) {
          changed.push({ key: k, backup: br, live: lr });
        }
      }
      results.push({ domain: b.domain, onlyInBackup, onlyInLive, changed, missingZone: false });
    }
    return { results };
  });

export const restoreFromBackup = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator(
    (d: {
      backup: BackupZone[];
      strategy: "add-missing" | "overwrite" | "replace-all";
    }) => d,
  )
  .handler(async ({ data }) => {
    const cf = await import("./registrars/cloudflare.server");
    const out: {
      domain: string;
      created: number;
      updated: number;
      deleted: number;
      skipped: number;
      errors: string[];
    }[] = [];

    for (const b of data.backup) {
      const row = { domain: b.domain, created: 0, updated: 0, deleted: 0, skipped: 0, errors: [] as string[] };
      const z = await cf.cfFindZoneByName(b.domain);
      if (!z) {
        row.errors.push("zone not found in Cloudflare");
        out.push(row);
        continue;
      }
      const live = await cf.cfListDNS(z.id);
      const liveByKey = new Map(live.map((r: any) => [keyOf(normRec(r)), r]));
      const backupKeys = new Set(b.records.map(keyOf));

      if (data.strategy === "replace-all") {
        for (const lr of live) {
          if (!backupKeys.has(keyOf(normRec(lr)))) {
            const r = await cf.cfDeleteDNS(z.id, lr.id);
            if (r.success) row.deleted++;
            else row.errors.push(`delete ${lr.name}: ${cf.cfErr(r as any)}`);
          }
        }
      }

      for (const rec of b.records) {
        const payload: any = {
          type: rec.type,
          name: rec.name,
          content: rec.content,
          ttl: rec.ttl,
        };
        if (["A", "AAAA", "CNAME"].includes(rec.type)) payload.proxied = rec.proxied;
        if (rec.priority !== undefined) payload.priority = rec.priority;

        const existing = liveByKey.get(keyOf(rec));
        try {
          if (existing) {
            if (data.strategy === "add-missing") {
              row.skipped++;
              continue;
            }
            const r = await cf.cfUpdateDNS(z.id, existing.id, payload);
            if (r.success) row.updated++;
            else row.errors.push(`update ${rec.name}: ${cf.cfErr(r)}`);
          } else {
            const r = await cf.cfCreateDNS(z.id, payload);
            if (r.success) row.created++;
            else row.errors.push(`create ${rec.name}: ${cf.cfErr(r)}`);
          }
        } catch (e: any) {
          row.errors.push(`${rec.name}: ${e.message}`);
        }
      }
      out.push(row);
    }
    return { results: out };
  });
