import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera, Image as ImageIcon, LoaderCircle, Mic, Search, Send, Smile, Square, Video, X, Film
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMediaMessage, sendTextMessage } from "@/lib/chat/api";
import type { ChatMessage, Profile } from "@/lib/chat/types";

const emojiGroups = [
  { name: "اخیراً", icon: "🕘", items: ["😂","❤️","🥹","😭","😍","🔥","😘","🤣","✨","🫶","💀","😎","🥰","🤍","💔","🙃"] },
  { name: "صورت‌ها", icon: "😀", items: ["😀","😃","😄","😁","😆","😅","😂","🤣","🥲","🥹","☺️","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🫣","🤭","🫢","🫡","🤫","🫠","🤥","😶","🫥","😐","😑","😬","🙄","😮‍💨","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕"] },
  { name: "دست‌ها", icon: "👋", items: ["👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪"] },
  { name: "قلب‌ها", icon: "❤️", items: ["❤️","🩷","🧡","💛","💚","💙","🩵","💜","🤎","🖤","🩶","🤍","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟","❣️","💌"] },
  { name: "طبیعت", icon: "🌿", items: ["🌸","🌹","🌺","🌻","🌼","🌷","🪻","💐","🍀","🌿","🌱","🌳","🌴","🌵","🌾","🍁","🍂","🍃","🌈","☀️","🌙","⭐","🌟","✨","⚡","🔥","❄️","☁️","🌊","🌍"] },
  { name: "غذا", icon: "🍕", items: ["🍕","🍔","🍟","🌭","🍿","🧋","☕","🍵","🥤","🍦","🍩","🍪","🎂","🍰","🧁","🍫","🍓","🍒","🍉","🍇","🍑","🥑","🍎","🍌","🍍","🥭","🍋"] },
  { name: "سرگرمی", icon: "⚽", items: ["⚽","🏀","🏈","⚾","🎾","🏐","🥊","🥋","🏆","🥇","🎮","🎧","🎵","🎶","🎤","🎬","🎨","🎯","🎲","🧩","🚀","✈️","🚗","🏎️","🛸"] },
  { name: "نمادها", icon: "💯", items: ["💯","💢","💥","💫","💦","💨","💤","🎉","🎊","🎈","🎁","🎀","🏳️‍🌈","♾️","❤️‍🔥","☮️","☯️","✝️","☪️","⚛️","🔱","⚜️","🔰","✅","❌","❗","❓","‼️","⁉️","🔔","🔕"] },
];

type Props = {
  profile: Profile | null;
  disabled?: boolean;
  onSent: (message: ChatMessage) => void;
  onError: (message: string) => void;
};

export function Composer({ profile, disabled, onSent, onError }: Props) {
  const [body, setBody] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<"voice" | "video" | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileProgress, setFileProgress] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const videoPreview = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoPreview.current && cameraStream) {
      videoPreview.current.srcObject = cameraStream;
      void videoPreview.current.play().catch(() => {});
    }
  }, [cameraStream]);

  useEffect(() => () => {
    recorder.current?.state !== "inactive" && recorder.current?.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const filtered = emojiGroups[emojiTab]?.items.filter((emoji) =>
    !emojiSearch || emoji.includes(emojiSearch)
  ) ?? [];

  function stopStream() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCameraStream(null);
  }

  async function startRecording(kind: "voice" | "video") {
    if (!profile || mediaBusy || recording) return;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        kind === "voice"
          ? { audio: true }
          : { audio: true, video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } } }
      );
      stream.current = mediaStream;
      if (kind === "video") setCameraStream(mediaStream);

      const candidates = kind === "voice"
        ? ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
      const mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || (kind === "voice" ? "audio/webm" : "video/webm") });
        stopStream();
        setRecording(null);
        if (!blob.size) return;
        setMediaBusy(true);
        try {
          const message = await sendMediaMessage(blob, kind, profile.id);
          onSent(message);
        } catch (error) {
          onError(error instanceof Error ? error.message : "ارسال رسانه ناموفق بود.");
        } finally {
          setMediaBusy(false);
        }
      };
      recorder.current = mediaRecorder;
      mediaRecorder.start(250);
      setRecording(kind);
    } catch (error) {
      stopStream();
      onError(error instanceof Error ? error.message : "دسترسی به میکروفون یا دوربین ممکن نشد.");
    }
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const valid = incoming.filter((file) =>
      file.type.startsWith("image/") || file.type.startsWith("video/")
    );
    if (valid.length !== incoming.length) {
      onError("فقط عکس و ویدیو قابل انتخاب هستند.");
    }
    const oversized = valid.find((file) => file.size > 25 * 1024 * 1024);
    if (oversized) {
      onError("حجم هر فایل باید کمتر از ۲۵ مگابایت باشد.");
      return;
    }
    setSelectedFiles((current) => [...current, ...valid].slice(0, 10));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function sendSelectedFiles() {
    if (!profile || !selectedFiles.length || mediaBusy) return;
    setMediaBusy(true);
    setFileProgress("آماده‌سازی ارسال…");
    try {
      for (let index = 0; index < selectedFiles.length; index++) {
        const file = selectedFiles[index]!;
        setFileProgress(`ارسال ${index + 1} از ${selectedFiles.length}`);
        const kind = file.type === "image/gif" ? "gif"
          : file.type.startsWith("image/") ? "image" : "video";
        const message = await sendMediaMessage(file, kind, profile.id);
        onSent(message);
      }
      setSelectedFiles([]);
      setFileProgress("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "ارسال فایل ناموفق بود.");
    } finally {
      setMediaBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile || disabled || sending || !body.trim()) return;
    setSending(true);
    try {
      const message = await sendTextMessage(body, profile.id);
      onSent(message);
      setBody("");
      setEmojiOpen(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "ارسال پیام ناموفق بود.");
    } finally {
      setSending(false);
    }
  }

  const blocked = !profile || disabled || sending || mediaBusy;

  return (
    <div className="glass relative shrink-0 border-t border-white/10 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      {selectedFiles.length > 0 && (
        <div className="mb-3 rounded-2xl border border-primary/20 bg-background/80 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">رسانه‌های انتخاب‌شده ({selectedFiles.length})</p>
            <button type="button" onClick={() => setSelectedFiles([])}
              disabled={mediaBusy} className="text-xs text-muted-foreground">
              پاک کردن همه
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${file.lastModified}-${index}`}
                className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                {file.type.startsWith("image/") ? (
                  <img src={URL.createObjectURL(file)} alt={file.name}
                    className="size-full object-cover"
                    onLoad={(event) => URL.revokeObjectURL(event.currentTarget.src)} />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <Video className="size-7" />
                    <span className="max-w-full truncate px-1 text-[9px]">{file.name}</span>
                  </div>
                )}
                <button type="button" disabled={mediaBusy}
                  onClick={() => setSelectedFiles((current) => current.filter((_, i) => i !== index))}
                  aria-label="حذف فایل"
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{fileProgress || "آمادهٔ ارسال"}</span>
            <Button type="button" size="sm" disabled={mediaBusy} onClick={() => void sendSelectedFiles()}>
              {mediaBusy ? <LoaderCircle className="animate-spin" /> : <Send className="size-4" />}
              ارسال رسانه
            </Button>
          </div>
        </div>
      )}

      {recording === "video" && cameraStream && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-background/80 p-3">
          <div className="flex items-center gap-3">
            <video ref={videoPreview} muted playsInline className="size-16 rounded-full bg-black object-cover ring-2 ring-primary" />
            <div>
              <p className="text-sm font-semibold">در حال ضبط ویدیو مسیج</p>
              <p className="text-xs text-muted-foreground">برای ارسال، ضبط را متوقف کن</p>
            </div>
          </div>
          <Button type="button" size="icon" variant="destructive" onClick={stopRecording} aria-label="پایان ضبط">
            <Square className="size-4" />
          </Button>
        </div>
      )}

      {recording === "voice" && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-primary/30 bg-background/80 p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="size-2 animate-pulse rounded-full bg-red-500" />
            در حال ضبط پیام صوتی…
          </div>
          <Button type="button" size="icon" variant="destructive" onClick={stopRecording} aria-label="پایان ضبط">
            <Square className="size-4" />
          </Button>
        </div>
      )}

      {emojiOpen && (
        <div className="absolute bottom-full left-2 right-2 z-30 mb-2 overflow-hidden rounded-2xl border border-primary/20 bg-background/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Search className="size-4 text-muted-foreground" />
            <input value={emojiSearch} onChange={(e) => setEmojiSearch(e.target.value)}
              placeholder="جست‌وجوی شکلک…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            <button type="button" onClick={() => setEmojiOpen(false)} aria-label="بستن شکلک‌ها">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
            {emojiGroups.map((group, index) => (
              <button type="button" key={group.name} title={group.name}
                onClick={() => { setEmojiTab(index); setEmojiSearch(""); }}
                className={`rounded-lg px-2 py-1.5 text-lg ${emojiTab === index ? "bg-primary/20" : "hover:bg-muted"}`}>
                {group.icon}
              </button>
            ))}
          </div>
          <div className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto p-2">
            {filtered.map((emoji, index) => (
              <button type="button" key={`${emoji}-${index}`}
                onClick={() => setBody((value) => value + emoji)}
                className="rounded-lg p-1.5 text-2xl transition hover:scale-125 hover:bg-muted">
                {emoji}
              </button>
            ))}
          </div>
          <p className="px-3 pb-2 text-[10px] text-muted-foreground">شکلک‌ها با فونت دستگاه نمایش داده می‌شوند.</p>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        aria-label="انتخاب عکس و ویدیو"
        onChange={(event) => addFiles(event.target.files)}
      />
      <form onSubmit={submit} className="flex items-end gap-2">
        <Button type="button" variant="ghost" size="icon"
          className="shrink-0 rounded-xl" aria-label="شکلک‌ها"
          onClick={() => setEmojiOpen((value) => !value)} disabled={blocked}>
          <Smile className="size-5" />
        </Button>
        <Button type="button" variant="ghost" size="icon"
          className="shrink-0 rounded-xl" aria-label="انتخاب عکس و ویدیو"
          title="عکس و ویدیو"
          onClick={() => fileInput.current?.click()} disabled={blocked || !!recording}>
          <ImageIcon className="size-5" />
        </Button>

        <textarea
          aria-label="متن پیام"
          placeholder="پیامت رو بنویس…"
          rows={1}
          value={body}
          disabled={blocked || !!recording}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-background/65 px-4 py-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
        />

        {body.trim() ? (
          <Button type="submit" size="icon" disabled={blocked}
            className="size-11 shrink-0 rounded-2xl shadow-lg shadow-primary/20" aria-label="ارسال پیام">
            {sending ? <LoaderCircle className="animate-spin" /> : <Send className="-scale-x-100" />}
          </Button>
        ) : (
          <>
            <Button type="button" size="icon" variant="ghost"
              className="size-11 shrink-0 rounded-2xl" disabled={blocked || !!recording}
              onClick={() => void startRecording("voice")} aria-label="ضبط پیام صوتی" title="ویس">
              {mediaBusy ? <LoaderCircle className="animate-spin" /> : <Mic />}
            </Button>
            <Button type="button" size="icon"
              className="size-11 shrink-0 rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-lg shadow-primary/20"
              disabled={blocked || !!recording}
              onClick={() => void startRecording("video")} aria-label="ضبط ویدیو مسیج" title="ویدیو مسیج">
              <Video />
            </Button>
          </>
        )}
      </form>
      <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
        <Camera className="size-3" />
        <span>پیام‌های خصوصی M AND E</span>
        <span>·</span>
        <span>Enter برای ارسال، Shift + Enter برای خط جدید</span>
      </div>
    </div>
  );
}
