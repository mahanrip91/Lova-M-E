import { createFileRoute, Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { toggleBookmark, useStore } from "@/lib/mae/store";
import { fmtDateTime } from "@/lib/mae/time";
import { PageHeader } from "@/components/mae/Nav";

export const Route = createFileRoute("/bookmarks")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "M AND E · نشان‌ها" },
      { name: "description", content: "پیام‌های نشان‌شده" },
      { property: "og:title", content: "M AND E · نشان‌ها" },
      { property: "og:description", content: "پیام‌های نشان‌شده" },
    ],
  }),
  component: Bookmarks,
});

function Bookmarks() {
  const bookmarks = useStore((s) => s.bookmarks);
  const messages = useStore((s) => s.messages);
  const uidIndex = useStore((s) => s.uidIndex);
  const sides = useStore((s) => s.sides);
  const list = bookmarks.map((u) => messages[uidIndex.get(u) ?? -1]).filter((m): m is NonNullable<typeof m> => !!m).sort((a, b) => a.t - b.t);
  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="نشان‌ها" subtitle="روی ستاره‌ی هر پیام در تایم‌لاین بزن تا اینجا بیاید" />
      {list.length === 0 && <p className="glass rounded-3xl p-6 text-center text-sm text-muted-foreground">هنوز پیامی نشان نشده.</p>}
      <ul className="space-y-2">
        {list.map((m) => (
          <li key={m.u} className="glass flex items-start gap-2 rounded-2xl p-3">
            <Link to="/timeline" search={{ u: m.u }} className="min-w-0 flex-1">
              <div className="text-[11px] text-muted-foreground"><span className={sides[m.k]?.side === "M" ? "text-mahan" : "text-elisa"}>{sides[m.k]?.side === "M" ? "ماهان" : "الیسا"}</span> · {fmtDateTime(m.t)}</div>
              <p className="mt-1 line-clamp-3 text-sm">{m.x || "پیام غیرمتنی"}</p>
            </Link>
            <button type="button" onClick={() => toggleBookmark(m.u)} aria-label="حذف نشان" className="p-1"><Star className="size-4 fill-gold text-gold" /></button>
          </li>
        ))}
      </ul>
    </main>
  );
}
