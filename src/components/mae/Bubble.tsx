import { memo, useEffect, useRef, useState } from "react";
import { Forward, Image as ImageIcon, Mic, Music, Paperclip, Pencil, Smile, Star, Video, Film, Box, MoreVertical, Copy, Trash2, Share2, Edit3, Play, Pause, Volume2 } from "lucide-react";
import type { Msg } from "@/lib/mae/parse";
import { fmtTime } from "@/lib/mae/time";
import { cn } from "@/lib/utils";
import { useViewer } from "@/lib/mae/viewer";
import { getChatMediaBlob } from "@/lib/chat/api";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

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


export function MediaPlayer({ src, kind }: { src: string; kind: "voice" | "video" }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src, kind]);

  const timeLabel = (value: number) => {
    if (!Number.isFinite(value) || value < 0) return "۰:۰۰";
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const togglePlayback = () => {
    const element = kind === "video" ? videoRef.current : audioRef.current;
    if (!element) return;

    if (element.paused) {
      void element.play().catch(() => setPlaying(false));
    } else {
      element.pause();
    }
  };

  const seek = (value: number) => {
    const element = kind === "video" ? videoRef.current : audioRef.current;
    if (!element || !Number.isFinite(value)) return;
    element.currentTime = value;
    setCurrentTime(value);
  };

  if (kind === "voice") {
    return (
      <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 via-background/95 to-fuchsia-500/10 p-3 shadow-lg shadow-primary/5">
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          className="hidden"
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlayback}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-lg shadow-primary/25"
            aria-label={playing ? "توقف موقت پیام صوتی" : "پخش پیام صوتی"}
          >
            {playing
              ? <Pause className="size-5 fill-current" />
              : <Play className="ms-0.5 size-5 fill-current" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <Volume2 className="size-3.5 text-primary" />
                پیام صوتی
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {timeLabel(currentTime)} / {timeLabel(duration)}
              </span>
            </div>

            <div className="mb-2 flex h-7 items-center gap-[3px]" aria-hidden="true">
              {[9,16,12,22,14,26,17,11,24,15,20,10,25,14,19,8,22,13,17,10,24,15,19,11].map((height, index) => (
                <span
                  key={index}
                  className={`flex-1 rounded-full ${index / 24 <= (duration ? currentTime / duration : 0) ? "bg-primary" : "bg-primary/25"}`}
                  style={{ height: `${height}px` }}
                />
              ))}
            </div>

            <input
              aria-label="موقعیت پیام صوتی"
              type="range"
              min={0}
              max={duration || 0}
              step="0.1"
              value={Math.min(currentTime, duration || 0)}
              disabled={!duration}
              onChange={(e) => seek(Number(e.currentTarget.value))}
              className="h-1.5 w-full cursor-pointer accent-primary disabled:opacity-40"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-xl shadow-primary/10">
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onClick={togglePlayback}
        className="aspect-video max-h-[360px] w-full bg-black object-contain"
      />

      {!playing && (
        <button
          type="button"
          onClick={togglePlayback}
          className="absolute inset-0 grid place-items-center bg-black/15"
          aria-label="پخش ویدیو"
        >
          <span className="grid size-16 place-items-center rounded-full border border-white/30 bg-black/45 text-white shadow-2xl backdrop-blur-md">
            <Play className="ms-1 size-7 fill-current" />
          </span>
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-3 pt-8 text-white">
        <div className="mb-2 flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 font-semibold">
            <Video className="size-3.5" />
            ویدیو مسیج
          </span>
          <span className="tabular-nums">
            {timeLabel(currentTime)} / {timeLabel(duration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlayback}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-white/15"
            aria-label={playing ? "توقف موقت ویدیو" : "پخش ویدیو"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="ms-0.5 size-4" />}
          </button>

          <input
            aria-label="موقعیت ویدیو"
            type="range"
            min={0}
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            disabled={!duration}
            onChange={(e) => seek(Number(e.currentTarget.value))}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-fuchsia-400 disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );
}

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
  canEdit?: boolean | undefined;
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}

export const Bubble = memo(function Bubble({ m, side, senderName, sourceLabel, reply, replyMissing, bookmarked, onBookmark, onReplyClick, highlight, animate, canEdit, onEdit, onDelete }: BubbleProps) {
  const viewer = useViewer() ?? "M";
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [imageExpanded, setImageExpanded] = useState(false);
  const [copied, setCopied] = useState(false);


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
                className="group flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background/90 to-fuchsia-500/10 p-3 text-start shadow-sm transition hover:border-primary/45 hover:shadow-lg hover:shadow-primary/5 disabled:opacity-60"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-lg shadow-primary/20">
                  {mediaLoading
                    ? <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    : m.kd === "voice" ? <Mic className="size-5" />
                    : m.kd === "video" ? <Video className="size-5" />
                    : <ImageIcon className="size-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">
                    {mediaLoading ? "در حال دریافت رسانه…" : mediaError ? "دریافت ناموفق بود" : m.kd === "voice" ? "پیام صوتی" : m.kd === "video" ? "ویدیو مسیج" : "تصویر پیام"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {mediaError || (mediaLoading ? "کمی صبر کن…" : "برای دریافت و پخش لمس کن")}
                  </span>
                </span>
                <span className="text-primary transition group-hover:-translate-x-0.5">←</span>
              </button>
            ) : m.kd === "voice" || m.kd === "video" ? (
              <MediaPlayer src={mediaUrl} kind={m.kd} />
            ) : (
              <button
                type="button"
                onClick={() => setImageExpanded(true)}
                className="block max-w-full overflow-hidden rounded-xl"
                aria-label="نمایش تمام‌صفحه تصویر"
              >
                <img className="max-h-80 max-w-full rounded-xl object-contain" src={mediaUrl} alt="رسانهٔ پیام" />
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

        <div className="absolute -top-3 end-1 z-20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button"
                className="grid size-8 place-items-center rounded-full border border-white/10 bg-background/95 text-muted-foreground shadow-lg backdrop-blur"
                aria-label="عملیات پیام">
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="z-[200] min-w-48">
              <DropdownMenuItem onSelect={async () => {
                try {
                  await navigator.clipboard.writeText(m.x || "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  const area = document.createElement("textarea");
                  area.value = m.x || "";
                  document.body.appendChild(area);
                  area.select();
                  document.execCommand("copy");
                  area.remove();
                  setCopied(true);
                }
              }}>
                <Copy className="me-2 size-4" /> {copied ? "کپی شد" : "کپی متن"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={async () => {
                const text = m.x || `${k?.label || "پیام رسانه‌ای"} · ${fmtTime(m.t)}`;
                try {
                  if (navigator.share) await navigator.share({ text });
                  else await navigator.clipboard.writeText(text);
                } catch {}
              }}>
                <Share2 className="me-2 size-4" /> اشتراک‌گذاری
              </DropdownMenuItem>
              {onBookmark && (
                <DropdownMenuItem onSelect={() => onBookmark()}>
                  <Star className="me-2 size-4" /> {bookmarked ? "برداشتن نشان" : "ذخیره در نشان‌شده‌ها"}
                </DropdownMenuItem>
              )}
              {canEdit && onEdit && (
                <DropdownMenuItem onSelect={() => onEdit()}>
                  <Edit3 className="me-2 size-4" /> ویرایش پیام
                </DropdownMenuItem>
              )}
              {canEdit && onDelete && (
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete()}>
                  <Trash2 className="me-2 size-4" /> حذف پیام
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

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
