// Cloudflare Registrar — same CF API, different endpoints
import { cf, cfErr } from "./cloudflare.server";

export async function cfRegListDomains(accountId: string): Promise<string[]> {
  const r = await cf<any[]>(`/accounts/${accountId}/registrar/domains`);
  if (!r.success) throw new Error(cfErr(r));
  return (r.result || []).map((d) => String(d.name || d.id).toLowerCase());
}

export async function cfRegSetNS(accountId: string, domain: string, ns: string[]): Promise<void> {
  const r = await cf(`/accounts/${accountId}/registrar/domains/${domain}`, {
    method: "PUT",
    body: JSON.stringify({ name_servers: ns }),
  });
  if (!r.success) throw new Error(cfErr(r as any));
}
