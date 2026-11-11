import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Cake, Dices, Gift, Heart, Sparkles, History, PartyPopper, Plus } from "lucide-react";
import { useStore, type EventKind } from "@/lib/mae/store";
import { LiveCounter } from "@/components/mae/Counter";
import { dayKey, dayStartMs, fa, fmtDate, fmtDateTime, fmtTime } from "@/lib/mae/time";
import { pickRandomSession, sliceRange } from "@/lib/mae/analysis";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "M AND E · خانه‌ی خاطره‌ها" },
      {
        name: "description",
        content: "دفتر خاطرات کیهانی ماهان و الیسا: روز اول ما، شمارنده‌ی زنده و سفر در زمان.",
      },
      { property: "og:title", content: "M AND E" },
      { property: "og:description", content: "دفتر خاطرات کیهانی ماهان و الیسا" },
    ],
  }),
  component: Home,
});

const BIRTHDAY_SLOTS: { kind: EventKind; title: string; icon: typeof Cake }[] = [
  { kind: "bd-mahan", title: "تولد ماهان", icon: Cake },
  { kind: "bd-elisa", title: "تولد الیسا", icon: Cake },
  { kind: "mahan-celebrates", title: "روزی که ماهان تولد الیسا را جشن گرفت", icon: PartyPopper },
  { kind: "elisa-greets", title: "روزی که الیسا تولد ماهان را جشن گرفت", icon: Gift },
];

function Home() {
  const status = useStore((s) => s.status);
  const messages = useStore((s) => s.messages);
  const sessions = useStore((s) => s.sessions);
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const navigate = useNavigate();

  const sources = useStore((s) => s.sources);
  const firstSrc = sources.find((x) => x.id === settings.firstSourceId) ?? null;
  const midnight = dayStartMs(dayKey(settings.firstTo));
  const firstMsgs = firstSrc
    ? sliceRange(messages, settings.firstFrom, settings.firstTo).filter((m) => m.s === firstSrc.id)
    : [];
  const pre = firstMsgs.filter((m) => m.t < midnight).length;
  const post = firstMsgs.length - pre;
  const began = sessions.length
    ? { from: sessions[0]!.from, to: sessions[Math.min(2, sessions.length - 1)]!.to }
    : null;

  const randomMemory = () => {
    const s = pickRandomSession(sessions);
    if (s)
      navigate({
        to: "/replay",
        search: { from: s.from, to: s.to, title: "یک خاطره‌ی تصادفی", kind: "random" },
      });
  };

  if (status === "loading") {
    return (
      <main className="mx-auto flex min-h-[60dvh] max-w-3xl items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="text-sm text-muted-foreground">در حال بارگذاری خاطره‌ها…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pt-8">
      <header className="anim-rise flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.3em] text-muted-foreground" dir="ltr">
            M · AND · E
          </p>
          <h1 className="font-display text-4xl text-love">ماهان و الیسا</h1>
        </div>
        <div className="relative size-16" aria-hidden>
          <div className="anim-orbit absolute inset-0">
            <span className="absolute top-0 left-1/2 size-4 -translate-x-1/2 rounded-full bg-mahan glow-mahan" />
            <span className="absolute bottom-0 left-1/2 size-4 -translate-x-1/2 rounded-full bg-elisa glow-elisa" />
          </div>
          <Heart className="absolute inset-0 m-auto size-5 text-accent" />
        </div>
      </header>
      {/* Featured, pinned first memory */}
      <section
        aria-labelledby="first-day"
        className="relative mt-6 overflow-hidden rounded-3xl border border-accent/40 p-[1px] anim-rise"
      >
        <div className="bg-love anim-shimmer absolute inset-0 opacity-60" aria-hidden />
        <div className="relative rounded-3xl bg-background/85 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-xs text-gold">
            <Sparkles className="size-4" /> خاطره‌ی سنجاق‌شده
          </div>
          <h2 id="first-day" className="mt-2 font-display text-4xl">
            روز اول ما
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            شب {fmtDate(midnight - 1)} تا بامداد {fmtDate(midnight)} — یک گفتگوی پیوسته‌ی گروهی که
            از نیمه‌شب گذشت.
          </p>
          {!firstSrc ? (
            <div className="mt-4 rounded-2xl border border-gold/40 bg-gold/10 p-3 text-xs">
              <p className="font-bold text-gold">منبع شب اول هنوز انتخاب نشده</p>
              <p className="mt-1 text-muted-foreground">
                آرشیوها از Supabase دریافت می‌شوند. برای پخش شب اول، منبع گفتگوی گروهی را از تنظیم
                خاطره‌ها انتخاب کن.
              </p>
              <div className="mt-2">
                <Link to="/memories" className="rounded-full border border-border px-3 py-1">
                  انتخاب منبع شب اول
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-mahan/10 p-3">
                  <div className="text-muted-foreground">پیش از ۰۰:۰۰</div>
                  <div className="mt-1 font-bold">
                    {pre ? `${fa(pre)} پیام` : "در این آرشیو نیست"}
                  </div>
                </div>
                <div className="rounded-2xl bg-elisa/10 p-3">
                  <div className="text-muted-foreground">پس از ۰۰:۰۰</div>
                  <div className="mt-1 font-bold">
                    {post ? `${fa(post)} پیام` : "در این آرشیو نیست"}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                منبع: {firstSrc.label} · پوشش آرشیو: {fmtDateTime(firstSrc.from)} تا{" "}
                {fmtDateTime(firstSrc.to)}
              </p>
            </>
          )}
          <Link
            to="/replay"
            search={{
              from: settings.firstFrom,
              to: settings.firstTo,
              title: "روز اول ما",
              kind: "first",
              src: firstSrc?.id,
            }}
            disabled={!firstSrc}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-love px-6 py-2.5 font-bold text-primary-foreground shadow-lg aria-disabled:opacity-40"
          >
            ▶ پخش خاطره
          </Link>
        </div>
      </section>

      <div className="mt-6">
        <LiveCounter />
      </div>

      <h2 className="mt-8 mb-3 font-display text-2xl">خاطره‌ها</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <MemoryCard
          title="چطور شروع شد"
          sub={began ? `${fmtDate(began.from)} · نخستین گفتگوهای آرشیو` : "بعد از وارد کردن آرشیو"}
          icon={History}
          badge="تأییدشده از آرشیو"
          to={
            began
              ? { from: began.from, to: began.to, title: "چطور شروع شد", kind: "began" }
              : undefined
          }
        />
        <button
          type="button"
          onClick={randomMemory}
          disabled={!sessions.length}
          className="glass rounded-3xl p-4 text-start transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          <Dices className="size-6 text-gold" />
          <div className="mt-2 font-bold">خاطره‌ی تصادفی</div>
          <div className="text-xs text-muted-foreground">
            یک گفتگوی واقعی از آرشیو، هر بار یکی دیگر
          </div>
        </button>
        {BIRTHDAY_SLOTS.map((b) => {
          const ev = events.find((e) => e.kind === b.kind);
          return (
            <MemoryCard
              key={b.kind}
              title={b.title}
              icon={b.icon}
              sub={
                ev?.unavailable
                  ? "در پیام‌ها موجود نیست"
                  : ev
                    ? b.kind === "elisa-greets"
                      ? "۱۰ مهر ۱۴۰۵ · ساعت ۰۰:۳۳"
                      : fmtDate(ev.from)
                    : "هنوز تاریخ تأیید نشده"
              }
              badge={
                ev?.unavailable
                  ? "رویداد ثبت‌شده بدون پیام"
                  : ev
                    ? "تأییدشده توسط شما"
                    : "نیاز به تنظیم"
              }
              to={
                ev && !ev.unavailable
                  ? { from: ev.from, to: ev.to, title: b.title, kind: b.kind }
                  : undefined
              }
              setup={!ev}
            />
          );
        })}
        {events
          .filter((e) => e.kind === "custom")
          .map((e) => (
            <MemoryCard
              key={e.id}
              title={e.title}
              icon={Sparkles}
              sub={`${fmtDate(e.from)} · ${fmtTime(e.from)}`}
              badge="خاطره‌ی شخصی"
              to={{ from: e.from, to: e.to, title: e.title, kind: "custom" }}
            />
          ))}
        <Link
          to="/memories"
          className="flex items-center justify-center gap-2 rounded-3xl border border-dashed border-border p-4 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" /> تنظیم تاریخ‌ها و افزودن خاطره
        </Link>
      </div>

      <div className="mt-8 flex flex-wrap gap-2 text-sm">
        <Link to="/chat" search={{ u: "", at: 0 }} className="glass rounded-full px-4 py-2">
          چت یکپارچه
        </Link>
        <Link to="/import" className="glass rounded-full px-4 py-2">
          مدیریت و ورود آرشیو
        </Link>
        <Link to="/theme" className="glass rounded-full px-4 py-2">
          تم و رنگ‌ها · تعویض کاربر
        </Link>
      </div>
      <p className="mt-6 pb-4 text-center text-[11px] text-muted-foreground">
        آرشیو خاطرات فقط روی همین دستگاه می‌ماند و جایی ارسال نمی‌شود.
      </p>
    </main>
  );
}

function MemoryCard({
  title,
  sub,
  icon: Icon,
  badge,
  to,
  setup,
}: {
  title: string;
  sub: string;
  icon: typeof Cake;
  badge: string;
  to?: { from: number; to: number; title: string; kind: string } | undefined;
  setup?: boolean | undefined;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <Icon className="size-6 text-accent" />
        <span
          className={
            setup
              ? "rounded-full border border-gold/40 px-2 py-0.5 text-[10px] text-gold"
              : "rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary"
          }
        >
          {badge}
        </span>
      </div>
      <div className="mt-2 font-bold">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </>
  );
  const cls = "glass block rounded-3xl p-4 transition-transform hover:-translate-y-0.5";
  if (to)
    return (
      <Link to="/replay" search={to} className={cls}>
        {inner}
      </Link>
    );
  return (
    <Link to="/memories" className={cls}>
      {inner}
    </Link>
  );
}
