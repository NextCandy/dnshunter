// Cloudflare API helpers (server-only)
const CF_BASE = "https://api.cloudflare.com/client/v4";

export type CFResp<T = any> = {
  success: boolean;
  errors?: { code: number; message: string }[];
  messages?: any[];
  result: T;
  result_info?: any;
};

export function cfToken(): string {
  const t = process.env.CLOUDFLARE_API_TOKEN;
  if (!t) throw new Error("CLOUDFLARE_API_TOKEN 未配置");
  return t;
}

export async function cf<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<CFResp<T>> {
  const token = cfToken();
  const res = await fetch(`${CF_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as CFResp<T>;
  return json;
}

export function cfErr(r: CFResp): string {
  if (r.success) return "";
  return (r.errors || []).map((e) => `${e.code}:${e.message}`).join("; ") || "unknown error";
}

export async function cfListAccounts() {
  const r = await cf<any[]>("/accounts?per_page=50");
  if (!r.success) throw new Error(cfErr(r));
  return r.result.map((a) => ({ id: a.id, name: a.name }));
}

export async function cfListZones() {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const r = await cf<any[]>(`/zones?per_page=50&page=${page}`);
    if (!r.success) throw new Error(cfErr(r));
    all.push(...r.result);
    const total = r.result_info?.total_pages ?? 1;
    if (page >= total) break;
    page++;
  }
  return all.map((z) => ({
    id: z.id,
    name: z.name,
    status: z.status,
    name_servers: z.name_servers,
    original_name_servers: z.original_name_servers,
    account: z.account,
  }));
}

export async function cfFindZoneByName(name: string) {
  const r = await cf<any[]>(`/zones?name=${encodeURIComponent(name)}`);
  if (!r.success) throw new Error(cfErr(r));
  return r.result[0] || null;
}

export async function cfCreateZone(name: string, accountId: string) {
  const r = await cf<any>("/zones", {
    method: "POST",
    body: JSON.stringify({ name, account: { id: accountId }, type: "full" }),
  });
  return r;
}

export async function cfActivationCheck(zoneId: string) {
  return cf(`/zones/${zoneId}/activation_check`, { method: "PUT" });
}

export async function cfListDNS(zoneId: string) {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const r = await cf<any[]>(`/zones/${zoneId}/dns_records?per_page=100&page=${page}`);
    if (!r.success) throw new Error(cfErr(r));
    all.push(...r.result);
    const total = r.result_info?.total_pages ?? 1;
    if (page >= total) break;
    page++;
  }
  return all;
}

export async function cfCreateDNS(zoneId: string, rec: any) {
  return cf(`/zones/${zoneId}/dns_records`, { method: "POST", body: JSON.stringify(rec) });
}

export async function cfUpdateDNS(zoneId: string, id: string, rec: any) {
  return cf(`/zones/${zoneId}/dns_records/${id}`, { method: "PUT", body: JSON.stringify(rec) });
}

export async function cfDeleteDNS(zoneId: string, id: string) {
  return cf(`/zones/${zoneId}/dns_records/${id}`, { method: "DELETE" });
}
