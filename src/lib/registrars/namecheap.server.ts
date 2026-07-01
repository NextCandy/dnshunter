// Namecheap API — https://www.namecheap.com/support/api/
// XML response endpoint. Requires whitelisted client IP in Namecheap dashboard.
const BASE = "https://api.namecheap.com/xml.response";

function creds() {
  const ApiUser = process.env.NAMECHEAP_API_USER;
  const ApiKey = process.env.NAMECHEAP_API_KEY;
  const UserName = process.env.NAMECHEAP_USERNAME || ApiUser;
  const ClientIp = process.env.NAMECHEAP_CLIENT_IP;
  if (!ApiUser || !ApiKey || !ClientIp)
    throw new Error("NAMECHEAP_API_USER / NAMECHEAP_API_KEY / NAMECHEAP_CLIENT_IP 未配置");
  return { ApiUser, ApiKey, UserName: UserName!, ClientIp };
}

async function call(command: string, extra: Record<string, string> = {}) {
  const c = creds();
  const p = new URLSearchParams({
    ApiUser: c.ApiUser,
    ApiKey: c.ApiKey,
    UserName: c.UserName,
    ClientIp: c.ClientIp,
    Command: command,
    ...extra,
  });
  const res = await fetch(`${BASE}?${p.toString()}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Namecheap ${res.status}: ${text.slice(0, 200)}`);
  if (/Status="ERROR"/.test(text)) {
    const m = text.match(/<Error[^>]*>([^<]+)<\/Error>/);
    throw new Error(`Namecheap: ${m?.[1] || "unknown error"}`);
  }
  return text;
}

export async function namecheapListDomains(): Promise<string[]> {
  const all: string[] = [];
  let page = 1;
  const size = 100;
  while (true) {
    const xml = await call("namecheap.domains.getList", {
      Page: String(page),
      PageSize: String(size),
    });
    const names = [...xml.matchAll(/<Domain[^>]*Name="([^"]+)"/g)].map((m) => m[1].toLowerCase());
    all.push(...names);
    const totalMatch = xml.match(/TotalItems="(\d+)"/);
    const total = totalMatch ? Number(totalMatch[1]) : names.length;
    if (page * size >= total || names.length === 0) break;
    page++;
    if (page > 50) break;
  }
  return all;
}

export async function namecheapSetNS(domain: string, ns: string[]): Promise<void> {
  const parts = domain.split(".");
  if (parts.length < 2) throw new Error(`Namecheap: 无效域名 ${domain}`);
  const TLD = parts.slice(1).join(".");
  const SLD = parts[0];
  await call("namecheap.domains.dns.setCustom", {
    SLD,
    TLD,
    Nameservers: ns.join(","),
  });
}
