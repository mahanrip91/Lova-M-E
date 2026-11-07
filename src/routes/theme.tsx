import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, RotateCcw } from "lucide-react";
import { lockSite } from "@/lib/gate.functions";
import { DEFAULT_THEME, saveTheme, setViewer, useTheme, useViewer } from "@/lib/mae/viewer";
import { PageHeader } from "@/components/mae/Nav";
import { Bubble } from "@/components/mae/Bubble";
import { resetGateCache } from "./__root";

export const Route = createFileRoute("/theme")({
  head: () => ({
    meta: [
      { title: "M AND E · تم و رنگ‌ها" },
      { name: "description", content: "شخصی‌سازی رنگ‌های برنامه" },
      { property: "og:title", content: "M AND E · تم و رنگ‌ها" },
      { property: "og:description", content: "شخصی‌سازی رنگ‌های برنامه" },
    ],
  }),
  component: ThemePage,
});

const SWATCHES = ["#4fb8ff", "#5b8cff", "#38e1c6", "#a78bfa", "#ff5fae", "#ff7aa8", "#ff8a5b", "#f5c542"];

function ThemePage() {
  const viewer = useViewer();
  const t = useTheme();
  const router = useRouter();
  const lock = useServerFn(lockSite);
  const meKey = viewer === "E" ? "elisa" : "mahan";
  const otherKey = viewer === "E" ? "mahan" : "elisa";
  const now = 0; // Stable, synthetic preview time across SSR and hydration.

  const Row = ({ k, label }: { k: "mahan" | "elisa"; label: string }) => (
    <div className="glass rounded-3xl p-4">
      <div className="flex items-center justify-between">
        <span className="font-bold">{label}</span>
        <input type="color" value={t[k]} onChange={(e) => saveTheme({ ...t, [k]: e.target.value })} aria-label={label} className="h-9 w-14 cursor-pointer rounded-lg bg-transparent" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SWATCHES.map((c) => (
          <button key={c} type="button" onClick={() => saveTheme({ ...t, [k]: c })} aria-label={c} aria-pressed={t[k] === c}
            className={`size-8 rounded-full border-2 ${t[k] === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} />
        ))}
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="تم و رنگ‌ها" subtitle={`مخصوص ${viewer === "E" ? "الیسا" : "ماهان"} · روی همین دستگاه ذخیره می‌شود`} />
      <div className="grid gap-3">
        <Row k={meKey} label="رنگ من" />
        <Row k={otherKey} label={viewer === "E" ? "رنگ ماهان" : "رنگ الیسا"} />
        <div className="glass rounded-3xl p-4">
          <label htmlFor="glow" className="font-bold">شدت درخشش پس‌زمینه</label>
          <input id="glow" type="range" min={0} max={70} value={t.glow} onChange={(e) => saveTheme({ ...t, glow: +e.target.value })} className="mt-3 w-full" />
        </div>
        <div className="glass rounded-3xl py-3">
          <p className="px-4 pb-1 text-xs text-muted-foreground">پیش‌نمایش</p>
          <Bubble m={{ u: "p1", s: "p", t: now, k: "x", x: "پیام طرف مقابل", kd: "text", o: 0 }} side={viewer === "E" ? "M" : "E"} />
          <Bubble m={{ u: "p2", s: "p", t: now, k: "y", x: "پیام من", kd: "text", o: 1 }} side={viewer ?? "M"} />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => saveTheme(DEFAULT_THEME)} className="glass flex items-center gap-1 rounded-full px-4 py-2 text-sm"><RotateCcw className="size-4" /> رنگ‌های پیش‌فرض</button>
        <button type="button" onClick={async () => { await lock(); resetGateCache(); setViewer(null); await router.navigate({ to: "/unlock" }); }}
          className="flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm"><LogOut className="size-4" /> خروج / تعویض کاربر</button>
      </div>
    </main>
  );
}
