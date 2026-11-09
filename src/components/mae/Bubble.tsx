import { memo, useEffect, useState } from "react";
import { Forward, Image as ImageIcon, Mic, Music, Paperclip, Pencil, Smile, Star, Video, Film, Box } from "lucide-react";
import type { Msg } from "@/lib/mae/parse";
import { fmtTime } from "@/lib/mae/time";
import { cn } from "@/lib/utils";
import { useViewer } from "@/lib/mae/viewer";
import { getChatMediaBlob } from "@/lib/chat/api";

const kindLabel: Record<string, { label: string; icon: typeof ImageIcon }> = {
  image: { label: "عکس", icon: ImageIcon },
  gif: { label: "گیف", icon: Film },
  video: { label: "ویدیو", icon: Video },
  voice: { label: "پیام صوتی", icon: Mic },
  music: { label: "موسیقی", icon: Music },
  file: { label: "فایل", icon: Paperclip },
  sticker: { label: "استیکر", icon: Smile },
  post: { label: "پست روبینو", icon: Box },
  nontext: { label: "پیام غیرمتنی (رسانه در خروجی نیامده)", icon: Box },
};

export interface BubbleProps {
  m: Msg;
  side?: "M" | "E" | "O" | undefined;
  senderName?: string | undefined;
  sourceLabel?: string | undefined;
  reply?: Msg | null | undefined;
  replyMissing?: boolean | undefined;
  bookmarked?: boolean | undefined;
  onBookmark?: (() => void) | undefined;
  onReplyClick?: (() => void) | undefined;
  highlight?: boolean | undefined;
  animate?: boolean | undefined;
}

export const Bubble = memo(function Bubble({ m, side, senderName, sourceLabel, reply, replyMissing, bookmarked, onBookmark, onReplyClick, highlight, animate }: BubbleProps) {
  const viewer = useViewer() ?? "M";
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [imageExpanded, setImageExpanded] = useState(false);

  useEffect(() => {
    setMediaUrl("");
    setMediaError("");
    setMediaLoading(false);
    setImageExpanded(false);
  }, [m.mediaPath, m.kd]);

  useEffect(() => {
    if (!mediaUrl) return;
    return () => URL.revokeObjectURL(mediaUrl);
  }, [mediaUrl]);

  async function revealMedia() {
    if (!m.mediaPath || mediaUrl || mediaLoading) return;
    setMediaLoading(true);
    setMediaError("");
    try {
      const blob = await getChatMediaBlob(m.mediaPath);
      setMediaUrl(URL.createObjectURL(blob));
    } catch {
      setMediaError("دریافت رسانه ناموفق بود؛ دوباره تلاش کن.");
    } finally {
      setMediaLoading(false);
    }
  }
  const isM = side === "M";
  const isO = side === "O";
  const mine = side === viewer;
  const k = m.kd !== "text" ? kindLabel[m.kd] : null;
  return (
    <div className={cn("flex w-full px-3 py-1", mine ? "justify-start" : "justify-end", animate && "anim-rise")}>
      <div
        className={cn(
          "group relative max-w-[82%] rounded-2xl border px-3.5 py-2 text-[15px] leading-7 transition-shadow",
          isO || !side ? "rounded-tl-md border-border bg-muted/60" : cn(mine ? "rounded-tr-md" : "rounded-tl-md", isM ? "border-mahan/40 bg-mahan/15" : "border-elisa/40 bg-elisa/15"),
          highlight && (isM ? "glow-mahan" : "glow-elisa"),
        )}
      >
        {(isO || !side) && senderName && <div className="mb-0.5 truncate text-xs font-bold text-gold" dir="auto">{senderName}</div>}
        {(reply || replyMissing) && (
          <button
            type="button"
            onClick={onReplyClick}
            className="mb-1 block w-full truncate rounded-lg border-s-2 border-primary/60 bg-background/40 px-2 py-0.5 text-start text-xs text-muted-foreground"
          >
            {reply ? reply.x || "پیام غیرمتنی" : "پیام اصلی در آرشیو موجود نیست"}
          </button>
        )}
        {k && (
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <k.icon className="size-3.5" aria-hidden />
            <span>{k.label}{m.m ? ` · ${m.m}` : ""}</span>
          </div>
        )}
        {m.mediaPath && (m.kd === "voice" || m.kd === "video" || m.kd === "image" || m.kd === "gif") && (
          <div className="my-2 min-w-48 max-w-full">
            {!mediaUrl ? (
              <button
                type="button"
                onClick={() => void revealMedia()}
                disabled={mediaLoading}
                className="flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-background/60 px-4 py-3 text-start transition hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  {mediaLoading ? <span className="animate-spin">◌</span> : m.kd === "voice" ? "▶" : m.kd === "video" ? "🎬" : "▧"}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {mediaLoading ? "در حال دریافت…" : mediaError ? "تلاش دوباره" : "برای دریافت و نمایش لمس کن"}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {mediaError || "دریافت فقط با درخواست تو · نگهداری نسخهٔ محلی"}
                  </span>
                </span>
              </button>
            ) : m.kd === "voice" ? (
              <audio className="w-64 max-w-full" controls preload="none" src={mediaUrl} />
            ) : m.kd === "video" ? (
              <video className="aspect-square w-52 max-w-full rounded-2xl bg-black object-cover" controls playsInline preload="none" src={mediaUrl} />
            ) : (
              <button
              type="button"
              onClick={() => setImageExpanded(true)}
              className="block max-w-full overflow-hidden rounded-xl"
              aria-label="نمایش تمام‌صفحه تصویر"
            >
              <img
                className="max-h-80 max-w-full rounded-xl object-contain"
                src={mediaUrl}
                alt="رسانهٔ پیام"
              />
            </button>
            )}
          </div>
        )}
        {imageExpanded && mediaUrl && (m.kd === "image" || m.kd === "gif") && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3"
            role="dialog"
            aria-modal="true"
            aria-label="نمایش تصویر"
            onClick={() => setImageExpanded(false)}
          >
            <button
              type="button"
              className="absolute end-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-white/15 text-2xl text-white backdrop-blur"
              onClick={() => setImageExpanded(false)}
              aria-label="بستن تصویر"
            >
              ×
            </button>
            <img
              src={mediaUrl}
              alt="نمایش تمام‌صفحه رسانه"
              className="max-h-full max-w-full object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}

        {m.x && <p className="whitespace-pre-wrap break-words">{m.x}</p>}
        <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          {m.f && <Forward className="size-3" aria-label="فوروارد" />}
          {m.e && <Pencil className="size-3" aria-label="ویرایش‌شده" />}
          {sourceLabel && <span className="rounded-full bg-background/50 px-1.5">{sourceLabel}</span>}
          <span>{fmtTime(m.t)}</span>
          {onBookmark && (
            <button type="button" onClick={onBookmark} aria-label={bookmarked ? "حذف نشان" : "نشان کردن"} aria-pressed={bookmarked} className="p-0.5">
              <Star className={cn("size-3.5", bookmarked ? "fill-gold text-gold" : "opacity-50 group-hover:opacity-100")} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export function DayDivider({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="my-3 flex items-center gap-3 px-4" role="separator">
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
      <span className="glass rounded-full px-3 py-1 text-xs">
        {label}
        {sub && <span className="ms-1 text-muted-foreground">{sub}</span>}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
    </div>
  );
}
