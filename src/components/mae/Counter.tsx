import { useEffect, useState } from "react";
import { elapsedJalali, fa, fmtDateTime } from "@/lib/mae/time";
import { useStore } from "@/lib/mae/store";

function Unit({ v, label }: { v: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span key={v} className="anim-flip font-display text-3xl tabular-nums sm:text-4xl">{fa(v)}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

export function LiveCounter() {
  const start = useStore((s) => s.settings.startMs);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const e = now != null ? elapsedJalali(start, now) : null;
  return (
    <section aria-labelledby="counter-title" className="glass anim-rise relative overflow-hidden rounded-3xl p-5">
      <div aria-hidden className="anim-pulse absolute -top-16 -left-16 size-48 rounded-full bg-elisa/20 blur-3xl" />
      <div aria-hidden className="anim-pulse absolute -bottom-16 -right-16 size-48 rounded-full bg-mahan/20 blur-3xl" />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <h2 id="counter-title" className="font-display text-2xl">چند وقته با همیم؟</h2>
          <p className="mt-1 text-xs text-muted-foreground">از تاریخ شروع ({fmtDateTime(start)}) تا همین الان، به وقت تهران</p>
        </div>
      </div>
      {e ? (
        <>
          <div className="relative mt-4 flex items-baseline justify-center gap-2">
            <span className="font-display text-6xl text-love anim-shimmer">{fa(e.totalDays)}</span>
            <span className="text-lg">روز</span>
          </div>
          <div className="relative mt-4 grid grid-cols-6 gap-1" aria-live="off">
            <Unit v={e.years} label="سال" />
            <Unit v={e.months} label="ماه" />
            <Unit v={e.days} label="روز" />
            <Unit v={e.hours} label="ساعت" />
            <Unit v={e.minutes} label="دقیقه" />
            <Unit v={e.seconds} label="ثانیه" />
          </div>
          <p className="sr-only">{`${e.totalDays} روز گذشته است`}</p>
        </>
      ) : (
        <div className="mt-4 h-28" />
      )}
    </section>
  );
}
