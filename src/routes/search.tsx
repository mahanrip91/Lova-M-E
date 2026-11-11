import { createFileRoute, Link } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { searchAllMessages } from "@/lib/chat/api";
import { useStore } from "@/lib/mae/store";
import type { Msg } from "@/lib/mae/parse";
import { normalizeFa } from "@/lib/mae/parse";
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

function SearchPage() {
  const sources = useStore((s) => s.sources);
  const sides = useStore((s) => s.sides);

  const [q, setQ] = useState("");
  const [src, setSrc] = useState("");
  const [side, setSide] = useState("");
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<Msg[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const dq = useDeferredValue(q);
  const validQuery = normalizeFa(dq.trim()).length >= 2;

  const srcLabel = useMemo(
    () => Object.fromEntries(sources.map((source) => [source.id, source.label])),
    [sources],
  );

  useEffect(() => {
    const query = dq.trim();

    if (normalizeFa(query).length < 2) {
      setResults([]);
      setTotal(0);
      setSearching(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    let active = true;

    if (page === 0) {
      setResults([]);
      setTotal(0);
    }

    setSearching(true);
    setError("");

    const timeout = window.setTimeout(() => {
      void searchAllMessages(query, src || null, side || null, controller.signal, page * 300)
        .then((result) => {
          if (!active) return;

          setResults((current) => (page === 0 ? result.results : [...current, ...result.results]));
          setTotal(result.total);
        })
        .catch((reason: unknown) => {
          if (!active || controller.signal.aborted) return;
          setError(reason instanceof Error ? reason.message : "جستجو انجام نشد؛ دوباره تلاش کن.");
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [dq, src, side, page]);

  function changeQuery(value: string) {
    setPage(0);
    setQ(value);
  }

  function changeSource(value: string) {
    setPage(0);
    setSrc(value);
  }

  function changeSide(value: string) {
    setPage(0);
    setSide(value);
  }

  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader
        title="جستجو"
        subtitle="جستجو در تمام آرشیو و پیام‌های زنده؛ نتایج جدا از حافظهٔ چت بارگذاری می‌شوند"
      />

      <input
        type="search"
        autoFocus
        value={q}
        onChange={(event) => changeQuery(event.target.value)}
        placeholder="دنبال چه می‌گردی؟"
        aria-label="عبارت جستجو"
        className="glass w-full rounded-full px-5 py-3 text-base outline-none"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <select
          value={src}
          onChange={(event) => changeSource(event.target.value)}
          aria-label="منبع"
          className="rounded-full border border-input bg-background/60 px-3 py-1"
        >
          <option value="">همه‌ی منابع</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </select>

        <select
          value={side}
          onChange={(event) => changeSide(event.target.value)}
          aria-label="فرستنده"
          className="rounded-full border border-input bg-background/60 px-3 py-1"
        >
          <option value="">هر دو</option>
          <option value="M">ماهان</option>
          <option value="E">الیسا</option>
        </select>

        {validQuery && (
          <span className="self-center text-muted-foreground">
            {searching ? "در حال جستجو…" : fa(total) + " نتیجه"}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {searching && (
        <p role="status" className="mt-4 text-center text-xs text-muted-foreground">
          در حال جستجو در کل آرشیو و گفتگوی زنده…
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {results.map((message) => (
          <li key={message.u}>
            <Link to="/timeline" search={{ u: message.u }} className="glass block rounded-2xl p-3">
              <div className="flex justify-between gap-3 text-[11px] text-muted-foreground">
                <span className={sides[message.k]?.side === "M" ? "text-mahan" : "text-elisa"}>
                  {sides[message.k]?.side === "M" ? "ماهان" : "الیسا"}
                </span>

                <span>
                  {srcLabel[message.s] ?? (message.s === "LIVE" ? "گفتگوی زنده" : message.s)}
                  {" · "}
                  {fmtDateTime(message.t)}
                </span>
              </div>

              <p className="mt-1 line-clamp-3 text-sm">{message.x || "پیام رسانه‌ای"}</p>
            </Link>
          </li>
        ))}
      </ul>

      {!searching && validQuery && !error && total === 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">نتیجه‌ای پیدا نشد.</p>
      )}

      {!searching && results.length > 0 && results.length < total && (
        <button
          type="button"
          onClick={() => setPage((current) => current + 1)}
          className="glass my-5 w-full rounded-full px-4 py-3 text-sm"
        >
          نمایش نتایج بیشتر ({fa(results.length)} از {fa(total)})
        </button>
      )}
    </main>
  );
}
