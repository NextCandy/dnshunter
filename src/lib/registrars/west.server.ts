// 西部数码 West.cn API — https://www.west.cn/CustomerCenter/doc/apiv2.html
// Uses username + API password. Very simple query-string protocol.
import { createHash } from "node:crypto";

const BASE = "https://api.west.cn/api/v2";

function creds() {
  const username = process.env.WEST_USERNAME;
  const password = process.env.WEST_API_PASSWORD;
  if (!username || !password) throw new Error("WEST_USERNAME / WEST_API_PASSWORD 未配置");
  return { username, password };
}

function md5(s: string) {
  return createHash("md5").update(s, "utf8").digest("hex");
}

async function westCall(path: string, params: Record<string, string> = {}) {
  const { username, password } = creds();
  const time = Math.floor(Date.now() / 1000).toString();
  const token = md5(username + md5(password) + time);
  const body = new URLSearchParams({ username, time, token, ...params });
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`West ${res.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  if (j?.result !== 200 && j?.code !== 200) {
    throw new Error(`West ${j?.result || j?.code}: ${j?.msg || "unknown"}`);
  }
  return j;
}

export async function westListDomains(): Promise<string[]> {
  const all: string[] = [];
  let page = 1;
  const size = 100;
  while (true) {
    const j = await westCall("/domain/", { act: "getdomains", pageno: String(page), limit: String(size) });
    const items: any[] = j?.data?.items || j?.data || [];
    for (const it of items) {
      const n = it.domain || it.Domain || it.name;
      if (n) all.push(String(n).toLowerCase());
    }
    const total = Number(j?.data?.total || items.length);
    if (page * size >= total || items.length === 0) break;
    page++;
    if (page > 50) break;
  }
  return all;
}

export async function westSetNS(domain: string, ns: string[]): Promise<void> {
  const params: Record<string, string> = { act: "modifyDns", domain };
  ns.slice(0, 6).forEach((n, i) => (params[`dns${i + 1}`] = n));
  await westCall("/domain/", params);
}
