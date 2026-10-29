import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronsDown, Orbit } from "lucide-react";
import { useStore, toggleBookmark } from "@/lib/mae/store";
import { lowerBound } from "@/lib/mae/analysis";
import { dayKey, fmtDate } from "@/lib/mae/time";
import { Bubble, DayDivider } from "@/components/mae/Bubble";

interface Search { at?: number | undefined; u?: string | undefined }

export const Route = createFileRoute("/timeline")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    at: s["at"] != null ? Number(s["at"]) : undefined,
    u: typeof s["u"] === "string" ? s["u"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "M AND E · تایم‌لاین یکپارچه" },
      { name: "description", content: "همه‌ی گفتگوها از همه‌ی منابع در یک جریان زمانی" },
      { property: "og:title", content: "M AND E · تایم‌لاین" },
      { property: "og:description", content: "همه‌ی گفتگوها در یک جریان زمانی" },
    ],
  }),
  component: Timeline,
});

function Timeline() {
  const { at, u } = Route.useSearch();
  const status = useStore((s) => s.status);
  const messages = useStore((s) => s.messages);
  const sides = useStore((s) => s.sides);
  const sources = useStore((s) => s.sources);
  const uidIndex = useStore((s) => s.uidIndex);
  const bookmarks = useStore((s) => s.bookmarks);
  const bm = useMemo(() => new Set(bookmarks), [bookmarks]);
  const srcLabel = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s.label])), [sources]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const list = useMemo(() => (hidden.size ? messages.filter((m) => !hidden.has(m.s)) : messages), [messages, hidden]);
  const parentRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const v = useVirtualizer({ count: list.length, getScrollElement: () => parentRef.current, estimateSize: () => 76, overscan: 12 });

  const target = useMemo(() => {
    if (!list.length) return -1;
    if (u) { const i = list.findIndex((m) => m.u === u); if (i >= 0) return i; }
    if (at != null) return Math.min(list.length - 1, lowerBound(list, at));
    return list.length - 1;
  }, [list, at, u]);

  useEffect(() => {
    if (target < 0) return;
    setFocus(list[target]!.u);
    requestAnimationFrame(() => v.scrollToIndex(target, { align: "center" }));
    const t = setTimeout(() => v.scrollToIndex(target, { align: "center" }), 250);
    return () => clearTimeout(t);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading") return <p className="p-8 text-center text-muted-foreground">در حال بارگذاری…</p>;
  if (status === "empty") return <p className="p-8 text-center">ابتدا آرشیو را <Link to="/import" className="text-primary underline">وارد کن</Link>.</p>;

  const items = v.getVirtualItems();
  const topMsg = list[items[0]?.index ?? 0];
  const jumpTo = (uid: string) => {
    const i = list.findIndex((m) => m.u === uid);
    if (i >= 0) { setFocus(uid); v.scrollToIndex(i, { align: "center" }); }
  };

  return (
    <main className="mx-auto flex h-[100dvh] max-w-3xl flex-col pb-24">
      <header className="z-20 mx-3 mt-3 glass rounded-2xl px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-xl">تایم‌لاین</h1>
          <span className="text-xs text-muted-foreground">{topMsg ? fmtDate(topMsg.t) : ""}</span>
          <div className="flex gap-1">
            <Link to="/explore" className="rounded-full p-2" aria-label="سفر در زمان"><Orbit className="size-4" /></Link>
            <button type="button" className="rounded-full p-2" aria-label="تازه‌ترین پیام‌های آرشیو" onClick={() => v.scrollToIndex(list.length - 1, { align: "end" })}><ChevronsDown className="size-4" /></button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {sources.map((s) => (
            <button key={s.id} type="button" aria-pressed={!hidden.has(s.id)} onClick={() => setHidden((h) => { const n = new Set(h); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] aria-pressed:bg-primary/15 aria-pressed:text-primary">
              {s.label}
            </button>
          ))}
        </div>
      </header>
      <div ref={parentRef} className="mt-2 flex-1 overflow-y-auto" role="log" aria-label="پیام‌ها">
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {items.map((it) => {
            const m = list[it.index]!;
            const prev = list[it.index - 1];
            const newDay = !prev || dayKey(prev.t) !== dayKey(m.t);
            const ri = m.r ? uidIndex.get(m.r) : undefined;
            const reply = ri != null ? messages[ri] : null;
            return (
              <div key={m.u} data-index={it.index} ref={v.measureElement} style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${it.start}px)` }}>
                {newDay && <DayDivider label={fmtDate(m.t)} />}
                <Bubble m={m} side={sides[m.k]?.side} senderName={sides[m.k]?.name} sourceLabel={srcLabel[m.s]} reply={reply} replyMissing={!!m.r && !reply}
                  bookmarked={bm.has(m.u)} onBookmark={() => toggleBookmark(m.u)} onReplyClick={reply ? () => jumpTo(reply.u) : undefined} highlight={focus === m.u} />
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
