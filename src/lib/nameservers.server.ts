import { resolveNs } from "node:dns/promises";

export type NameserverStatus = "cloudflare" | "other" | "unknown";

export type DomainNameserverInfo = {
  domain: string;
  nameservers: string[];
  nsStatus: NameserverStatus;
  nsProvider?: string;
  nsError?: string;
};

function cleanNs(ns: string) {
  return ns.trim().replace(/\.$/, "").toLowerCase();
}

export function classifyNameservers(nameservers: string[]): NameserverStatus {
  if (nameservers.length === 0) return "unknown";
  return nameservers.some((ns) => cleanNs(ns).endsWith(".cloudflare.com")) ? "cloudflare" : "other";
}

// NS 后缀 → 提供商标签（用于前端展示"当前 NS 托管在哪家"）。
const NS_PROVIDER_SUFFIXES: [string, string][] = [
  [".cloudflare.com", "Cloudflare"],
  [".porkbun.com", "Porkbun"],
  [".spaceship.com", "Spaceship"],
  [".spaceship.net", "Spaceship"],
  [".dynadot.com", "Dynadot"],
  [".registrar-servers.com", "Namecheap"],
  [".namecheaphosting.com", "Namecheap"],
  [".hichina.com", "阿里云"],
  [".alidns.com", "阿里云"],
  [".dnspod.net", "DNSPod/腾讯"],
  [".dnsv2.com", "DNSPod/腾讯"],
  [".dnsv3.com", "DNSPod/腾讯"],
  [".dnsv4.com", "DNSPod/腾讯"],
  [".dnsv5.com", "DNSPod/腾讯"],
  [".myhostadmin.net", "西部数码"],
  [".west263.com", "西部数码"],
  [".dnsowl.com", "NameSilo"],
  [".domaincontrol.com", "GoDaddy"],
  [".googledomains.com", "Google"],
  [".awsdns", "Route53"],
  [".vercel-dns.com", "Vercel"],
];

export function identifyNsProvider(nameservers: string[]): string | undefined {
  for (const raw of nameservers) {
    const ns = cleanNs(raw);
    for (const [suffix, label] of NS_PROVIDER_SUFFIXES) {
      if (ns.endsWith(suffix) || (suffix === ".awsdns" && ns.includes(".awsdns-"))) {
        return label;
      }
    }
  }
  return undefined;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("NS 查询超时")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function resolveDomainNameservers(
  domain: string,
  timeoutMs = 3500,
): Promise<DomainNameserverInfo> {
  try {
    const nameservers = (await withTimeout(resolveNs(domain), timeoutMs))
      .map(cleanNs)
      .filter(Boolean)
      .sort();
    return {
      domain,
      nameservers,
      nsStatus: classifyNameservers(nameservers),
      nsProvider: identifyNsProvider(nameservers),
    };
  } catch (e: any) {
    return {
      domain,
      nameservers: [],
      nsStatus: "unknown",
      nsError: e?.code || e?.message || "NS 查询失败",
    };
  }
}

export async function resolveDomainsNameservers(
  domains: string[],
  concurrency = 12,
): Promise<Map<string, DomainNameserverInfo>> {
  const out = new Map<string, DomainNameserverInfo>();
  let index = 0;

  async function worker() {
    while (index < domains.length) {
      const domain = domains[index++];
      out.set(domain, await resolveDomainNameservers(domain));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(domains.length, 1)) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return out;
}
