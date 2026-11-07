import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FastForward, Pause, Play, Rewind, SkipBack, SkipForward, Moon, Info } from "lucide-react";
import { useStore, getState } from "@/lib/mae/store";
import { sliceRange, splitAtMidnight } from "@/lib/mae/analysis";
import { dayKey, dayStartMs, fa, fmtDate, fmtDateTime, fmtDuration, fmtTime } from "@/lib/mae/time";
import { Bubble, DayDivider } from "@/components/mae/Bubble";

interface Search { from: number; to: number; title?: string | undefined; kind?: string | undefined; src?: string | undefined }

export const Route = createFileRoute("/replay")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    from: Number(s["from"]) || 0,
    to: Number(s["to"]) || 0,
    title: typeof s["title"] === "string" ? s["title"] : undefined,
    kind: typeof s["kind"] === "string" ? s["kind"] : undefined,
    src: typeof s["src"] === "string" ? s["src"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "M AND E · پخش خاطره" },
      { name: "description", content: "بازپخش سینمایی یک خاطره از آرشیو گفتگوها" },
      { property: "og:title", content: "M AND E · پخش خاطره" },
      { property: "og:description", content: "بازپخش سینمایی یک خاطره از آرشیو گفتگوها" },
    ],
  }),
  component: Replay,
});

const SPEEDS = [1, 2, 5, 20];
const GAP_SKIP = 30 * 60000;

function Replay() {
  const { from, to, title, kind, src } = Route.useSearch();
  const status = useStore((s) => s.status);
  const all = useStore((s) => s.messages);
  const sources = useStore((s) => s.sources);
  const sides = useStore((s) => s.sides);
  const msgs = useMemo(() => { if (kind === "first" && !src) return []; const r = sliceRange(all, from, to); return src ? r.filter((m) => m.s === src) : r; }, [all, from, to, src, kind]);
  const segments = useMemo(() => splitAtMidnight(from, to, msgs), [from, to, msgs]);
  const [phase, setPhase] = useState<"intro" | "play">("intro");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const endRef = useRef<HTMLDivElement>(null);
  const srcLabel = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s.label])), [sources]);

  useEffect(() => { setIdx(0); setPhase("intro"); setPlaying(true); }, [from, to]);
  useEffect(() => {
    if (phase !== "intro") return;
    const t = setTimeout(() => setPhase("play"), 5000);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase !== "play" || !playing || idx >= msgs.length) return;
    const next = msgs[idx]!;
    const prev = msgs[idx - 1];
    const gap = prev ? next.t - prev.t : 0;
    const base = Math.min(1800, 450 + (next.x?.length ?? 0) * 12) + (gap > 10 * 60000 ? 1200 : 0);
    const t = setTimeout(() => setIdx((i) => i + 1), base / speed);
    return () => clearTimeout(t);
  }, [phase, playing, idx, msgs, speed]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [idx]);

  if (status === "loading") return <p className="p-8 text-center text-muted-foreground">در حال بارگذاری…</p>;
  if (status === "empty") return <p className="p-8 text-center">ابتدا آرشیو را <Link to="/import" className="text-primary underline">وارد کن</Link>.</p>;

  const first = msgs[0];
  const firstSide = first ? sides[first.k]?.side : undefined;
  const srcSet = [...new Set(msgs.map((m) => srcLabel[m.s]))];
  const multiDay = segments.length > 1;
  const midnight = dayStartMs(dayKey(to));
  const preMidnightEmpty = kind === "first" && msgs.every((m) => m.t >= midnight);
  const missingSource = (kind === "first" && !src) || (!!src && !sources.some((x) => x.id === src));

  const windowStart = Math.max(0, idx - 120);
  const shown = msgs.slice(windowStart, idx);
  const skipNext = () => { let i = idx + 1; while (i < msgs.length && msgs[i]!.t - msgs[i - 1]!.t < GAP_SKIP) i++; setIdx(Math.min(msgs.length, i)); };
  const skipPrev = () => { let i = Math.max(0, idx - 2); while (i > 0 && msgs[i]!.t - msgs[i - 1]!.t < GAP_SKIP) i--; setIdx(i); };

  if (missingSource) {
    return <p className="p-8 text-center">آرشیو این خاطره هنوز روی این دستگاه نیست. <Link to="/import" className="text-primary underline">وارد کردن آرشیو</Link></p>;
  }
  if (phase === "intro") {
    return (
      <main className="mx-auto flex min-h-[85vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <p className="anim-rise text-xs tracking-[0.4em] text-muted-foreground" dir="ltr">M · AND · E</p>
        <h1 className="anim-rise mt-3 font-display text-5xl text-love" style={{ animationDelay: "0.2s" }}>{title ?? "خاطره"}</h1>
        <p className="anim-rise mt-4 text-lg" style={{ animationDelay: "0.6s" }}>
          {multiDay ? `${fmtDate(from)} ← ${fmtDate(to)}` : fmtDate(from)}
        </p>
        <ul className="anim-rise mt-6 space-y-1.5 text-sm text-muted-foreground" style={{ animationDelay: "1.1s" }}>
          <li>{fa(msgs.length)} پیام بایگانی‌شده{first ? ` · از ${fmtTime(first.t)} تا ${fmtTime(msgs[msgs.length - 1]!.t)}` : ""}</li>
          {first && <li>مدت: {fmtDuration(msgs[msgs.length - 1]!.t - first.t)}</li>}
          {srcSet.length > 0 && <li>منبع: {srcSet.join("، ")}</li>}
          {firstSide && firstSide !== "O" && <li>اولین پیام این بازه را {firstSide === "M" ? "ماهان" : "الیسا"} فرستاد</li>}
        </ul>
        {preMidnightEmpty && (
          <p className="anim-rise mt-6 max-w-sm rounded-2xl border border-gold/40 bg-gold/10 p-3 text-xs" style={{ animationDelay: "1.6s" }}>
            در آرشیوِ انتخاب‌شده هیچ پیامی پیش از ۰۰:۰۰ نیست. فقط پیام‌های واقعیِ موجود پخش می‌شوند.
          </p>
        )}
        <button type="button" onClick={() => setPhase("play")} className="mt-8 rounded-full bg-love px-6 py-2.5 font-bold text-primary-foreground">شروع پخش</button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl pt-4 pb-72">
      <header className="sticky top-0 z-20 mx-3 mb-3 glass rounded-2xl px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-xl">{title ?? "خاطره"}</h1>
          <span className="text-xs text-muted-foreground">{fa(idx)} / {fa(msgs.length)}</span>
        </div>
        {/* segment / midnight timeline */}
        <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {segments.map((s) => (
            <div key={s.day} className="relative bg-muted" style={{ flex: s["to"] - s["from"] + 1 }}>
              {s.messages.length > 0 && (
                <div className="absolute inset-y-0 bg-love" style={{ insetInlineStart: `${((s.messages[0]!.t - s["from"]) / (s["to"] - s["from"] + 1)) * 100}%`, width: `${Math.max(1, ((s.messages[s.messages.length - 1]!.t - s.messages[0]!.t) / (s["to"] - s["from"] + 1)) * 100)}%` }} />
              )}
            </div>
          ))}
        </div>
        {multiDay && (
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            {segments.map((s, i) => <span key={s.day}>{i > 0 && <Moon className="inline size-3" />} {fmtDate(s["from"])} · {fa(s.messages.length)} پیام</span>)}
          </div>
        )}
      </header>

      {kind === "first" && (
        <div className="mx-4 mb-2 flex gap-2 rounded-2xl border border-gold/40 bg-gold/10 p-3 text-xs">
          <Info className="size-4 shrink-0 text-gold" />
          <span>
            بازه‌ی این خاطره: {fmtDateTime(from)} تا {fmtDateTime(to)}. {preMidnightEmpty ? "برای پیش از نیمه‌شب پیامی در آرشیو نیست؛ چیزی ساخته نمی‌شود." : ""}{" "}
            <Link to="/memories" className="text-primary underline">ویرایش بازه</Link>
          </span>
        </div>
      )}

      {windowStart > 0 && <p className="text-center text-xs text-muted-foreground">… {fa(windowStart)} پیام قبلی</p>}
      {shown.map((m, i) => {
        const gi = windowStart + i;
        const prev = msgs[gi - 1];
        const newDay = !prev || dayKey(prev.t) !== dayKey(m.t);
        const gap = prev ? m.t - prev.t : 0;
        const reply = m.r ? all[getState().uidIndex.get(m.r) ?? -1] : undefined;
        return (
          <div key={m.u}>
            {newDay && (prev ? <DayDivider label={`🌙 از نیمه‌شب گذشت · ${fmtDate(m.t)}`} sub="همان گفتگو ادامه دارد" /> : <DayDivider label={fmtDate(m.t)} />)}
            {!newDay && gap > 10 * 60000 && <p className="my-2 text-center text-[11px] text-muted-foreground">⏳ {fmtDuration(gap)} بعد</p>}
            <Bubble m={m} side={sides[m.k]?.side} senderName={sides[m.k]?.name} sourceLabel={srcLabel[m.s]} reply={reply} replyMissing={!!m.r && !reply} animate />
          </div>
        );
      })}
      {idx >= msgs.length && (
        <div className="glass anim-rise mx-4 mt-6 rounded-3xl p-6 text-center">
          <p className="font-display text-2xl text-love">ادامه در تایم‌لاین</p>
          <p className="mt-1 text-xs text-muted-foreground">این بازه به پایان رسید؛ گفتگو در تایم‌لاین ادامه دارد.</p>
          <Link to="/timeline" search={{ at: to }} className="mt-4 inline-block rounded-full bg-love px-5 py-2 text-primary-foreground">رفتن به تایم‌لاین</Link>
        </div>
      )}
      {msgs.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">در این بازه پیامی در آرشیو نیست.</p>}
      <div ref={endRef} />

      <div className="fixed inset-x-0 bottom-24 z-30 px-3">
        <div className="glass mx-auto flex max-w-lg flex-col gap-2 rounded-3xl px-4 py-3">
          <input type="range" min={0} max={msgs.length} value={idx} onChange={(e) => setIdx(+e.target.value)} aria-label="جابجایی در خاطره" className="w-full accent-[var(--accent)]" />
          <div className="flex items-center justify-between">
            <button type="button" onClick={skipPrev} aria-label="گفتگوی قبلی" className="p-2"><SkipForward className="size-5" /></button>
            <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 10))} aria-label="۱۰ پیام عقب" className="p-2"><FastForward className="size-5" /></button>
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "توقف" : "پخش"} className="grid size-12 place-items-center rounded-full bg-love text-primary-foreground">
              {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            <button type="button" onClick={() => setIdx((i) => Math.min(msgs.length, i + 10))} aria-label="۱۰ پیام جلو" className="p-2"><Rewind className="size-5" /></button>
            <button type="button" onClick={skipNext} aria-label="گفتگوی بعدی" className="p-2"><SkipBack className="size-5" /></button>
            <button type="button" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] ?? 1)} className="rounded-full border border-border px-3 py-1 text-xs tabular-nums" aria-label="سرعت پخش">
              {fa(speed)}×
            </button>
            <Link to="/timeline" search={{ at: msgs[Math.max(0, idx - 1)]?.t ?? from }} className="rounded-full border border-border px-3 py-1 text-xs">تایم‌لاین</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
