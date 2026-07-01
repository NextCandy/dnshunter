import { createServerFn } from "@tanstack/react-start";
import { requireGate } from "./auth-middleware";
import { normalizeDomain } from "./domain-utils";

export type Registrar = "spaceship" | "dynadot" | "cf-registrar";

export const getTokenStatus = createServerFn({ method: "GET" })
  .middleware([requireGate])
  .handler(async () => {
    return {
      cloudflare: Boolean(process.env.CLOUDFLARE_API_TOKEN),
      spaceship: Boolean(process.env.SPACESHIP_API_KEY && process.env.SPACESHIP_API_SECRET),
      dynadot: Boolean(process.env.DYNADOT_API_KEY),
    };
  });

export const listRegistrarDomains = createServerFn({ method: "POST" })
  .middleware([requireGate])
  .inputValidator((d: { registrar: Registrar; accountId?: string }) => d)
  .handler(async ({ data }) => {
    let raw: string[] = [];
    if (data.registrar === "spaceship") {
      const { spaceshipListDomains } = await import("./registrars/spaceship.server");
      raw = await spaceshipListDomains();
    } else if (data.registrar === "dynadot") {
      const { dynadotListDomains } = await import("./registrars/dynadot.server");
      raw = await dynadotListDomains();
    } else if (data.registrar === "cf-registrar") {
      if (!data.accountId) throw new Error("需要 accountId");
      const { cfRegListDomains } = await import("./registrars/cf-registrar.server");
      raw = await cfRegListDomains(data.accountId);
    }
    const set = new Set<string>();
    for (const d of raw) {
      const n = normalizeDomain(d);
      if (n) set.add(n);
    }
    return { domains: [...set].sort() };
  });
