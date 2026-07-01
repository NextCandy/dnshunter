// Aliyun (Alibaba Cloud) Domain API — ACS3-HMAC-SHA256 signature
// Docs: https://help.aliyun.com/document_detail/2361052.html
import { createHash, createHmac, randomBytes } from "node:crypto";

const ENDPOINT = "domain.aliyuncs.com";
const VERSION = "2018-01-29";

function creds() {
  const id = process.env.ALIYUN_ACCESS_KEY_ID;
  const secret = process.env.ALIYUN_ACCESS_KEY_SECRET;
  if (!id || !secret) throw new Error("ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET 未配置");
  return { id, secret };
}

function hex(buf: Buffer) {
  return buf.toString("hex");
}

function sha256Hex(s: string | Buffer) {
  return createHash("sha256").update(s).digest("hex");
}

async function acsCall(action: string, params: Record<string, string>): Promise<any> {
  const { id, secret } = creds();
  const now = new Date();
  const iso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const nonce = randomBytes(16).toString("hex");

  const query = Object.keys(params)
    .sort()
    .map(
      (k) =>
        `${encodeURIComponent(k).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())}=${encodeURIComponent(params[k]).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())}`,
    )
    .join("&");

  const bodyHash = sha256Hex("");
  const headers: Record<string, string> = {
    host: ENDPOINT,
    "x-acs-action": action,
    "x-acs-version": VERSION,
    "x-acs-date": iso,
    "x-acs-signature-nonce": nonce,
    "x-acs-content-sha256": bodyHash,
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = ["POST", "/", query, canonicalHeaders, signedHeaders, bodyHash].join("\n");
  const stringToSign = `ACS3-HMAC-SHA256\n${sha256Hex(canonicalRequest)}`;
  const signature = hex(createHmac("sha256", secret).update(stringToSign).digest());
  const auth = `ACS3-HMAC-SHA256 Credential=${id},SignedHeaders=${signedHeaders},Signature=${signature}`;

  const res = await fetch(`https://${ENDPOINT}/?${query}`, {
    method: "POST",
    headers: { ...headers, Authorization: auth, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Aliyun ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export async function aliyunListDomains(): Promise<string[]> {
  const all: string[] = [];
  let page = 1;
  const size = 100;
  while (true) {
    const j = await acsCall("QueryDomainList", {
      PageNum: String(page),
      PageSize: String(size),
    });
    const items: any[] = j?.Data?.Domain || j?.Data || [];
    for (const it of items) {
      const name = it.DomainName || it.domainName;
      if (name) all.push(String(name).toLowerCase());
    }
    const total = Number(j?.TotalItemNum || j?.totalItemNum || items.length);
    if (page * size >= total || items.length === 0) break;
    page++;
    if (page > 50) break;
  }
  return all;
}

export async function aliyunSetNS(domain: string, ns: string[]): Promise<void> {
  const params: Record<string, string> = { DomainName: domain };
  ns.slice(0, 5).forEach((n, i) => (params[`DnsHost.${i + 1}`] = n));
  await acsCall("SaveSingleTaskForModifyingDNSHost", params);
}
