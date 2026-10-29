import { memo } from "react";
import { Forward, Image as ImageIcon, Mic, Music, Paperclip, Pencil, Smile, Star, Video, Film, Box } from "lucide-react";
import type { Msg } from "@/lib/mae/parse";
import { fmtTime } from "@/lib/mae/time";
import { cn } from "@/lib/utils";

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
  const isM = side === "M";
  const isO = side === "O";
  const k = m.kd !== "text" ? kindLabel[m.kd] : null;
  return (
    <div className={cn("flex w-full px-3 py-1", isM || isO ? "justify-start" : "justify-end", animate && "anim-rise")}>
      <div
        className={cn(
          "group relative max-w-[82%] rounded-2xl border px-3.5 py-2 text-[15px] leading-7 transition-shadow",
          isO || !side ? "rounded-tr-md border-border bg-muted/60" : isM ? "rounded-tr-md border-mahan/30 bg-mahan/10" : "rounded-tl-md border-elisa/30 bg-elisa/10",
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
