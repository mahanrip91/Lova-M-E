import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Plus, Sparkles } from "lucide-react";
import { saveEvent, useStore, type MemoryEvent } from "@/lib/mae/store";
import { fmtDateTime } from "@/lib/mae/time";
import { PageHeader } from "@/components/mae/Nav";

export const Route = createFileRoute("/memories")({
  head: () => ({ meta: [{ title: "M AND E · افزودن خاطره" }] }),
  component: Memories,
});

function tehranTime(value: string): number {
  return Date.parse(`${value}:00+03:30`);
}

function Memories() {
  const events = useStore((s) => s.events);
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function addMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    const startMs = tehranTime(from);
    const endMs = to ? tehranTime(to) : startMs;
    if (!title.trim() || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      setError("عنوان و زمان معتبر وارد کن.");
      return;
    }
    setSaving(true);
    try {
      const memory: MemoryEvent = {
        id: `custom-${crypto.randomUUID()}`,
        kind: "custom",
        title: title.trim(),
        from: startMs,
        to: endMs,
        origin: "manual",
      };
      await saveEvent(memory);
      setTitle("");
      setFrom("");
      setTo("");
      setSaved(true);
    } catch {
      setError("ذخیرهٔ خاطره انجام نشد؛ دوباره تلاش کن.");
    } finally {
      setSaving(false);
    }
  }

  const customEvents = events
    .filter((event) => event.kind === "custom")
    .sort((a, b) => b.from - a.from);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-28">
      <PageHeader title="افزودن خاطره" subtitle="خاطره‌های اصلی برنامه ثابت می‌مانند؛ فقط می‌توانی خاطرهٔ تازه اضافه کنی." />
      <form onSubmit={(event) => void addMemory(event)} className="glass rounded-3xl p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="size-5 text-love" />
          <h2 className="font-bold">خاطرهٔ جدید</h2>
        </div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="memory-title">عنوان خاطره</label>
        <input
          id="memory-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="مثلاً اولین تماس تصویری"
          maxLength={80}
          required
          className="mb-4 h-11 w-full rounded-xl border border-border bg-background/70 px-3 text-sm"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            زمان شروع
            <input
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              required
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background/70 px-2 text-xs text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            زمان پایان (اختیاری)
            <input
              type="datetime-local"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background/70 px-2 text-xs text-foreground"
            />
          </label>
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
        {saved && <p className="mt-3 text-xs text-primary">خاطره ذخیره و همگام شد.</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-love px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          <Plus className="size-4" /> {saving ? "در حال ذخیره…" : "افزودن خاطره"}
        </button>
      </form>

      <section className="mt-6">
        <h2 className="mb-3 font-bold">خاطره‌های اضافه‌شده</h2>
        {customEvents.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">هنوز خاطره‌ای اضافه نکردی.</p>
        ) : (
          <div className="grid gap-2">
            {customEvents.map((memory) => (
              <article key={memory.id} className="glass rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-love" />
                  <h3 className="font-bold">{memory.title}</h3>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {fmtDateTime(memory.from)}{memory.to !== memory.from ? ` تا ${fmtDateTime(memory.to)}` : ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
