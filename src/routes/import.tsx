import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Trash2, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { confirmAllSides, importFiles, setSide, useStore, wipeAll, type ImportReport } from "@/lib/mae/store";
import { fa, fmtDate } from "@/lib/mae/time";
import { PageHeader } from "@/components/mae/Nav";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "M AND E · وارد کردن آرشیو" },
      { name: "description", content: "وارد کردن خروجی گفتگوها، فقط روی همین دستگاه" },
      { property: "og:title", content: "M AND E · وارد کردن آرشیو" },
      { property: "og:description", content: "پردازش محلی خروجی گفتگوها" },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  const sources = useStore((s) => s.sources);
  const sides = useStore((s) => s.sides);
  const total = useStore((s) => s.messages.length);
  const [busy, setBusy] = useState<string | null>(null);
  const [reports, setReports] = useState<ImportReport[]>([]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("شروع…");
    try { setReports(await importFiles([...files], setBusy)); } finally { setBusy(null); }
  };
  const unconfirmed = Object.values(sides).some((s) => !s.confirmed);

  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="آرشیو گفتگوها" subtitle="روبیکا و تلگرام · پردازش کاملاً روی همین دستگاه" />
      <div className="glass flex items-start gap-3 rounded-3xl p-4 text-sm">
        <ShieldCheck className="size-5 shrink-0 text-primary" />
        <p>فایل‌ها از این دستگاه خارج نمی‌شوند: نه به سرور، نه به هوش مصنوعی. فیلدهای حساس روبیکا (شناسه و کلید دسترسی فایل‌ها) هنگام خواندن حذف می‌شوند.</p>
      </div>

      <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-accent/40 p-8 text-center transition-colors hover:bg-accent/5">
        <Upload className="size-8 text-accent" />
        <span className="font-bold">انتخاب فایل‌های JSON</span>
        <span className="text-xs text-muted-foreground">می‌توانی هر سه فایل را با هم انتخاب کنی. وارد کردن دوباره، همان منبع را جایگزین می‌کند.</span>
        <input type="file" accept=".json,application/json" multiple className="sr-only" disabled={!!busy} onChange={(e) => onFiles(e.target.files)} />
      </label>
      {busy && <p className="mt-3 text-center text-sm text-primary" role="status">{busy}</p>}
      {reports.map((r) => (
        <p key={r.fileName} className="mt-2 flex items-center gap-2 text-sm">
          {r.ok ? <CheckCircle2 className="size-4 text-primary" /> : <AlertTriangle className="size-4 text-destructive" />}
          <span className="truncate" dir="auto">{r.fileName}</span>: {r.message}
        </p>
      ))}

      {sources.length > 0 && (
        <>
          <h2 className="mt-8 mb-2 font-display text-2xl">منابع ({fa(total.toLocaleString("en"))} پیام)</h2>
          <div className="grid gap-3">
            {sources.map((s) => (
              <div key={s.id} className="glass rounded-3xl p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{fa(s.count)} پیام · {fmtDate(s.from)} تا {fmtDate(s.to)}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground" dir="auto">{s.fileName}</p>
                <div className="mt-3 space-y-2">
                  {s.senders.map((sn) => {
                    const e = sides[sn.key];
                    return (
                      <div key={sn.key} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-background/40 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm" dir="auto">{sn.name} <span className="text-xs text-muted-foreground">({fa(sn.count)})</span></div>
                          {!e?.confirmed && <div className="text-[11px] text-gold">{e?.reason || "حدس"} — لطفاً تأیید کن</div>}
                        </div>
                        <div role="radiogroup" aria-label="کدام طرف؟" className="flex gap-1">
                          {(["M", "E"] as const).map((side) => (
                            <button key={side} type="button" role="radio" aria-checked={e?.side === side} onClick={() => setSide(sn.key, side)}
                              className={`rounded-full border px-3 py-1 text-xs ${e?.side === side ? (side === "M" ? "border-mahan bg-mahan/20" : "border-elisa bg-elisa/20") : "border-border"}`}>
                              {side === "M" ? "ماهان" : "الیسا"}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {unconfirmed && (
            <button type="button" onClick={confirmAllSides} className="mt-4 w-full rounded-full bg-love py-2.5 font-bold text-primary-foreground">تأیید همه‌ی فرستنده‌ها</button>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/" className="glass rounded-full px-4 py-2 text-sm">رفتن به خانه</Link>
            <button type="button" onClick={() => { if (confirm("همه‌ی داده‌های این دستگاه پاک شود؟")) wipeAll(); }} className="flex items-center gap-1 rounded-full border border-destructive/50 px-4 py-2 text-sm text-destructive">
              <Trash2 className="size-4" /> پاک کردن همه‌چیز از این دستگاه
            </button>
          </div>
        </>
      )}
    </main>
  );
}
