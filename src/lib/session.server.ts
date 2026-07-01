import { useSession } from "@tanstack/react-start/server";

export type GateSession = { unlocked?: boolean };

export const sessionConfig = {
  password: process.env.SESSION_SECRET!,
  name: "dm-gate",
  maxAge: 60 * 60 * 24 * 7,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
  },
};

export async function getGateSession() {
  return useSession<GateSession>(sessionConfig);
}

export async function requireUnlocked() {
  const s = await getGateSession();
  if (!s.data.unlocked) {
    throw new Response("Locked", { status: 401 });
  }
}
