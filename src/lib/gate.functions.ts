import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

export type Viewer = "M" | "E";
type GateSession = { unlocked?: boolean; viewer?: Viewer };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "mae-gate",
    maxAge: 60 * 60 * 24 * 90,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

function passwordMatches(input: string, expected: string): boolean {
  const norm = (s: string) => s.trim().replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)));
  const a = createHash("sha256").update(norm(input), "utf8").digest();
  const b = createHash("sha256").update(norm(expected), "utf8").digest();
  return timingSafeEqual(a, b);
}

export const getGate = createServerFn({ method: "GET" }).handler(async () => {
  const s = await useSession<GateSession>(sessionConfig());
  return { unlocked: !!s.data.unlocked, viewer: (s.data.viewer ?? null) as Viewer | null };
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string; viewer: Viewer }) => {
    if (typeof d?.password !== "string" || (d.viewer !== "M" && d.viewer !== "E")) throw new Error("bad input");
    return { password: d.password.slice(0, 100), viewer: d.viewer };
  })
  .handler(async ({ data }) => {
    const expected = process.env["SITE_PASSWORD"];
    if (!expected) throw new Error("SITE_PASSWORD is not set");
    if (!passwordMatches(data.password, expected)) return { ok: false as const };
    const s = await useSession<GateSession>(sessionConfig());
    await s.update({ unlocked: true, viewer: data.viewer });
    return { ok: true as const };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const s = await useSession<GateSession>(sessionConfig());
  await s.clear();
  return { ok: true as const };
});
