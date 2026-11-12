import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Sparkles } from "lucide-react";
import {
  JALALI_MONTHS,
  fa,
  jalaliMonthLength,
  jalaliOf,
  jalaliToUtc,
  toGregorian,
} from "@/lib/mae/time";

type Props = {
  value: number | null;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  min?: number | undefined;
};

const WEEK = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export function JalaliDateTimePicker({
  value,
  onChange,
  label,
  placeholder = "انتخاب تاریخ و ساعت",
  min,
}: Props) {
  const initial = value ?? Date.now();
  const initialParts = jalaliOf(initial);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(initialParts.jy);
  const [month, setMonth] = useState(initialParts.jm);
  const [day, setDay] = useState(initialParts.jd);
  const [hour, setHour] = useState(initialParts.h);
  const [minute, setMinute] = useState(initialParts.mi);

  useEffect(() => {
    if (!open) return;
    const parts = jalaliOf(value ?? Date.now());
    setYear(parts.jy);
    setMonth(parts.jm);
    setDay(parts.jd);
    setHour(parts.h);
    setMinute(parts.mi);
  }, [open, value]);

  const monthDays = jalaliMonthLength(year, month);
  const firstGregorian = toGregorian(year, month, 1);
  const saturdayOffset =
    (new Date(Date.UTC(firstGregorian.gy, firstGregorian.gm - 1, firstGregorian.gd)).getUTCDay() +
      1) %
    7;
  const cells = useMemo(
    () => [...Array(saturdayOffset).fill(0), ...Array.from({ length: monthDays }, (_, i) => i + 1)],
    [saturdayOffset, monthDays],
  );
  const shown = value ? jalaliOf(value) : null;
  const display = shown
    ? `${fa(shown.jd)} ${JALALI_MONTHS[shown.jm - 1]} ${fa(shown.jy)} · ${fa(String(shown.h).padStart(2, "0"))}:${fa(String(shown.mi).padStart(2, "0"))}`
    : placeholder;

  function shiftMonth(delta: number) {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear--;
    }
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    setMonth(nextMonth);
    setYear(nextYear);
    setDay((current) => Math.min(current, jalaliMonthLength(nextYear, nextMonth)));
  }

  function confirm() {
    const next = jalaliToUtc(year, month, day, hour, minute);
    if (min != null && next < min) return;
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="relative min-w-0">
      {label && <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{label}</p>}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="group flex min-h-12 w-full items-center gap-2.5 rounded-2xl border border-love/25 bg-gradient-to-br from-love/10 via-background/80 to-primary/10 px-3 py-2 text-right shadow-[inset_0_1px_0_rgba(255,255,255,.06)] transition hover:border-love/55 hover:shadow-[0_0_22px_var(--tint-me)]"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-love/20 bg-love/15 text-love shadow-inner">
          <CalendarDays className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{display}</span>
        <Sparkles className="size-3.5 shrink-0 text-love/70 transition group-hover:rotate-12" />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+0.55rem)] z-[80] overflow-hidden rounded-[1.65rem] border border-love/30 bg-[linear-gradient(145deg,color-mix(in_oklch,var(--background)_96%,var(--primary)),color-mix(in_oklch,var(--background)_90%,var(--love)))] p-3 shadow-[0_22px_70px_rgba(0,0,0,.55),0_0_35px_var(--tint-me)] backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-love/15 bg-love/10 p-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="grid size-9 place-items-center rounded-xl border border-love/15 bg-background/60 text-love"
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="text-center">
              <p className="font-display text-base font-bold text-love">
                {JALALI_MONTHS[month - 1]}
              </p>
              <p className="text-[10px] tracking-widest text-muted-foreground">
                {fa(year)} · تقویم خورشیدی
              </p>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="grid size-9 place-items-center rounded-xl border border-love/15 bg-background/60 text-love"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEK.map((name) => (
              <span key={name} className="py-1 text-center text-[10px] font-bold text-love/80">
                {name}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, index) => {
              if (!date) return <span key={`empty-${index}`} />;
              const stamp = jalaliToUtc(year, month, date, hour, minute);
              const disabled = min != null && stamp < min;
              const selected = date === day;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={disabled}
                  onClick={() => setDay(date)}
                  className={`aspect-square rounded-xl text-xs font-semibold transition ${selected ? "bg-love text-primary-foreground shadow-[0_0_16px_var(--tint-me)]" : "border border-white/5 bg-background/45 hover:border-love/35 hover:bg-love/10"} disabled:opacity-20`}
                >
                  {fa(date)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 rounded-2xl border border-love/20 bg-background/45 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-love">
              <Clock3 className="size-3.5" /> ساعت دقیق
            </div>
            <div className="flex items-center justify-center gap-2" dir="ltr">
              <select
                aria-label="ساعت"
                value={hour}
                onChange={(event) => setHour(Number(event.target.value))}
                className="h-10 min-w-16 rounded-xl border border-love/25 bg-background px-2 text-center text-sm font-bold text-foreground outline-none focus:border-love"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {fa(String(i).padStart(2, "0"))}
                  </option>
                ))}
              </select>
              <span className="font-bold text-love">:</span>
              <select
                aria-label="دقیقه"
                value={minute}
                onChange={(event) => setMinute(Number(event.target.value))}
                className="h-10 min-w-16 rounded-xl border border-love/25 bg-background px-2 text-center text-sm font-bold text-foreground outline-none focus:border-love"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>
                    {fa(String(i).padStart(2, "0"))}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={min != null && jalaliToUtc(year, month, day, hour, minute) < min}
              className="flex-1 rounded-xl bg-love py-2.5 text-xs font-bold text-primary-foreground shadow-lg shadow-love/20"
            >
              ثبت زمان
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border/70 px-4 py-2.5 text-xs"
            >
              بستن
            </button>
          </div>
          <p className="mt-2 text-center text-[9px] text-muted-foreground">
            زمان انتخابی بر اساس ساعت تهران ذخیره می‌شود · تبدیل میلادی خودکار
          </p>
        </div>
      )}
    </div>
  );
}
