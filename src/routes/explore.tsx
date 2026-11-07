import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useStore } from "@/lib/mae/store";
import { JALALI_MONTHS, dayStartMs, fa, fmtDate, jalaliMonthLength, jalaliOf, DAY_MS } from "@/lib/mae/time";
import { PageHeader } from "@/components/mae/Nav";
import { JalaliDateTimeInput } from "@/components/mae/JalaliInput";
import type { DayStat } from "@/lib/mae/analysis";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "M AND E · سفر در زمان" },
      { name: "description", content: "کاوش کیهانی روزها و ماه‌ها با تقویم شمسی" },
      { property: "og:title", content: "M AND E · سفر در زمان" },
      { property: "og:description", content: "کاوش کیهانی روزها و ماه‌ها" },
    ],
  }),
  component: Explore,
});

interface Month { jy: number; jm: number; days: Map<number, DayStat>; total: number }

function Explore() {
  const status = useStore((s) => s.status);
  const days = useStore((s) => s.days);
  const navigate = useNavigate();
  const months = useMemo(() => {
    const map = new Map<string, Month>();
    for (const d of days) {
      const j = jalaliOf(dayStartMs(d.day));
      const k = `${j.jy}-${j.jm}`;
      const mo = map.get(k) ?? { jy: j.jy, jm: j.jm, days: new Map(), total: 0 };
      mo.days.set(j.jd, d);
      mo.total += d.total;
      map.set(k, mo);
    }
    return [...map.values()];
  }, [days]);
  const max = useMemo(() => Math.max(1, ...days.map((d) => d.total)), [days]);
  const [mi, setMi] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [jumpAt, setJumpAt] = useState<number>(0);
  useEffect(() => { if (days.length && !sel) { setSel(days[0]!.day); setJumpAt(dayStartMs(days[0]!.day)); } }, [days, sel]);

  if (status === "loading") return <p className="p-8 text-center text-muted-foreground">در حال بارگذاری…</p>;
  if (status === "empty") return <p className="p-8 text-center">ابتدا آرشیو را <Link to="/import" className="text-primary underline">وارد کن</Link>.</p>;

  const month = months[Math.min(mi, months.length - 1)]!;
  const selDay = days.find((d) => d.day === sel) ?? null;
  const selIdx = days.findIndex((d) => d.day === sel);
  const choose = (day: string) => {
    setSel(day);
    setJumpAt(dayStartMs(day));
    const j = jalaliOf(dayStartMs(day));
    const idx = months.findIndex((m) => m.jy === j.jy && m.jm === j.jm);
    if (idx >= 0) setMi(idx);
  };

  const N = jalaliMonthLength(month.jy, month.jm);
  const R = 120, C = 160;

  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="سفر در زمان" subtitle="هر ستاره یک روز است؛ درخشش بیشتر یعنی گفتگوی بیشتر" />

      {/* month navigation */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMi((i) => Math.max(0, i - 1))} disabled={mi === 0} aria-label="ماه قبل" className="glass rounded-full p-2 disabled:opacity-30"><ChevronRight className="size-5" /></button>
        <div className="flex gap-1 overflow-x-auto px-2">
          {months.map((m, i) => (
            <button key={`${m.jy}-${m.jm}`} type="button" onClick={() => setMi(i)} aria-current={i === mi} className="shrink-0 rounded-full px-3 py-1 text-xs aria-[current=true]:bg-love aria-[current=true]:text-primary-foreground">
              {JALALI_MONTHS[m.jm - 1]}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setMi((i) => Math.min(months.length - 1, i + 1))} disabled={mi === months.length - 1} aria-label="ماه بعد" className="glass rounded-full p-2 disabled:opacity-30"><ChevronLeft className="size-5" /></button>
      </div>

      {/* orbit */}
      <div key={`${month.jy}-${month.jm}`} className="anim-rise relative mx-auto mt-4 aspect-square w-full max-w-[360px]">
        <svg viewBox="0 0 320 320" className="h-full w-full" role="group" aria-label={`روزهای ${JALALI_MONTHS[month.jm - 1]} ${month.jy}`}>
          <defs>
            <radialGradient id="core"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx={C} cy={C} r={70} fill="url(#core)" />
          <g className="anim-orbit" style={{ transformOrigin: "160px 160px" }}>
            <circle cx={C} cy={C} r={R + 22} fill="none" stroke="var(--border)" strokeDasharray="2 6" />
          </g>
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--border)" />
          {Array.from({ length: N }, (_, i) => {
            const jd = i + 1;
            const d = month.days.get(jd);
            const a = (i / N) * Math.PI * 2 - Math.PI / 2;
            const x = C + R * Math.cos(a), y = C + R * Math.sin(a);
            const r = d ? 2.5 + 8 * Math.sqrt(d.total / max) : 1.5;
            const mShare = d && d.total ? d.M / d.total : 0;
            const isSel = d && d.day === sel;
            return (
              <g key={jd} role={d ? "button" : undefined} tabIndex={d ? 0 : -1} aria-label={d ? `${fa(jd)} ${JALALI_MONTHS[month.jm - 1]}: ${fa(d.total)} پیام` : undefined}
                onClick={() => d && choose(d.day)} onKeyDown={(e) => { if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); choose(d.day); } }}
                className={d ? "cursor-pointer outline-none" : ""}>
                {isSel && <circle cx={x} cy={y} r={r + 7} fill="none" stroke="var(--gold)" className="anim-pulse" style={{ transformOrigin: `${x}px ${y}px` }} />}
                <circle cx={x} cy={y} r={r} fill="var(--elisa)" opacity={d ? 0.95 : 0.25} />
                {d && <circle cx={x} cy={y} r={r} fill="var(--mahan)" opacity={mShare} />}
                {jd % 5 === 1 && <text x={C + (R - 20) * Math.cos(a)} y={C + (R - 20) * Math.sin(a) + 3} textAnchor="middle" fontSize="8" fill="var(--muted-foreground)">{fa(jd)}</text>}
              </g>
            );
          })}
          <text x={C} y={C - 6} textAnchor="middle" fontSize="20" fill="var(--foreground)" fontFamily="var(--font-display)">{JALALI_MONTHS[month.jm - 1]}</text>
          <text x={C} y={C + 14} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{fa(month.jy)} · {fa(month.total)} پیام</text>
        </svg>
      </div>
      <div className="mt-1 flex justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-mahan" /> ماهان</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-elisa" /> الیسا</span>
      </div>

      {/* time-travel slider with histogram */}
      <section className="glass mt-4 rounded-3xl p-4" aria-label="اسلایدر سفر در زمان">
        <svg viewBox={`0 0 ${days.length} 40`} preserveAspectRatio="none" className="h-12 w-full -scale-x-100" aria-hidden>
          {days.map((d, i) => (
            <rect key={d.day} x={i} y={40 - (d.total / max) * 40} width={0.8} height={(d.total / max) * 40} fill={i === selIdx ? "var(--gold)" : "var(--accent)"} opacity={i === selIdx ? 1 : 0.55} />
          ))}
        </svg>
        <input type="range" min={0} max={days.length - 1} value={Math.max(0, selIdx)} onChange={(e) => choose(days[+e.target.value]!.day)} aria-label="روز" aria-valuetext={selDay ? fmtDate(dayStartMs(selDay.day)) : ""} className="w-full accent-[var(--accent)]" />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{fmtDate(dayStartMs(days[0]!.day))}</span>
          <span>{fmtDate(dayStartMs(days[days.length - 1]!.day))}</span>
        </div>
      </section>

      {selDay && (
        <section key={selDay.day} className="glass anim-rise mt-4 rounded-3xl p-4" aria-live="polite">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">{fmtDate(dayStartMs(selDay.day))}</h2>
            <span className="text-xs text-muted-foreground">{fa(selDay.total)} پیام · ماهان {fa(selDay.M)} · الیسا {fa(selDay.E)}</span>
          </div>
          <HourWheel day={selDay} onHour={(h) => navigate({ to: "/timeline", search: { at: dayStartMs(selDay.day) + h * 3600000 } })} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/replay" search={{ from: dayStartMs(selDay.day), to: dayStartMs(selDay.day) + DAY_MS - 1, title: fmtDate(dayStartMs(selDay.day)), kind: "day" }} className="flex items-center gap-1 rounded-full bg-love px-4 py-2 text-sm text-primary-foreground"><Play className="size-4" /> پخش این روز</Link>
            <Link to="/timeline" search={{ at: dayStartMs(selDay.day) }} className="rounded-full border border-border px-4 py-2 text-sm">در تایم‌لاین</Link>
          </div>
        </section>
      )}

      <section className="glass mt-4 rounded-3xl p-4">
        <h2 className="mb-2 font-bold">پرش به تاریخ و ساعت دقیق</h2>
        <JalaliDateTimeInput label="تاریخ و ساعت (شمسی، وقت تهران)" value={jumpAt} onChange={setJumpAt} />
        <button type="button" onClick={() => navigate({ to: "/timeline", search: { at: jumpAt } })} className="mt-3 rounded-full bg-love px-5 py-2 text-sm text-primary-foreground">برو</button>
      </section>
    </main>
  );
}

function HourWheel({ day, onHour }: { day: DayStat; onHour: (h: number) => void }) {
  const mx = Math.max(1, ...day.hours);
  const C = 90;
  return (
    <svg viewBox="0 0 180 180" className="mx-auto mt-3 h-44 w-44" role="group" aria-label="ساعت‌های روز">
      {day.hours.map((n, h) => {
        const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
        const len = 8 + (n / mx) * 50;
        const x1 = C + 30 * Math.cos(a), y1 = C + 30 * Math.sin(a);
        const x2 = C + (30 + len) * Math.cos(a), y2 = C + (30 + len) * Math.sin(a);
        return (
          <g key={h} role="button" tabIndex={0} aria-label={`ساعت ${fa(h)}: ${fa(n)} پیام`} onClick={() => onHour(h)} onKeyDown={(e) => e.key === "Enter" && onHour(h)} className="cursor-pointer outline-none">
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={n ? "var(--accent)" : "var(--border)"} strokeWidth={5} strokeLinecap="round" opacity={n ? 0.4 + 0.6 * (n / mx) : 1} />
            {h % 6 === 0 && <text x={C + 22 * Math.cos(a)} y={C + 22 * Math.sin(a) + 3} textAnchor="middle" fontSize="8" fill="var(--muted-foreground)">{fa(h)}</text>}
          </g>
        );
      })}
    </svg>
  );
}
