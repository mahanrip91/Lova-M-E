import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Database, LoaderCircle, ShieldCheck, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { importAssassinsArchiveFile, useStore } from "@/lib/mae/store";
import { fa, fmtDate } from "@/lib/mae/time";
import { PageHeader } from "@/components/mae/Nav";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "M AND E · آرشیو یکپارچه" },
      { name: "description", content: "نمایش آرشیو همگام‌شده از Supabase" },
    ],
  }),
  component: ArchivePage,
});

function ArchivePage() {
  const status = useStore((s) => s.status);
  const sources = useStore((s) => s.sources);
  const sides = useStore((s) => s.sides);
  const messages = useStore((s) => s.messages);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState("");
  const [uploadError, setUploadError] = useState("");

  async function handleArchiveFile(file?: File) {
    if (!file || uploading) return;
    setUploading(true);
    setProgress("در حال آماده‌سازی…");
    setResult("");
    setUploadError("");
    try {
      const imported = await importAssassinsArchiveFile(file, setProgress);
      setResult(`با موفقیت ${imported.count.toLocaleString("fa-IR")} پیام به آرشیو مرکزی اضافه شد.`);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "افزودن آرشیو ناموفق بود.");
    } finally {
      setUploading(false);
      setProgress("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="آرشیو یکپارچه" subtitle="روبیکا و تلگرام · Supabase" />
      <div className="glass flex items-start gap-3 rounded-3xl p-4 text-sm">
        <ShieldCheck className="size-5 shrink-0 text-primary" />
        <p>
          این صفحه وضعیت آرشیو مرکزی را نشان می‌دهد. برای دریافت پیام‌ها نیازی به آپلود فایل نیست.
        </p>
      </div>
      <section className="glass relative mt-5 overflow-hidden rounded-3xl p-5">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
            <UploadCloud className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-[0.2em] text-accent" dir="ltr">SPECIAL ARCHIVE · 01</p>
            <h2 className="mt-1 font-display text-xl">شب Assassin’s Creed</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ۲۶ فروردین ۱۴۰۵ · ساعت ۰۳:۲۹ تا ۰۵:۰۷ · خروجی کامل گروه
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-mahan/10 p-3">
                <div className="text-lg font-bold text-mahan">۱۶۷</div>
                <div className="text-xs text-muted-foreground">پیام ماهان</div>
              </div>
              <div className="rounded-2xl bg-elisa/10 p-3">
                <div className="text-lg font-bold text-elisa">۱۱۲</div>
                <div className="text-xs text-muted-foreground">پیام @Al_00_1387</div>
              </div>
              <div className="rounded-2xl bg-background/55 p-3">
                <div className="text-lg font-bold">۹</div>
                <div className="text-xs text-muted-foreground">پیام ربات</div>
              </div>
              <div className="rounded-2xl bg-background/55 p-3">
                <div className="text-lg font-bold">۲</div>
                <div className="text-xs text-muted-foreground">رویداد سیستمی</div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              همهٔ ۲۹۰ پیام با ترتیب، زمان دقیق، پاسخ‌ها و اطلاعات پایهٔ پیوست‌ها نگه داشته می‌شوند.
              این منبع فقط یک‌بار ثبت می‌شود و اجرای دوباره، پیام تکراری نمی‌سازد.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => void handleArchiveFile(event.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-love px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.01] disabled:opacity-60"
            >
              {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
              {uploading ? "در حال افزودن آرشیو…" : "انتخاب فایل و افزودن به M AND E"}
            </button>
            {progress && <p className="mt-3 text-xs text-muted-foreground">{progress}</p>}
            {result && <p className="mt-3 flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="size-4 shrink-0" />{result}</p>}
            {uploadError && <p className="mt-3 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4 shrink-0" />{uploadError}</p>}
          </div>
        </div>
      </section>
      <section className="mt-6 rounded-3xl border border-accent/30 p-5">
        <div className="flex items-center gap-2">
          <Database className="size-5 text-accent" />
          <h2 className="font-display text-xl">وضعیت همگام‌سازی</h2>
        </div>
        <p className="mt-3 text-sm">
          {status === "loading"
            ? "در حال بارگذاری آرشیو…"
            : status === "ready"
              ? "آرشیو آماده و در حافظهٔ محلی ذخیره شده است."
              : "هنوز آرشیوی در حافظهٔ این دستگاه بارگذاری نشده است."}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {fa(messages.length.toLocaleString("en"))} پیام · {fa(sources.length)} منبع
        </p>
      </section>
      {sources.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 font-display text-2xl">منابع آرشیو</h2>
          <div className="grid gap-3">
            {sources.map((source) => (
              <section key={source.id} className="glass rounded-3xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{source.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {fa(source.count)} پیام · {fmtDate(source.from)} تا {fmtDate(source.to)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {source.kind === "rubika" ? "روبیکا" : "تلگرام"}
                  {source.isGroup ? " · گروهی" : " · خصوصی"}
                </p>
                <div className="mt-3 space-y-2">
                  {source.senders.map((sender) => {
                    const side = sides[sender.key];
                    return (
                      <div
                        key={sender.key}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-background/40 px-3 py-2"
                      >
                        <span className="text-sm" dir="auto">
                          {sender.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fa(sender.count)} پیام ·
                          {side?.side === "M"
                            ? " ماهان"
                            : side?.side === "E"
                              ? " الیسا"
                              : " عضو دیگر"}
                          {side?.confirmed ? " · تأییدشده" : " · تأییدنشده"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      <div className="mt-8 flex flex-wrap gap-2 pb-6">
        <Link to="/" className="glass rounded-full px-4 py-2 text-sm">
          بازگشت به خانه
        </Link>
        <Link to="/chat" search={{ u: "", at: 0 }} className="glass rounded-full px-4 py-2 text-sm">
          گفتگوی زنده
        </Link>
      </div>
    </main>
  );
}
