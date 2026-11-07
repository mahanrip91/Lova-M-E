import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowRight, Heart, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unlockSite } from "@/lib/gate.functions";
import { DEFAULT_THEME, setViewer, type Viewer } from "@/lib/mae/viewer";
import { resetGateCache } from "./__root";

export const Route = createFileRoute("/unlock")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const [connectionError, setConnectionError] = useState(false);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!who) return;
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    setBusy(true);
    setError(false);
    setConnectionError(false);
    try {
      const { ok } = await unlock({ data: { password, viewer: who } });
      if (!ok) { setError(true); return; }
      resetGateCache();
      setViewer(who);
      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch { setConnectionError(true); }
    finally { setBusy(false); }
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
              <Button key={v} type="button" variant="ghost" disabled={!ready} onClick={() => setWho(v)}
                className={`glass h-auto flex-col rounded-3xl p-6 transition-transform hover:-translate-y-1 ${v === "E" ? "glow-elisa" : "glow-mahan"}`}>
                <Heart className={`mx-auto size-8 ${v === "E" ? "text-elisa" : "text-mahan"}`} fill="currentColor" />
                <div className="mt-3 font-display text-2xl">{v === "E" ? "الیسا" : "ماهان"}</div>
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="anim-rise glass mt-10 w-full max-w-sm rounded-3xl p-6" style={{ boxShadow: `0 0 30px ${color}55` }}>
          <Button variant="ghost" size="sm" type="button" onClick={() => { setWho(null); setError(false); }} className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowRight className="size-4" /> برگشت
          </Button>
          <Lock className="mx-auto mt-2 size-7" style={{ color }} />
          <p className="mt-2 font-bold">سلام {who === "E" ? "الیسا" : "ماهان"} 💫</p>
          <label htmlFor="pw" className="mt-4 block text-sm text-muted-foreground">رمز رو وارد کن</label>
          <div className="relative mt-2">
            <input id="pw" name="password" type={visible ? "text" : "password"} inputMode="text" autoComplete="current-password" autoFocus dir="ltr" required onChange={() => { setError(false); setConnectionError(false); }}
              className="w-full rounded-xl border border-input bg-background/60 px-12 py-2.5 text-center tracking-widest" />
            <Button type="button" variant="ghost" size="icon" onClick={() => setVisible((v) => !v)} aria-label={visible ? "پنهان کردن رمز" : "نمایش رمز"} title={visible ? "پنهان کردن رمز" : "نمایش رمز"} className="absolute inset-y-0 left-1 my-auto">
              {visible ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive" role="alert">رمز درست نیست</p>}
          {connectionError && <p className="mt-2 text-sm text-destructive" role="alert">ارتباط برقرار نشد؛ دوباره امتحان کن.</p>}
          <Button type="submit" disabled={busy} className={`mt-4 h-auto w-full rounded-full py-2.5 font-bold text-primary-foreground disabled:opacity-50 ${who === "E" ? "bg-elisa hover:bg-elisa/90" : "bg-mahan hover:bg-mahan/90"}`}>
            {busy ? "…" : "ورود"}
          </Button>
        </form>
      )}
    </main>
  );
}
