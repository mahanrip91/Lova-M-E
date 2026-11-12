import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/mae/store";
import { fmtDateTime, fa } from "@/lib/mae/time";
import { PageHeader } from "@/components/mae/Nav";

export const Route = createFileRoute("/memories")({
  head: () => ({ meta: [{ title: "M AND E · خاطره‌های ثبت‌شده" }] }),
  component: Memories,
});

function Memories() {
  const settings = useStore((s) => s.settings);
  const sources = useStore((s) => s.sources);
  const group = sources.find((source) => source.id === settings.firstSourceId);
  return (
    <main className="mx-auto max-w-3xl px-4">
      <PageHeader title="خاطره‌های ثبت‌شده" subtitle="تاریخ‌ها و زمان‌ها از آرشیو اصلی ثبت شده‌اند و امکان ویرایش ندارند." />
      <section className="glass rounded-3xl p-5">
        <h2 className="font-bold">شروع شمارنده</h2>
        <p className="mt-2 text-sm text-muted-foreground">{fmtDateTime(settings.startMs)}</p>
      </section>
      <section className="glass mt-4 rounded-3xl p-5">
        <h2 className="font-bold">روز اول ما · چطور شروع شد</h2>
        <p className="mt-2 text-sm text-muted-foreground">{fmtDateTime(settings.firstFrom)} تا {fmtDateTime(settings.firstTo)}</p>
        <p className="mt-3 text-sm">{fa(settings.beganCount ?? 282)} پیام از ماهان و الیسا</p>
        {group && <p className="mt-1 text-xs text-muted-foreground">گفتگوی گروهی: {group.label}</p>}
      </section>
    </main>
  );
}
