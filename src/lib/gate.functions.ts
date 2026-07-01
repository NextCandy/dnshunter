import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";

function eq(a: string, b: string) {
  const ah = createHash("sha256").update(a, "utf8").digest();
  const bh = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ah, bh);
}

export const checkGate = createServerFn({ method: "GET" }).handler(async () => {
  const { getGateSession } = await import("./session.server");
  const s = await getGateSession();
  return { unlocked: Boolean(s.data.unlocked) };
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => d)
  .handler(async ({ data }) => {
    const expected = process.env.SITE_PASSWORD;
    if (!expected) throw new Error("SITE_PASSWORD not set");
    if (!eq(data.password, expected)) return { ok: false as const };
    const { getGateSession } = await import("./session.server");
    const s = await getGateSession();
    await s.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./session.server");
  const s = await getGateSession();
  await s.clear();
  return { ok: true };
});
