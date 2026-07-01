import { createMiddleware } from "@tanstack/react-start";

export const requireGate = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getGateSession } = await import("./session.server");
  const s = await getGateSession();
  if (!s.data.unlocked) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return next();
});
