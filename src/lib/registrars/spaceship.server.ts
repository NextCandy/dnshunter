// Spaceship API — https://docs.spaceship.dev/
const BASE = "https://spaceship.dev/api/v1";

function headers() {
  const key = process.env.SPACESHIP_API_KEY;
  const secret = process.env.SPACESHIP_API_SECRET;
  if (!key || !secret) throw new Error("SPACESHIP_API_KEY / SPACESHIP_API_SECRET 未配置");
  return {
    "X-Api-Key": key,
    "X-Api-Secret": secret,
    "Content-Type": "application/json",
  };
}

export async function spaceshipListDomains(): Promise<string[]> {
  const all: string[] = [];
  let skip = 0;
  const take = 100;
  while (true) {
    const res = await fetch(`${BASE}/domains?take=${take}&skip=${skip}`, {
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Spaceship ${res.status}: ${await res.text()}`);
    const j: any = await res.json();
    const items: any[] = j.items || j.domains || j.data || [];
    for (const it of items) {
      const name = it.name || it.domain || it.domainName;
      if (name) all.push(String(name).toLowerCase());
    }
    if (items.length < take) break;
    skip += take;
    if (skip > 5000) break;
  }
  return all;
}

export async function spaceshipSetNS(domain: string, ns: string[]): Promise<void> {
  const res = await fetch(`${BASE}/domains/${encodeURIComponent(domain)}/nameservers`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ mode: "custom", hosts: ns }),
  });
  if (!res.ok) throw new Error(`Spaceship setNS ${res.status}: ${await res.text()}`);
}
