// Cloudflare API helpers (server-only)
import { getSecret } from "../secrets.server";

const CF_BASE = "https://api.cloudflare.com/client/v4";

export type CFResp<T = any> = {
  success: boolean;
  errors?: { code: number; message: string }[];
  messages?: any[];
  result: T;
  result_info?: any;
};

export async function cfToken(): Promise<string> {
  const t = await getSecret("CLOUDFLARE_API_TOKEN");
  if (!t) throw new Error("CLOUDFLARE_API_TOKEN 未配置");
  return t;
}

export async function cf<T = any>(path: string, init: RequestInit = {}): Promise<CFResp<T>> {
  const token = await cfToken();
  let res: Response;
  try {
    res = await fetch(`${CF_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (e: any) {
    // 网络层失败（DNS/超时/断网），构造统一错误结构，避免上层拿到 undefined
    return {
      success: false,
      errors: [{ code: -1, message: `无法连接 Cloudflare API：${e?.message || "网络错误"}` }],
      result: undefined as T,
    };
  }
  const json = (await res.json().catch(() => null)) as CFResp<T> | null;
  if (json && typeof json.success === "boolean") return json;
  // 非 JSON 响应（如网关 5xx / 限流页面）
  return {
    success: false,
    errors: [
      {
        code: res.status,
        message:
          res.status === 429
            ? "Cloudflare API 限流（429），请稍后重试"
            : `Cloudflare API 返回异常（HTTP ${res.status}）`,
      },
    ],
    result: undefined as T,
  };
}

// 常见 Cloudflare 错误码 → 中文解释。未列出的码原样展示 message。
const CF_ERROR_HINTS: Record<number, string> = {
  10000:
    "Token 无效或权限不足：请到设置页检查 Token；DNS 读取需要 Zone:DNS:Read，新增/修改/删除需要 Zone:DNS:Edit，Zone 管理需要 Zone:Zone:Read/Edit",
  9109: "Token 已过期或被撤销，请重新生成并在设置页更新",
  6003: "请求头无效：Token 格式可能有误（多余空格/换行），请重新粘贴保存",
  9103: "Token 无效：X-Auth-Key/Email 与 Bearer Token 混用或格式错误",
  7003: "请求的资源不存在：Zone 或记录可能已被删除",
  1061: "该域名的 Zone 已存在",
  1097: "域名被 Cloudflare 拒绝（疑似滥用名单），无法创建 Zone",
  1099: "域名格式无效或 TLD 不受支持",
  1105: "操作过于频繁被限流，请稍后重试",
  81044: "DNS 记录不存在或已被删除",
  81053: "已存在相同的 A/AAAA/CNAME 记录",
  81057: "已存在内容完全相同的记录，无需重复添加",
  81058: "相同名称的记录数量已达上限",
  9106: "缺少 Account 权限：列出账户需要 Token 具有 Account:Read（Account Settings:Read）",
  9207: "Token 权限不足以访问该资源",
};

export function cfErr(r: CFResp): string {
  if (r.success) return "";
  return (
    (r.errors || [])
      .map((e) => {
        const hint = CF_ERROR_HINTS[e.code];
        return hint ? `${e.code} ${e.message}（${hint}）` : `${e.code}:${e.message}`;
      })
      .join("; ") || "unknown error"
  );
}

// 校验 Token 本身是否有效（不校验具体权限）。任何有效 Token 都能调用此端点。
// 返回 "active" | "invalid" | "unconfigured"。
export async function cfVerifyToken(): Promise<"active" | "invalid" | "unconfigured"> {
  const t = await getSecret("CLOUDFLARE_API_TOKEN");
  if (!t) return "unconfigured";
  const r = await cf<{ status: string }>("/user/tokens/verify");
  if (r.success && r.result?.status === "active") return "active";
  return "invalid";
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
