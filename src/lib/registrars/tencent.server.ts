// Tencent Cloud Domain API — TC3-HMAC-SHA256 signature
// Docs: https://cloud.tencent.com/document/api/242
import { createHash, createHmac } from "node:crypto";
import { getSecret } from "../secrets.server";

const HOST = "domain.tencentcloudapi.com";
const SERVICE = "domain";
const VERSION = "2018-08-08";
const REGION = "";

async function creds() {
  const id = await getSecret("TENCENT_SECRET_ID");
  const key = await getSecret("TENCENT_SECRET_KEY");
  if (!id || !key) throw new Error("TENCENT_SECRET_ID / TENCENT_SECRET_KEY 未配置");
  return { id, key };
}

function sha256Hex(s: string) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
function hmac(k: Buffer | string, s: string) {
  return createHmac("sha256", k).update(s, "utf8").digest();
}

async function tcCall(action: string, payload: Record<string, any>): Promise<any> {
  const { id, key } = await creds();
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${HOST}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256Hex(body)].join(
    "\n",
  );
  const credScope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${ts}\n${credScope}\n${sha256Hex(canonicalRequest)}`;
  const secretDate = hmac("TC3" + key, date);
  const secretService = hmac(secretDate, SERVICE);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning).update(stringToSign, "utf8").digest("hex");
  const auth = `TC3-HMAC-SHA256 Credential=${id}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    Host: HOST,
    Authorization: auth,
    "X-TC-Action": action,
    "X-TC-Timestamp": String(ts),
    "X-TC-Version": VERSION,
  };
  if (REGION) headers["X-TC-Region"] = REGION;

  const res = await fetch(`https://${HOST}`, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tencent ${res.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  if (j?.Response?.Error)
    throw new Error(`Tencent ${j.Response.Error.Code}: ${j.Response.Error.Message}`);
  return j.Response;
}

export async function tencentListDomains(): Promise<string[]> {
  const all: string[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const r = await tcCall("DescribeDomainNameList", { Offset: offset, Limit: limit });
    const items: any[] = r?.DomainSet || [];
    for (const it of items) {
      const n = it.DomainName || it.Domain;
      if (n) all.push(String(n).toLowerCase());
    }
    const total = Number(r?.TotalCount || items.length);
    offset += items.length;
    if (offset >= total || items.length === 0) break;
    if (offset > 5000) break;
  }
  return all;
}

export async function tencentSetNS(domain: string, ns: string[]): Promise<void> {
  await tcCall("ModifyDomainDNSBatch", { Domains: [domain], Dns: ns });
}
