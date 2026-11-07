import { createFileRoute, Link } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useState } from "react";
import { useStore } from "@/lib/mae/store";
import { normalizeFa, type Msg } from "@/lib/mae/parse";
import { fmtDateTime, fa } from "@/lib/mae/time";
import { PageHeader } from "@/components/mae/Nav";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "M AND E · جستجو" },
      { name: "description", content: "جستجوی فارسی در همه‌ی گفتگوها" },
      { property: "og:title", content: "M AND E · جستجو" },
      { property: "og:description", content: "جستجوی فارسی در همه‌ی گفتگوها" },
    ],
  }),
  component: SearchPage,
});

let normCache: { src: Msg[]; norm: string[] } | null = null;
function normalized(msgs: Msg[]) {
  if (normCache?.src !== msgs) normCache = { src: msgs, norm: msgs.map((m) => normalizeFa(m.x)) };
  return normCache.norm;
}

function SearchPage() {
  const messages = useStore((s) => s.messages);
  const sources = useStore((s) => s.sources);
  const sides = useStore((s) => s.sides);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("");
  const [side, setSide] = useState("");
  const dq = useDeferredValue(q);
  const srcLabel = useMemo(() => Object.fromEntries(sources.map((s) => [s.id, s.label])), [sources]);

  const { results, total } = useMemo(() => {
    const n = normalizeFa(dq.trim());
    if (n.length < 2) return { results: [] as Msg[], total: 0 };
    const norm = normalized(messages);
    const out: Msg[] = [];
    let total = 0;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]!;
      if (src && m.s !== src) continue;
      if (side && sides[m.k]?.side !== side) continue;
      if (norm[i]!.includes(n)) { total++; if (out.length < 300) out.push(m); }
    }
    return { results: out, total };
  }, [dq, messages, src, side, sides]);

  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="جستجو" subtitle="ی/ي، ک/ك و نیم‌فاصله یکسان در نظر گرفته می‌شوند" />
      <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="دنبال چه می‌گردی؟" aria-label="عبارت جستجو"
        className="glass w-full rounded-full px-5 py-3 text-base outline-none" />
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <select value={src} onChange={(e) => setSrc(e.target.value)} aria-label="منبع" className="rounded-full border border-input bg-background/60 px-3 py-1">
          <option value="">همه‌ی منابع</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={side} onChange={(e) => setSide(e.target.value)} aria-label="فرستنده" className="rounded-full border border-input bg-background/60 px-3 py-1">
          <option value="">هر دو</option>
          <option value="M">ماهان</option>
          <option value="E">الیسا</option>
        </select>
        {dq.trim().length >= 2 && <span className="self-center text-muted-foreground">{fa(total)} نتیجه{total > 300 ? " (۳۰۰ مورد اول)" : ""}</span>}
      </div>
      <ul className="mt-4 space-y-2">
        {results.map((m) => (
          <li key={m.u}>
            <Link to="/timeline" search={{ u: m.u }} className="glass block rounded-2xl p-3">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className={sides[m.k]?.side === "M" ? "text-mahan" : "text-elisa"}>{sides[m.k]?.side === "M" ? "ماهان" : "الیسا"}</span>
                <span>{srcLabel[m.s]} · {fmtDateTime(m.t)}</span>
              </div>
              <p className="mt-1 line-clamp-3 text-sm">{m.x}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
