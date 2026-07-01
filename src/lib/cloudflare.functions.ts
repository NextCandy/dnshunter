import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    const { cfListAccounts } = await import("./registrars/cloudflare.server");
    return { accounts: await cfListAccounts() };
  });

export const listZones = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    const { cfListZones } = await import("./registrars/cloudflare.server");
    return { zones: await cfListZones() };
  });

type BindResult = {
  domain: string;
  zoneCreated: "ok" | "exists" | "error";
  zoneId?: string;
  nameServers?: string[];
  status?: string;
  nsUpdate: "skipped" | "ok" | "error" | "unsupported";
  activation: "skipped" | "ok" | "error";
  error?: string;
};

export const bindDomains = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator(
    (d: {
      domains: string[];
      accountId: string;
      updateNS: null | "spaceship" | "dynadot" | "cf-registrar";
      cfRegAccountId?: string;
      activationCheck: boolean;
    }) => d,
  )
  .handler(async ({ data }) => {
    const cf = await import("./registrars/cloudflare.server");
    const results: BindResult[] = [];

    for (const domain of data.domains) {
      const r: BindResult = {
        domain,
        zoneCreated: "error",
        nsUpdate: data.updateNS ? "error" : "skipped",
        activation: data.activationCheck ? "error" : "skipped",
      };
      try {
        // Create or find zone
        const createResp = await cf.cfCreateZone(domain, data.accountId);
        if (createResp.success) {
          r.zoneCreated = "ok";
          r.zoneId = createResp.result.id;
          r.nameServers = createResp.result.name_servers;
          r.status = createResp.result.status;
        } else {
          const alreadyExists = (createResp.errors || []).some((e) => e.code === 1061);
          if (alreadyExists) {
            const found = await cf.cfFindZoneByName(domain);
            if (found) {
              r.zoneCreated = "exists";
              r.zoneId = found.id;
              r.nameServers = found.name_servers;
              r.status = found.status;
            } else {
              r.error = cf.cfErr(createResp);
              results.push(r);
              continue;
            }
          } else {
            r.error = cf.cfErr(createResp);
            results.push(r);
            continue;
          }
        }

        // NS update
        if (data.updateNS && r.nameServers?.length) {
          try {
            if (data.updateNS === "spaceship") {
              const { spaceshipSetNS } = await import("./registrars/spaceship.server");
              await spaceshipSetNS(domain, r.nameServers);
            } else if (data.updateNS === "dynadot") {
              const { dynadotSetNS } = await import("./registrars/dynadot.server");
              await dynadotSetNS(domain, r.nameServers);
            } else if (data.updateNS === "cf-registrar") {
              if (!data.cfRegAccountId) throw new Error("需要 CF Registrar accountId");
              const { cfRegSetNS } = await import("./registrars/cf-registrar.server");
              await cfRegSetNS(data.cfRegAccountId, domain, r.nameServers);
            }
            r.nsUpdate = "ok";
          } catch (e: any) {
            r.nsUpdate = "error";
            r.error = (r.error ? r.error + " | " : "") + `NS: ${e.message}`;
          }
        }

        // Activation check
        if (data.activationCheck && r.zoneId) {
          try {
            const a = await cf.cfActivationCheck(r.zoneId);
            r.activation = a.success ? "ok" : "error";
            if (!a.success) r.error = (r.error ? r.error + " | " : "") + cf.cfErr(a);
          } catch (e: any) {
            r.activation = "error";
            r.error = (r.error ? r.error + " | " : "") + `activation: ${e.message}`;
          }
        }
      } catch (e: any) {
        r.error = e.message;
      }
      results.push(r);
      await sleep(120);
    }
    return { results };
  });

// -------- Records --------

type RecordSpec = {
  domain: string; // root zone name
  type: string;
  name: string; // "@" or subdomain (relative or full)
  content: string;
  ttl?: number;
  proxied?: boolean;
};

function fullName(zone: string, name: string): string {
  const n = (name || "@").trim();
  if (n === "@" || n === "" || n === zone) return zone;
  if (n.endsWith(`.${zone}`)) return n;
  return `${n}.${zone}`;
}

async function resolveZoneIds(domains: string[]) {
  const cf = await import("./registrars/cloudflare.server");
  const map = new Map<string, string>();
  for (const d of domains) {
    const z = await cf.cfFindZoneByName(d);
    if (z) map.set(d, z.id);
  }
  return map;
}

export const bulkAddRecords = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { records: RecordSpec[]; upsert: boolean }) => d)
  .handler(async ({ data }) => {
    const cf = await import("./registrars/cloudflare.server");
    const domains = [...new Set(data.records.map((r) => r.domain))];
    const zoneMap = await resolveZoneIds(domains);
    const results: {
      domain: string;
      type: string;
      name: string;
      content: string;
      status: "created" | "updated" | "error" | "no-zone";
      error?: string;
    }[] = [];

    // Preload existing records per zone (for upsert)
    const existingByZone = new Map<string, any[]>();
    if (data.upsert) {
      for (const [, zid] of zoneMap) {
        existingByZone.set(zid, await cf.cfListDNS(zid));
      }
    }

    for (const rec of data.records) {
      const zid = zoneMap.get(rec.domain);
      if (!zid) {
        results.push({ ...rec, status: "no-zone" });
        continue;
      }
      const payload: any = {
        type: rec.type,
        name: fullName(rec.domain, rec.name),
        content: rec.content,
        ttl: rec.ttl ?? 1,
      };
      if (["A", "AAAA", "CNAME"].includes(rec.type)) payload.proxied = Boolean(rec.proxied);

      try {
        if (data.upsert) {
          const existing = (existingByZone.get(zid) || []).find(
            (e) => e.type === payload.type && e.name === payload.name,
          );
          if (existing) {
            const r = await cf.cfUpdateDNS(zid, existing.id, payload);
            results.push({
              ...rec,
              status: r.success ? "updated" : "error",
              error: r.success ? undefined : cf.cfErr(r),
            });
            continue;
          }
        }
        const r = await cf.cfCreateDNS(zid, payload);
        results.push({
          ...rec,
          status: r.success ? "created" : "error",
          error: r.success ? undefined : cf.cfErr(r),
        });
      } catch (e: any) {
        results.push({ ...rec, status: "error", error: e.message });
      }
      await sleep(60);
    }
    return { results };
  });

export type DeleteFilter = {
  type?: string; // exact
  nameContains?: string;
  contentContains?: string;
};

export const previewDeleteRecords = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { domains: string[]; filter: DeleteFilter }) => d)
  .handler(async ({ data }) => {
    const cf = await import("./registrars/cloudflare.server");
    const zoneMap = await resolveZoneIds(data.domains);
    const matches: {
      domain: string;
      zoneId: string;
      id: string;
      type: string;
      name: string;
      content: string;
    }[] = [];
    for (const [domain, zid] of zoneMap) {
      const recs = await cf.cfListDNS(zid);
      for (const r of recs) {
        if (data.filter.type && r.type !== data.filter.type) continue;
        if (data.filter.nameContains && !String(r.name).includes(data.filter.nameContains))
          continue;
        if (
          data.filter.contentContains &&
          !String(r.content).includes(data.filter.contentContains)
        )
          continue;
        matches.push({
          domain,
          zoneId: zid,
          id: r.id,
          type: r.type,
          name: r.name,
          content: r.content,
        });
      }
    }
    return { matches };
  });

export const executeDeleteRecords = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { items: { zoneId: string; id: string; domain: string; name: string; type: string }[] }) => d)
  .handler(async ({ data }) => {
    const cf = await import("./registrars/cloudflare.server");
    const results: { domain: string; name: string; type: string; status: "ok" | "error"; error?: string }[] = [];
    for (const it of data.items) {
      try {
        const r = await cf.cfDeleteDNS(it.zoneId, it.id);
        results.push({
          domain: it.domain,
          name: it.name,
          type: it.type,
          status: r.success ? "ok" : "error",
          error: r.success ? undefined : cf.cfErr(r as any),
        });
      } catch (e: any) {
        results.push({ domain: it.domain, name: it.name, type: it.type, status: "error", error: e.message });
      }
      await sleep(60);
    }
    return { results };
  });
