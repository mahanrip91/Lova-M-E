import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, ShieldCheck } from "lucide-react";
import { useStore } from "@/lib/mae/store";
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

  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="آرشیو یکپارچه" subtitle="روبیکا و تلگرام · Supabase" />
      <div className="glass flex items-start gap-3 rounded-3xl p-4 text-sm">
        <ShieldCheck className="size-5 shrink-0 text-primary" />
        <p>
          این صفحه وضعیت آرشیو مرکزی را نشان می‌دهد. برای دریافت پیام‌ها نیازی به آپلود فایل نیست.
        </p>
      </div>
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
