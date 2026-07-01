// Dynadot JSON API v3 — https://api.dynadot.com/api3.json
const BASE = "https://api.dynadot.com/api3.json";

function key(): string {
  const k = process.env.DYNADOT_API_KEY;
  if (!k) throw new Error("DYNADOT_API_KEY 未配置");
  return k;
}

export async function dynadotListDomains(): Promise<string[]> {
  const url = `${BASE}?key=${encodeURIComponent(key())}&command=list_domain`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dynadot ${res.status}`);
  const j: any = await res.json();
  const list =
    j?.ListDomainInfoResponse?.MainDomains ||
    j?.ListDomainInfoResponse?.DomainInfoList ||
    j?.list_domain_info_response?.domain_info_list ||
    [];
  const out: string[] = [];
  for (const it of list) {
    const name = it.name || it.Name || it.domain || it.Domain;
    if (name) out.push(String(name).toLowerCase());
  }
  return out;
}

export async function dynadotSetNS(domain: string, ns: string[]): Promise<void> {
  const params = new URLSearchParams({
    key: key(),
    command: "set_ns",
    domain,
  });
  ns.forEach((n, i) => params.append(`ns${i}`, n));
  const res = await fetch(`${BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`Dynadot setNS ${res.status}`);
  const j: any = await res.json();
  const status =
    j?.SetNsResponse?.ResponseCode ??
    j?.set_ns_response?.response_code;
  if (status !== undefined && Number(status) !== 0) {
    throw new Error(`Dynadot setNS failed: ${JSON.stringify(j)}`);
  }
}
