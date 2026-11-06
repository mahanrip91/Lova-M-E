import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowRight, Heart, Lock } from "lucide-react";
import { unlockSite } from "@/lib/gate.functions";
import { DEFAULT_THEME, setViewer, type Viewer } from "@/lib/mae/viewer";
import { resetGateCache } from "./__root";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { title: "M AND E · ورود" },
      { name: "description", content: "ورود به دفتر خاطرات ماهان و الیسا" },
      { property: "og:title", content: "M AND E · ورود" },
      { property: "og:description", content: "ورود به دفتر خاطرات ماهان و الیسا" },
    ],
  }),
  component: Unlock,
});

function Unlock() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [who, setWho] = useState<Viewer | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!who) return;
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    setBusy(true);
    try {
      const { ok } = await unlock({ data: { password, viewer: who } });
      if (!ok) { setError(true); return; }
      resetGateCache();
      setViewer(who);
      await router.invalidate();
      await router.navigate({ to: "/" });
    } finally { setBusy(false); }
  }

  const color = who === "E" ? DEFAULT_THEME.elisa : DEFAULT_THEME.mahan;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="anim-rise">
        <p className="text-xs tracking-[0.3em] text-muted-foreground" dir="ltr">M · AND · E</p>
        <h1 className="mt-2 font-display text-5xl text-love">ماهان و الیسا</h1>
      </div>

      {!who ? (
        <div className="anim-rise mt-10 w-full max-w-sm">
          <p className="mb-4 text-muted-foreground">کدوم یکی هستی؟</p>
          <div className="grid grid-cols-2 gap-3">
            {(["E", "M"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setWho(v)}
                className={`glass rounded-3xl p-6 transition-transform hover:-translate-y-1 ${v === "E" ? "glow-elisa" : "glow-mahan"}`}>
                <Heart className={`mx-auto size-8 ${v === "E" ? "text-elisa" : "text-mahan"}`} fill="currentColor" />
                <div className="mt-3 font-display text-2xl">{v === "E" ? "الیسا" : "ماهان"}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="anim-rise glass mt-10 w-full max-w-sm rounded-3xl p-6" style={{ boxShadow: `0 0 30px ${color}55` }}>
          <button type="button" onClick={() => { setWho(null); setError(false); }} className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowRight className="size-4" /> برگشت
          </button>
          <Lock className="mx-auto mt-2 size-7" style={{ color }} />
          <p className="mt-2 font-bold">سلام {who === "E" ? "الیسا" : "ماهان"} 💫</p>
          <label htmlFor="pw" className="mt-4 block text-sm text-muted-foreground">رمز رو وارد کن</label>
          <input id="pw" name="password" type="password" inputMode="numeric" autoComplete="current-password" autoFocus dir="ltr"
            className="mt-2 w-full rounded-xl border border-input bg-background/60 px-3 py-2.5 text-center tracking-widest" />
          {error && <p className="mt-2 text-sm text-destructive" role="alert">رمز درست نیست</p>}
          <button type="submit" disabled={busy} className="mt-4 w-full rounded-full py-2.5 font-bold text-primary-foreground disabled:opacity-50" style={{ background: color }}>
            {busy ? "…" : "ورود"}
          </button>
        </form>
      )}
    </main>
  );
}
