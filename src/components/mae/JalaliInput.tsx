import { useEffect, useState } from "react";
import { JALALI_MONTHS, fa, jalaliMonthLength, jalaliOf, jalaliToUtc } from "@/lib/mae/time";

const field = "rounded-xl border border-input bg-background/60 px-2 py-1.5 text-sm tabular-nums";

/** Jalali date + time input (Asia/Tehran). Emits UTC ms. */
export function JalaliDateTimeInput({ value, onChange, label, withTime = true }: { value: number; onChange: (ms: number) => void; label: string; withTime?: boolean }) {
  const [v, setV] = useState(() => jalaliOf(value));
  useEffect(() => setV(jalaliOf(value)), [value]);
  const upd = (p: Partial<typeof v>) => {
    const n = { ...v, ...p };
    n.jd = Math.min(Math.max(1, n.jd || 1), jalaliMonthLength(n.jy, n.jm));
    setV(n);
    if (n.jy > 1300 && n.jy < 1500) onChange(jalaliToUtc(n.jy, n.jm, n.jd, n.h || 0, n.mi || 0, 0));
  };
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="mb-1 w-full text-xs text-muted-foreground">{label}</legend>
      <input aria-label="روز" type="number" min={1} max={31} value={v.jd} onChange={(e) => upd({ jd: +e.target.value })} className={`${field} w-14`} />
      <select aria-label="ماه" value={v.jm} onChange={(e) => upd({ jm: +e.target.value })} className={field}>
        {JALALI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <input aria-label="سال" type="number" value={v.jy} onChange={(e) => upd({ jy: +e.target.value })} className={`${field} w-20`} />
      {withTime && (
        <span className="flex items-center gap-1" dir="ltr">
          <input aria-label="ساعت" type="number" min={0} max={23} value={v.h} onChange={(e) => upd({ h: Math.min(23, Math.max(0, +e.target.value)) })} className={`${field} w-14`} />
          :
          <input aria-label="دقیقه" type="number" min={0} max={59} value={v.mi} onChange={(e) => upd({ mi: Math.min(59, Math.max(0, +e.target.value)) })} className={`${field} w-14`} />
        </span>
      )}
      <span className="w-full text-[11px] text-muted-foreground">{fa(v.jd)} {JALALI_MONTHS[v.jm - 1]} {fa(v.jy)}{withTime ? ` · ${fa(String(v.h).padStart(2, "0"))}:${fa(String(v.mi).padStart(2, "0"))}` : ""} (وقت تهران)</span>
    </fieldset>
  );
}
