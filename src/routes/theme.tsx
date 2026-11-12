import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw, X } from "lucide-react";
import { PageHeader } from "@/components/mae/Nav";
import { Bubble } from "@/components/mae/Bubble";
import { getMyProfile } from "@/lib/chat/api";
import { supabase } from "@/lib/supabase";
import { saveTheme, useTheme, useViewer, type Theme } from "@/lib/mae/viewer";

type Person = { id: string; display_name: string; side: "M" | "E" };
type SavedTheme = { id: string; name: string; theme: Theme };
type ThemeRequest = {
  id: string;
  sender_id: string;
  recipient_id: string;
  theme: Theme;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
};

const SWATCHES = [
  "#4fb8ff",
  "#5b8cff",
  "#38e1c6",
  "#a78bfa",
  "#ff5fae",
  "#ff7aa8",
  "#ff8a5b",
  "#f5c542",
];

export const Route = createFileRoute("/theme")({
  head: () => ({ meta: [{ title: "M AND E · تم و رنگ‌ها" }] }),
  component: ThemePage,
});

function ThemePage() {
  const viewer = useViewer();
  const theme = useTheme();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<SavedTheme[]>([]);
  const [profile, setProfile] = useState<Person | null>(null);
  const [other, setOther] = useState<Person | null>(null);
  const [requests, setRequests] = useState<ThemeRequest[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [imageX, setImageX] = useState(theme.imageX ?? 50);
  const [imageY, setImageY] = useState(theme.imageY ?? 50);
  const [imageZoom, setImageZoom] = useState(theme.imageZoom ?? 1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storageKey = `mae:custom-themes:${viewer ?? "none"}`;

  async function refreshRequests(id: string) {
    const [incoming, outgoing] = await Promise.all([
      supabase
        .from("theme_requests")
        .select("*")
        .eq("recipient_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("theme_requests")
        .select("*")
        .eq("sender_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (incoming.error) throw incoming.error;
    if (outgoing.error) throw outgoing.error;
    const rows = [...(incoming.data ?? []), ...(outgoing.data ?? [])] as ThemeRequest[];
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    setRequests(rows);
  }

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      setSaved(JSON.parse(localStorage.getItem(storageKey) || "[]") as SavedTheme[]);
    } catch {
      setSaved([]);
    }

    void (async () => {
      try {
        const me = await getMyProfile();
        if (!active || !me) return;
        setProfile(me as Person);

        const { data: peer, error } = await supabase
          .from("profiles")
          .select("id,display_name,side")
          .neq("id", me.id)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (active && peer) setOther(peer as Person);

        await refreshRequests(me.id);
        if (!active) return;

        channel = supabase
          .channel(`mae-theme-requests-${me.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "theme_requests",
              filter: `recipient_id=eq.${me.id}`,
            },
            () => {
              void refreshRequests(me.id).catch((e) =>
                setNotice(e instanceof Error ? e.message : "دریافت درخواست ناموفق بود."),
              );
            },
          )
          .subscribe();
      } catch (e) {
        if (active) setNotice(e instanceof Error ? e.message : "ارتباط با حساب برقرار نشد.");
      }
    })();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [storageKey]);

  async function chooseBackground(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("فقط فایل تصویری انتخاب کن.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("پردازش تصویر در دسترس نیست.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("فشرده‌سازی عکس انجام نشد."))),
          "image/jpeg",
          0.76,
        );
      });
      if (blob.size > 650_000)
        throw new Error("حجم عکس بعد از فشرده‌سازی هنوز زیاد است؛ عکس دیگری انتخاب کن.");
      const reader = new FileReader();
      reader.onload = () => {
        setDraftImage(String(reader.result));
        setImageX(theme.imageX ?? 50);
        setImageY(theme.imageY ?? 50);
        setImageZoom(theme.imageZoom ?? 1);
        setNotice("عکس آمادهٔ تنظیمه؛ کادرش رو دقیق کن و اعمال بزن.");
      };
      reader.onerror = () => setNotice("خواندن عکس ناموفق بود.");
      reader.readAsDataURL(blob);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "باز کردن عکس ناموفق بود.");
    }
  }

  function applyBackground() {
    const image = draftImage ?? theme.backgroundImage;
    if (!image) return;
    saveTheme({ ...theme, backgroundImage: image, imageX, imageY, imageZoom });
    setDraftImage(null);
    setNotice("پس‌زمینهٔ دلخواه اعمال شد. ✨");
  }

  function removeBackground() {
    saveTheme({ ...theme, backgroundImage: "", imageX: 50, imageY: 50, imageZoom: 1 });
    setDraftImage(null);
    setNotice("عکس پس‌زمینه برداشته شد.");
  }

  function saveCustom() {
    const clean = name.trim();
    if (!clean) {
      setNotice("برای تم یک اسم بنویس.");
      return;
    }
    const item: SavedTheme = { id: crypto.randomUUID(), name: clean, theme };
    const next = [item, ...saved];
    setSaved(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    setName("");
    setNotice("تم شخصی ذخیره شد.");
  }

  async function shareTheme(selected: Theme) {
    if (!profile || !other) {
      setNotice("برای اشتراک تم، ابتدا وارد حساب گفتگوی خودت شو.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const { error } = await supabase.from("theme_requests").insert({
        sender_id: profile.id,
        recipient_id: other.id,
        theme: selected,
      });
      if (error) throw error;
      await refreshRequests(profile.id);
      setNotice(`درخواست تم برای ${other.display_name} فرستاده شد.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ارسال درخواست ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function respond(request: ThemeRequest, status: "accepted" | "rejected") {
    setBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase
        .from("theme_requests")
        .update({ status })
        .eq("id", request.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("این درخواست قبلاً پاسخ داده شده است.");
      if (status === "accepted") {
        saveTheme(request.theme);
        setImageX(request.theme.imageX ?? 50);
        setImageY(request.theme.imageY ?? 50);
        setImageZoom(request.theme.imageZoom ?? 1);
      }
      if (profile) await refreshRequests(profile.id);
      setNotice(
        status === "accepted" ? "تم پذیرفته شد و روی حساب تو اعمال شد. 💜" : "درخواست تم رد شد.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "ثبت پاسخ ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  const Row = ({ side, label }: { side: "mahan" | "elisa"; label: string }) => (
    <div className="glass rounded-3xl p-4">
      <div className="flex items-center justify-between">
        <span className="font-bold">{label}</span>
        <input
          type="color"
          value={theme[side]}
          onChange={(e) => saveTheme({ ...theme, [side]: e.target.value })}
          aria-label={label}
          className="h-9 w-14 cursor-pointer rounded-lg bg-transparent"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => saveTheme({ ...theme, [side]: color })}
            aria-label={color}
            className={`size-8 rounded-full border-2 ${theme[side] === color ? "border-foreground" : "border-transparent"}`}
            style={{ background: color }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 pb-32">
      <PageHeader
        title="تم و رنگ‌ها"
        subtitle={`شخصی‌سازی ${viewer === "E" ? "الیسا" : "ماهان"}`}
      />

      <div className="grid gap-3">
        <Row side="mahan" label="رنگ ماهان" />
        <Row side="elisa" label="رنگ الیسا" />
        <section className="glass overflow-hidden rounded-3xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">پس‌زمینهٔ دلخواه</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                عکس خودت رو انتخاب کن، کادرش رو تنظیم کن و اعمالش کن.
              </p>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <ImagePlus className="size-5" />
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void chooseBackground(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm font-bold transition hover:bg-primary/10"
          >
            <ImagePlus className="size-4" />
            افزودن عکس دلخواه
          </button>
          {(draftImage || theme.backgroundImage) && (
            <div className="mt-4">
              <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-white/15 bg-black/30 shadow-inner">
                <img
                  src={draftImage ?? theme.backgroundImage}
                  alt="پیش‌نمایش پس‌زمینه"
                  className="absolute inset-0 size-full object-cover"
                  style={{
                    objectPosition: `${imageX}% ${imageY}%`,
                    transform: `scale(${imageZoom})`,
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/5" />
                <span className="absolute bottom-3 right-3 rounded-full border border-white/20 bg-black/35 px-3 py-1 text-xs text-white backdrop-blur">
                  پیش‌نمایش کادر
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                <label className="block text-xs font-semibold">
                  بزرگ‌نمایی · {imageZoom.toFixed(1)}×
                  <input
                    aria-label="بزرگ‌نمایی عکس"
                    type="range"
                    min="1"
                    max="2.2"
                    step="0.05"
                    value={imageZoom}
                    onChange={(event) => setImageZoom(Number(event.target.value))}
                    className="mt-2 w-full accent-primary"
                  />
                </label>
                <label className="block text-xs font-semibold">
                  جابه‌جایی افقی · {imageX}٪
                  <input
                    aria-label="جابه‌جایی افقی عکس"
                    type="range"
                    min="0"
                    max="100"
                    value={imageX}
                    onChange={(event) => setImageX(Number(event.target.value))}
                    className="mt-2 w-full accent-primary"
                  />
                </label>
                <label className="block text-xs font-semibold">
                  جابه‌جایی عمودی · {imageY}٪
                  <input
                    aria-label="جابه‌جایی عمودی عکس"
                    type="range"
                    min="0"
                    max="100"
                    value={imageY}
                    onChange={(event) => setImageY(Number(event.target.value))}
                    className="mt-2 w-full accent-primary"
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyBackground}
                  className="flex-1 rounded-full bg-love px-4 py-2.5 text-sm font-bold text-primary-foreground"
                >
                  {draftImage ? "اعمال عکس" : "اعمال تنظیمات"}
                </button>
                {draftImage ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftImage(null);
                      setImageX(theme.imageX ?? 50);
                      setImageY(theme.imageY ?? 50);
                      setImageZoom(theme.imageZoom ?? 1);
                    }}
                    className="rounded-full border border-border px-4 py-2.5 text-sm"
                  >
                    لغو
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={removeBackground}
                    className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground"
                  >
                    <X className="size-4" /> حذف عکس پس‌زمینه
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setImageX(50);
                    setImageY(50);
                    setImageZoom(1);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm"
                >
                  <RotateCcw className="size-3.5" /> تنظیم مجدد کادر
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="glass rounded-3xl p-4">
          <label htmlFor="glow" className="font-bold">
            شدت درخشش پس‌زمینه
          </label>
          <input
            id="glow"
            type="range"
            min={0}
            max={70}
            value={theme.glow}
            onChange={(e) => saveTheme({ ...theme, glow: Number(e.target.value) })}
            className="mt-3 w-full"
          />
        </section>
        <section className="glass rounded-3xl p-4">
          <h2 className="font-bold">ساخت تم شخصی</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم تم، مثلاً کهکشان آبی"
            className="mt-3 w-full rounded-xl border border-input bg-background/60 px-3 py-2"
          />
          <button
            type="button"
            onClick={saveCustom}
            className="mt-3 w-full rounded-full bg-love px-4 py-2 font-bold text-primary-foreground"
          >
            ذخیرهٔ تم فعلی
          </button>
        </section>
      </div>

      {saved.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-display text-xl">تم‌های ذخیره‌شده</h2>
          <div className="grid gap-3">
            {saved.map((item) => (
              <div key={item.id} className="glass rounded-3xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <strong>{item.name}</strong>
                  <div className="flex gap-1">
                    <span
                      className="size-5 rounded-full"
                      style={{ background: item.theme.mahan }}
                    />
                    <span
                      className="size-5 rounded-full"
                      style={{ background: item.theme.elisa }}
                    />
                  </div>
                </div>
                {item.theme.backgroundImage && (
                  <div className="mt-3 h-20 overflow-hidden rounded-xl border border-white/10">
                    <img
                      src={item.theme.backgroundImage}
                      alt=""
                      className="size-full object-cover"
                      style={{
                        objectPosition: `${item.theme.imageX ?? 50}% ${item.theme.imageY ?? 50}%`,
                      }}
                    />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      saveTheme(item.theme);
                      setImageX(item.theme.imageX ?? 50);
                      setImageY(item.theme.imageY ?? 50);
                      setImageZoom(item.theme.imageZoom ?? 1);
                      setNotice(`تم ${item.name} اعمال شد.`);
                    }}
                    className="rounded-full border border-border px-3 py-2 text-sm"
                  >
                    اعمال تم
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void shareTheme(item.theme)}
                    className="rounded-full bg-love px-3 py-2 text-sm text-primary-foreground"
                  >
                    درخواست برای نفر مقابل
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = saved.filter((x) => x.id !== item.id);
                      setSaved(next);
                      localStorage.setItem(storageKey, JSON.stringify(next));
                    }}
                    className="rounded-full border border-border px-3 py-2 text-sm"
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="glass mt-6 rounded-3xl p-4">
        <h2 className="font-bold">درخواست‌های دریافتی</h2>
        {requests.filter((r) => r.recipient_id === profile?.id && r.status === "pending").length ===
          0 && <p className="mt-2 text-sm text-muted-foreground">درخواست تازه‌ای نداری.</p>}
        {requests
          .filter((r) => r.recipient_id === profile?.id && r.status === "pending")
          .map((r) => (
            <div key={r.id} className="mt-3 rounded-2xl border border-border p-3">
              <p className="text-sm">یک تم جدید برایت فرستاده شده.</p>
              <div className="mt-2 flex gap-2">
                <span className="size-7 rounded-full" style={{ background: r.theme.mahan }} />
                <span className="size-7 rounded-full" style={{ background: r.theme.elisa }} />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void respond(r, "accepted")}
                  className="rounded-full bg-love px-4 py-2 text-sm text-primary-foreground"
                >
                  قبول
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void respond(r, "rejected")}
                  className="rounded-full border border-border px-4 py-2 text-sm"
                >
                  رد
                </button>
              </div>
            </div>
          ))}
      </section>

      <section className="glass mt-4 rounded-3xl p-4">
        <h2 className="font-bold">درخواست‌های من</h2>
        {requests
          .filter((r) => r.sender_id === profile?.id)
          .map((r) => (
            <p key={r.id} className="mt-2 text-sm text-muted-foreground">
              {r.status === "pending"
                ? "در انتظار پاسخ"
                : r.status === "accepted"
                  ? "قبول شد"
                  : "رد شد"}{" "}
              · {new Date(r.created_at).toLocaleDateString("fa-IR")}
            </p>
          ))}
      </section>

      <section className="glass mt-4 rounded-3xl p-4">
        <h2 className="font-bold">پیش‌نمایش</h2>
        <Bubble
          m={{ u: "theme-preview-1", s: "p", t: 0, k: "x", x: "پیام طرف مقابل", kd: "text", o: 0 }}
          side={viewer === "E" ? "M" : "E"}
        />
        <Bubble
          m={{ u: "theme-preview-2", s: "p", t: 0, k: "y", x: "پیام من", kd: "text", o: 1 }}
          side={viewer ?? "M"}
        />
      </section>

      {notice && (
        <p className="mt-4 rounded-2xl border border-border p-3 text-center text-sm" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
