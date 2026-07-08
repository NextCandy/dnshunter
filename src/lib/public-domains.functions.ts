import { createServerFn } from "@tanstack/react-start";

// 公开(无需登录)域名清单接口。
// 仅暴露「域名 / 注册商 / 注册日期 / 到期日期」等非敏感字段，
// 刻意不返回 nameservers、备注、估值、标签、分组等私有信息。
// 遵循 gate.functions.ts 的写法：顶层不静态 import 任何 *.server 模块，
// 服务端存储读取放在 handler 内动态 import，避免 node:fs 等泄漏进客户端 bundle。
export type PublicDomain = {
  domain: string;
  registrar: string;
  registrarLabel: string;
  registeredAt?: string;
  expiresAt?: string;
  status?: "normal" | "expiring" | "expired" | "error" | "unknown";
  daysRemaining?: number;
};

const REGISTRAR_LABELS: Record<string, string> = {
  spaceship: "Spaceship",
  dynadot: "Dynadot",
  porkbun: "Porkbun",
  "cf-registrar": "Cloudflare",
  namecheap: "Namecheap",
  aliyun: "阿里云",
  tencent: "腾讯云",
  west: "西部数码",
};

export const listPublicDomains = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicDomain[]> => {
    const { listPersistedRegistrarDomains } = await import("./registrar-domain-store.server");
    const rows = await listPersistedRegistrarDomains();
    return rows.map((r) => ({
      domain: r.domain,
      registrar: r.registrar,
      registrarLabel: REGISTRAR_LABELS[r.registrar] ?? r.registrar,
      registeredAt: r.registeredAt,
      expiresAt: r.expiresAt,
      status: r.status,
      daysRemaining: r.daysRemaining,
    }));
  },
);
