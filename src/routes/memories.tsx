import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { removeEvent, saveEvent, updateSettings, useStore, DEFAULT_START, type EventKind } from "@/lib/mae/store";
import { birthdayCandidates, sliceRange, type Candidate } from "@/lib/mae/analysis";
import { dayStartMs, fa, fmtDate, fmtDateTime, DAY_MS } from "@/lib/mae/time";
import { PageHeader } from "@/components/mae/Nav";
import { JalaliDateTimeInput } from "@/components/mae/JalaliInput";

export const Route = createFileRoute("/memories")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "M AND E · تنظیم خاطره‌ها" },
      { name: "description", content: "تأیید تاریخ‌های مهم، تولدها و خاطره‌های شخصی" },
      { property: "og:title", content: "M AND E · تنظیم خاطره‌ها" },
      { property: "og:description", content: "تأیید تاریخ‌های مهم و تولدها" },
    ],
  }),
  component: Memories,
});

const SLOTS: { kind: EventKind; title: string; side: "M" | "E"; hint: string }[] = [
  { kind: "bd-elisa", title: "تولد الیسا", side: "M", hint: "روزهایی که ماهان پیام تولد فرستاده" },
  { kind: "bd-mahan", title: "تولد ماهان", side: "E", hint: "روزهایی که الیسا پیام تولد فرستاده" },
  { kind: "mahan-celebrates", title: "ماهان تولد الیسا را جشن گرفت", side: "M", hint: "پیام‌های تولد از طرف ماهان" },
  { kind: "elisa-greets", title: "الیسا تولد ماهان را تبریک گفت", side: "E", hint: "پیام‌های تولد از طرف الیسا" },
];
const confLabel = { high: "اطمینان بالا", medium: "اطمینان متوسط", low: "اطمینان کم" };
const confCls = { high: "bg-primary/20 text-primary", medium: "bg-gold/20 text-gold", low: "bg-muted text-muted-foreground" };

function Memories() {
  const status = useStore((s) => s.status);
  const messages = useStore((s) => s.messages);
  const sides = useStore((s) => s.sides);
  const days = useStore((s) => s.days);
  const events = useStore((s) => s.events);
  const sources = useStore((s) => s.sources);
  const settings = useStore((s) => s.settings);
  const cands = useMemo(() => (status === "ready" ? birthdayCandidates(messages, (k) => sides[k]?.side, days) : []), [status, messages, sides, days]);
  const firstSrc = sources.find((x) => x.id === settings.firstSourceId) ?? null;
  const firstMsgs = useMemo(() => (firstSrc ? sliceRange(messages, settings.firstFrom, settings.firstTo).filter((m) => m.s === firstSrc.id) : []), [messages, settings.firstFrom, settings.firstTo, firstSrc]);
  const [custom, setCustom] = useState({ title: "", from: settings.startMs, to: settings.startMs + 3 * 3600000 });

  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="تنظیم خاطره‌ها" subtitle="هیچ تاریخی بدون تأیید تو قطعی در نظر گرفته نمی‌شود" />

      <section className="glass rounded-3xl p-4">
        <h2 className="font-bold">شروع شمارنده‌ی «چند وقته با همیم؟»</h2>
        <p className="mt-1 text-xs text-muted-foreground">پیش‌فرض: تاریخی که خودت تأیید کردی ({fmtDateTime(DEFAULT_START)}). شمارنده تا لحظه‌ی حال حساب می‌کند، نه تا آخرین پیام آرشیو.</p>
        <div className="mt-3"><JalaliDateTimeInput label="تاریخ و ساعت شروع" value={settings.startMs} onChange={(ms) => updateSettings({ startMs: ms, startConfirmed: true })} /></div>
      </section>

      <section className="glass mt-4 rounded-3xl p-4">
        <h2 className="font-bold">بازه‌ی «روز اول ما»</h2>
        <p className="mt-1 text-xs text-muted-foreground">یک گفتگوی پیوسته در گروه که از نیمه‌شب می‌گذرد. بازه و منبع هر دو قابل ویرایش‌اند. فقط پیام‌های واقعی داخل این بازه پخش می‌شوند.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <JalaliDateTimeInput label="از" value={settings.firstFrom} onChange={(ms) => updateSettings({ firstFrom: ms })} />
          <JalaliDateTimeInput label="تا" value={settings.firstTo} onChange={(ms) => updateSettings({ firstTo: ms })} />
        </div>
        <div className="mt-3">
          <label className="text-xs text-muted-foreground" htmlFor="first-src">منبع شب اول (گفتگوی گروهی)</label>
          <select id="first-src" value={settings.firstSourceId ?? ""} onChange={(e) => updateSettings({ firstSourceId: e.target.value || null })} className="mt-1 w-full rounded-xl border border-input bg-background/60 px-3 py-2 text-sm">
            <option value="">— هنوز انتخاب نشده —</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.label}{s.isGroup ? " (گروه)" : " (خصوصی)"}</option>)}
          </select>
          {!sources.some((s) => s.isGroup) && (
            <p className="mt-2 text-xs text-gold">هنوز هیچ آرشیو گروهی وارد نشده. <Link to="/import" className="text-primary underline">وارد کردن آرشیو گروه</Link></p>
          )}
        </div>
        <div className="mt-3 space-y-1 text-xs">
          {!firstSrc ? (
            <p className="text-muted-foreground">تا منبع انتخاب نشود، «روز اول ما» پیامی پخش نمی‌کند.</p>
          ) : (
            <>
              <p>{fa(firstMsgs.length)} پیامِ واقعی از «{firstSrc.label}» در این بازه{firstMsgs[0] ? ` · نخستین: ${fmtDateTime(firstMsgs[0].t)}` : ""}</p>
              <p className="text-muted-foreground">پوشش این آرشیو: {fmtDateTime(firstSrc.from)} تا {fmtDateTime(firstSrc.to)}</p>
              {firstSrc.from > settings.firstFrom && <p className="text-gold">این آرشیو از {fmtDateTime(firstSrc.from)} شروع می‌شود؛ قبل از آن پیامی در آن نیست و چیزی ساخته نمی‌شود.</p>}
            </>
          )}
          <p className="text-muted-foreground">تاریخ شروع رابطه (شمارنده) جداست و فقط توسط تو تأیید می‌شود: {fmtDateTime(settings.startMs)}</p>
        </div>
      </section>

      <h2 className="mt-8 mb-2 font-display text-2xl">تولدها و روزهای جشن</h2>
      <p className="mb-3 text-xs text-muted-foreground">پیشنهادها از کلمه‌هایی مثل «تولد» و 🎂 در آرشیو خودت، روی همین دستگاه، پیدا شده‌اند. فقط پیشنهادند.</p>
      <div className="space-y-3">
        {SLOTS.map((slot) => {
          const ev = events.find((e) => e.kind === slot.kind);
          const list = cands.filter((c) => c.side === slot.side).slice(0, 6);
          return (
            <section key={slot.kind} className="glass rounded-3xl p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold">{slot.title}</h3>
                {ev ? <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] text-primary">تأییدشده: {fmtDate(ev.from)}</span> : <span className="rounded-full border border-gold/40 px-2 py-0.5 text-[11px] text-gold">نیاز به تنظیم</span>}
              </div>
              {ev?.unavailable && <p className="mt-2 text-sm text-gold">در پیام‌ها موجود نیست</p>}
              {ev?.kind === "elisa-greets" && <p className="mt-2 text-xs text-muted-foreground">زمان تبریک تأییدشده: ۱۰ مهر ۱۴۰۵، ساعت ۰۰:۳۳؛ متن فقط از آرشیو خوانده می‌شود.</p>}
              {ev && (
                <div className="mt-2 flex gap-2">
                  {!ev.unavailable && <Link to="/replay" search={{ from: ev.from, to: ev.to, title: slot.title, kind: slot.kind }} className="rounded-full bg-love px-3 py-1 text-xs text-primary-foreground">پخش</Link>}
                  <button type="button" onClick={() => removeEvent(ev.id)} className="rounded-full border border-border px-3 py-1 text-xs">حذف تأیید</button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">{slot.hint}</p>
              <ul className="mt-2 space-y-1.5">
                {list.length === 0 && <li className="text-xs text-muted-foreground">پیشنهادی پیدا نشد.</li>}
                {list.map((c) => <CandidateRow key={c.day + c.side} c={c} onConfirm={() => confirmCandidate(slot.kind, slot.title, c)} title={slot.title} />)}
              </ul>
              <ManualDate onSave={(ms) => saveEvent({ id: slot.kind, kind: slot.kind, title: slot.title, from: dayStartMs(new Date(ms + 12600000).toISOString().slice(0, 10)), to: dayStartMs(new Date(ms + 12600000).toISOString().slice(0, 10)) + DAY_MS - 1, origin: "manual" })} />
            </section>
          );
        })}
      </div>

      <h2 className="mt-8 mb-2 font-display text-2xl">خاطره‌ی شخصی</h2>
      <section className="glass rounded-3xl p-4">
        <input value={custom.title} onChange={(e) => setCustom({ ...custom, title: e.target.value })} placeholder="نام خاطره" aria-label="نام خاطره" className="w-full rounded-xl border border-input bg-background/60 px-3 py-2 text-sm" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <JalaliDateTimeInput label="از" value={custom.from} onChange={(ms) => setCustom((c) => ({ ...c, from: ms }))} />
          <JalaliDateTimeInput label="تا" value={custom.to} onChange={(ms) => setCustom((c) => ({ ...c, to: ms }))} />
        </div>
        <button type="button" disabled={!custom.title.trim() || custom.to <= custom.from}
          onClick={() => { saveEvent({ id: crypto.randomUUID(), kind: "custom", title: custom.title.trim(), from: custom.from, to: custom.to, origin: "manual" }); setCustom({ ...custom, title: "" }); }}
          className="mt-3 rounded-full bg-love px-5 py-2 text-sm text-primary-foreground disabled:opacity-40">افزودن</button>
        <ul className="mt-3 space-y-1">
          {events.filter((e) => e.kind === "custom").map((e) => (
            <li key={e.id} className="flex items-center justify-between text-sm">
              <span>{e.title} · {fmtDate(e.from)}</span>
              <button type="button" onClick={() => removeEvent(e.id)} aria-label="حذف"><Trash2 className="size-4 text-destructive" /></button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function confirmCandidate(kind: EventKind, title: string, c: Candidate) {
  const from = dayStartMs(c.day);
  saveEvent({ id: kind, kind, title, from, to: from + DAY_MS - 1, origin: "candidate", confidence: c.confidence });
}

function CandidateRow({ c, onConfirm, title }: { c: Candidate; onConfirm: () => void; title: string }) {
  const from = dayStartMs(c.day);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-background/40 px-3 py-2 text-xs">
      <span>{fmtDate(from)} · {fa(c.matches)} پیام مرتبط از {fa(c.dayTotal)}</span>
      <span className={`rounded-full px-2 py-0.5 ${confCls[c.confidence]}`}>{confLabel[c.confidence]}</span>
      <span className="flex gap-1">
        <Link to="/replay" search={{ from, to: from + DAY_MS - 1, title: `پیش‌نمایش: ${title}`, kind: "preview" }} className="rounded-full border border-border px-2 py-0.5">پیش‌نمایش</Link>
        <button type="button" onClick={onConfirm} className="rounded-full bg-primary/20 px-2 py-0.5 text-primary">تأیید</button>
      </span>
    </li>
  );
}

function ManualDate({ onSave }: { onSave: (ms: number) => void }) {
  const [v, setV] = useState<number | null>(null);
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">وارد کردن دستی تاریخ</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <JalaliDateTimeInput label="تاریخ" withTime={false} value={v ?? DEFAULT_START} onChange={setV} />
        <button type="button" onClick={() => onSave(v ?? DEFAULT_START)} className="rounded-full bg-love px-3 py-1 text-primary-foreground">ذخیره</button>
      </div>
    </details>
  );
}
