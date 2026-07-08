// Porkbun API v3 — https://porkbun.com/api/json/v3/documentation
import { getSecret } from "../secrets.server";

const BASE = "https://api.porkbun.com/api/json/v3";

async function creds() {
  const apiKey = await getSecret("PORKBUN_API_KEY");
  const secretApiKey = await getSecret("PORKBUN_SECRET_API_KEY");
  if (!apiKey || !secretApiKey) throw new Error("PORKBUN_API_KEY / PORKBUN_SECRET_API_KEY 未配置");
  return { apiKey, secretApiKey };
}

async function authHeaders() {
  const c = await creds();
  return {
    "X-API-Key": c.apiKey,
    "X-Secret-API-Key": c.secretApiKey,
  };
}

function porkbunError(prefix: string, body: any, status?: number): Error {
  const code = body?.code ? ` ${body.code}` : "";
  const message = body?.message ? `: ${body.message}` : "";
  return new Error(`${prefix}${status ? ` ${status}` : ""}${code}${message}`);
}

export async function porkbunListDomains(): Promise<string[]> {
  const out: string[] = [];
  let start = 0;
  const pageSize = 1000;

  while (true) {
    const params = new URLSearchParams({ start: String(start) });
    const res = await fetch(`${BASE}/domain/listAll?${params.toString()}`, {
      headers: await authHeaders(),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok || j?.status === "ERROR") throw porkbunError("Porkbun listAll", j, res.status);

    const items: any[] = Array.isArray(j?.domains) ? j.domains : [];
    for (const it of items) {
      const name = it?.domain || it?.name || it?.domainName;
      if (name) out.push(String(name).toLowerCase());
    }

    if (items.length < pageSize) break;
    start += items.length;
    if (start > 50000) break;
  }

  return out;
}

export async function porkbunSetNS(domain: string, ns: string[]): Promise<void> {
  const c = await creds();
  const res = await fetch(`${BASE}/domain/updateNs/${encodeURIComponent(domain)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: c.apiKey,
      secretapikey: c.secretApiKey,
      ns,
    }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j?.status === "ERROR") throw porkbunError("Porkbun updateNs", j, res.status);
}
