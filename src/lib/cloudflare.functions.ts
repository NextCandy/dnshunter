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

// 仪表盘用：Token 配置/有效性 + Zone 概览，一次探测。
export const getCfHealth = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    const cf = await import("./registrars/cloudflare.server");
    const tokenStatus = await cf.cfVerifyToken();
    if (tokenStatus !== "active") {
      return {
        tokenStatus,
        zoneCount: null as number | null,
        activeZones: null as number | null,
        error: null as string | null,
      };
    }
    try {
      const zones = await cf.cfListZones();
      return {
        tokenStatus,
        zoneCount: zones.length,
        activeZones: zones.filter((z) => z.status === "active").length,
        error: null as string | null,
      };
    } catch (e: any) {
      // Token 有效但缺 Zone:Read 等权限
      return { tokenStatus, zoneCount: null, activeZones: null, error: String(e?.message || e) };
    }
  });

export const listZones = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    const { cfListZones } = await import("./registrars/cloudflare.server");
    const { resolveDomainsNameservers } = await import("./nameservers.server");
    const zones = await cfListZones();
    const nsMap = await resolveDomainsNameservers(zones.map((z) => z.name));
    return {
      zones: zones.map((zone) => {
        const ns = nsMap.get(zone.name);
        return {
          ...zone,
          current_name_servers: ns?.nameservers ?? [],
          ns_status: ns?.nsStatus ?? "unknown",
          ns_provider: ns?.nsProvider,
          ns_error: ns?.nsError,
        };
      }),
    };
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
      updateNS: null | "spaceship" | "dynadot" | "porkbun" | "cf-registrar";
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
            } else if (data.updateNS === "porkbun") {
              const { porkbunSetNS } = await import("./registrars/porkbun.server");
              await porkbunSetNS(domain, r.nameServers);
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
  priority?: number;
};

function fullName(zone: string, name: string): string {
  const n = (name || "@").trim();
  if (n === "@" || n === "" || n === zone) return zone;
  if (n.endsWith(`.${zone}`)) return n;
  return `${n}.${zone}`;
}

function relativeName(zone: string, name: string): string {
  if (!name || name === zone) return "@";
  if (name.endsWith(`.${zone}`)) return name.slice(0, -(zone.length + 1));
  return name;
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

// 结构化错误分类，前端据此给出不同的引导（去设置 / 去绑定 / 改 Token 权限）。
export type DnsListError = {
  ok: false;
  kind: "no-token" | "token-invalid" | "forbidden" | "no-zone" | "api";
  message: string;
};

async function classifyCfError(message: string): Promise<DnsListError> {
  const cf = await import("./registrars/cloudflare.server");
  // 认证类错误码：进一步区分 Token 无效还是权限不足
  if (/\b(10000|9109|6003|9103|9207)\b/.test(message)) {
    const verify = await cf.cfVerifyToken();
    if (verify === "invalid" || verify === "unconfigured") {
      return {
        ok: false,
        kind: "token-invalid",
        message: "Cloudflare Token 无效（verify 未通过）：请到设置页重新生成并保存 Token",
      };
    }
    return {
      ok: false,
      kind: "forbidden",
      message:
        "Cloudflare Token 有效但权限不足：DNS 读取需要 Zone:DNS:Read，新增/修改/删除需要 Zone:DNS:Edit（Zone 管理另需 Zone:Zone:Read/Edit）",
    };
  }
  return { ok: false, kind: "api", message };
}

export const listDnsRecords = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { domain: string }) => d)
  .handler(async ({ data }) => {
    const domain = data.domain.trim().toLowerCase();
    if (!domain) {
      return { ok: false, kind: "api", message: "需要域名" } satisfies DnsListError;
    }
    const { getSecret } = await import("./secrets.server");
    if (!(await getSecret("CLOUDFLARE_API_TOKEN"))) {
      return {
        ok: false,
        kind: "no-token",
        message: "Cloudflare API Token 未配置，请先到设置页保存 Token",
      } satisfies DnsListError;
    }
    const cf = await import("./registrars/cloudflare.server");
    let zone: any;
    try {
      zone = await cf.cfFindZoneByName(domain);
    } catch (e: any) {
      return classifyCfError(String(e?.message || e));
    }
    if (!zone) {
      return {
        ok: false,
        kind: "no-zone",
        message: `${domain} 尚未接入 Cloudflare（Zone 不存在）`,
      } satisfies DnsListError;
    }
    try {
      const records = await cf.cfListDNS(zone.id);
      return {
        ok: true as const,
        zone: {
          id: zone.id,
          name: zone.name,
          status: zone.status,
          name_servers: zone.name_servers,
        },
        records: records.map((r: any) => ({
          id: r.id,
          zoneId: zone.id,
          domain,
          type: r.type,
          name: relativeName(domain, r.name),
          content: r.content,
          ttl: r.ttl,
          proxied: r.proxied,
          priority: r.priority,
          modified_on: r.modified_on,
        })),
      };
    } catch (e: any) {
      return classifyCfError(String(e?.message || e));
    }
  });

export const saveDnsRecord = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator(
    (d: {
      domain: string;
      id?: string;
      type: string;
      name: string;
      content: string;
      ttl?: number;
      proxied?: boolean;
      priority?: number;
    }) => d,
  )
  .handler(async ({ data }) => {
    const domain = data.domain.trim().toLowerCase();
    if (!domain) throw new Error("需要域名");
    if (!data.type || !data.content?.trim()) throw new Error("记录类型和内容不能为空");
    const cf = await import("./registrars/cloudflare.server");
    const zone = await cf.cfFindZoneByName(domain);
    if (!zone) throw new Error(`Cloudflare Zone 不存在：${domain}`);

    const payload: any = {
      type: data.type,
      name: fullName(domain, data.name),
      content: data.content.trim(),
      ttl: data.ttl ?? 1,
    };
    if (["A", "AAAA", "CNAME"].includes(data.type)) payload.proxied = Boolean(data.proxied);
    if (data.priority !== undefined) payload.priority = data.priority;

    const r = data.id
      ? await cf.cfUpdateDNS(zone.id, data.id, payload)
      : await cf.cfCreateDNS(zone.id, payload);
    if (!r.success) throw new Error(cf.cfErr(r));
    return { ok: true as const, record: r.result };
  });

export const deleteDnsRecord = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { domain: string; id: string; zoneId?: string }) => d)
  .handler(async ({ data }) => {
    if (!data.id) throw new Error("缺少 DNS 记录 ID");
    const cf = await import("./registrars/cloudflare.server");
    let zoneId = data.zoneId;
    if (!zoneId) {
      const domain = data.domain.trim().toLowerCase();
      if (!domain) throw new Error("需要域名");
      const zone = await cf.cfFindZoneByName(domain);
      if (!zone) throw new Error(`Cloudflare Zone 不存在：${domain}`);
      zoneId = zone.id as string;
    }

    const r = await cf.cfDeleteDNS(zoneId, data.id);
    if (!r.success) throw new Error(cf.cfErr(r));
    return { ok: true as const };
  });

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
      status: "created" | "updated" | "skipped" | "error" | "no-zone";
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
      if (rec.priority !== undefined) payload.priority = rec.priority;

      try {
        if (data.upsert) {
          const existing = (existingByZone.get(zid) || []).find(
            (e) => e.type === payload.type && e.name === payload.name,
          );
          if (existing) {
            const same =
              existing.content === payload.content &&
              existing.ttl === payload.ttl &&
              (payload.proxied === undefined || Boolean(existing.proxied) === payload.proxied) &&
              (payload.priority === undefined || existing.priority === payload.priority);
            if (same) {
              results.push({ ...rec, status: "skipped" });
              continue;
            }
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
        if (data.filter.contentContains && !String(r.content).includes(data.filter.contentContains))
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
  .inputValidator(
    (d: { items: { zoneId: string; id: string; domain: string; name: string; type: string }[] }) =>
      d,
  )
  .handler(async ({ data }) => {
    const cf = await import("./registrars/cloudflare.server");
    const results: {
      domain: string;
      name: string;
      type: string;
      status: "ok" | "error";
      error?: string;
    }[] = [];
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
        results.push({
          domain: it.domain,
          name: it.name,
          type: it.type,
          status: "error",
          error: e.message,
        });
      }
      await sleep(60);
    }
    return { results };
  });
