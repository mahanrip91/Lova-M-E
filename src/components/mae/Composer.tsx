import { useEffect, useRef, useState, type FormEvent } from "react";
import EmojiPicker from "emoji-picker-react";
import {
  Camera, Image as ImageIcon, LoaderCircle, Mic, Send, Smile, Square, Video, X, Film
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMediaMessage, sendTextMessage } from "@/lib/chat/api";
import type { ChatMessage, Profile } from "@/lib/chat/types";



function ImageFilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <img src={url} alt={file.name}
      className="size-full object-cover" />
  );
}

type Props = {
  profile: Profile | null;
  disabled?: boolean;
  onSent: (message: ChatMessage) => void;
  onError: (message: string) => void;
};

export function Composer({ profile, disabled, onSent, onError }: Props) {
  const [body, setBody] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<"voice" | "video" | null>(null);
  const [capturedMedia, setCapturedMedia] = useState<{
    blob: Blob; kind: "voice" | "video"; url: string
  } | null>(null);

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
    if (!capturedMedia) return;
    return () => URL.revokeObjectURL(capturedMedia.url);
  }, [capturedMedia]);


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
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks.current, {
          type: mediaRecorder.mimeType || (kind === "voice" ? "audio/webm" : "video/webm")
        });
        stopStream();
        setRecording(null);
        if (!blob.size) return;
        setCapturedMedia({ blob, kind, url: URL.createObjectURL(blob) });
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


  async function sendCapturedMedia() {
    if (!profile || !capturedMedia || mediaBusy) return;
    setMediaBusy(true);
    try {
      const message = await sendMediaMessage(capturedMedia.blob, capturedMedia.kind, profile.id);
      onSent(message);
      setCapturedMedia(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "ارسال رسانه ناموفق بود.");
    } finally {
      setMediaBusy(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const videoTypes = ["video/webm", "video/mp4"];

    const valid = incoming.filter((file) =>
      imageTypes.includes(file.type) || videoTypes.includes(file.type)
    );

    if (valid.length !== incoming.length) {
      onError("فرمت بعضی فایل‌ها پشتیبانی نمی‌شود؛ عکس JPG، PNG، WebP، GIF و ویدیوی MP4 یا WebM انتخاب کن.");
    }

    const oversized = valid.find((file) =>
      file.size > (file.type.startsWith("video/") ? 25 : 12) * 1024 * 1024
    );

    if (oversized) {
      onError(oversized.type.startsWith("video/")
        ? "حجم هر ویدیو باید حداکثر ۲۵ مگابایت باشد."
        : "حجم هر عکس باید حداکثر ۱۲ مگابایت باشد.");
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
        setSelectedFiles(selectedFiles.slice(index + 1));
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

  const blocked = !profile || disabled || sending || mediaBusy || !!capturedMedia;

  return (
    <div className="glass relative shrink-0 border-t border-white/10 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">

      {capturedMedia && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <section className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/15 bg-background shadow-2xl">
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="font-bold">پیش‌نمایش پیام ضبط‌شده</p>
                <p className="text-xs text-muted-foreground">قبل از ارسال، گوش کن یا تماشایش کن</p>
              </div>
              <button type="button" onClick={() => setCapturedMedia(null)} disabled={mediaBusy}
                className="grid size-9 place-items-center rounded-full bg-muted" aria-label="بستن پیش‌نمایش">
                <X className="size-4" />
              </button>
            </header>
            <div className="flex min-h-48 items-center justify-center bg-black p-3">
              {capturedMedia.kind === "video" ? (
                <video src={capturedMedia.url} controls playsInline className="max-h-[65vh] w-full rounded-2xl object-contain" />
              ) : (
                <div className="w-full rounded-2xl bg-gradient-to-br from-primary/20 via-background to-fuchsia-500/20 p-6 text-center">
                  <div className="mx-auto mb-4 grid size-20 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
                    <Mic className="size-9" />
                  </div>
                  <p className="mb-4 font-semibold">پیام صوتی آمادهٔ ارسال</p>
                  <audio src={capturedMedia.url} controls className="w-full" />
                </div>
              )}
            </div>
            <footer className="flex gap-3 p-4">
              <Button type="button" variant="outline" className="flex-1 rounded-xl"
                disabled={mediaBusy} onClick={() => setCapturedMedia(null)}>
                ضبط دوباره
              </Button>
              <Button type="button" className="flex-1 rounded-xl" disabled={mediaBusy}
                onClick={() => void sendCapturedMedia()}>
                {mediaBusy ? <LoaderCircle className="animate-spin" /> : <Send className="size-4" />}
                تأیید و ارسال
              </Button>
            </footer>
          </section>
        </div>
      )}

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
                  <ImageFilePreview file={file} />
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
        <div className="fixed inset-0 z-[110] grid h-[100dvh] w-screen grid-rows-[auto_1fr_auto] items-center justify-items-center overflow-hidden bg-black/95 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div className="mb-3 flex w-full max-w-lg items-center justify-between text-white">
            <div>
              <p className="font-bold">در حال ضبط ویدیو مسیج</p>
              <p className="text-xs text-white/60">بعد از توقف، پیش‌نمایش و تأیید ارسال نمایش داده می‌شود</p>
            </div>
            <span className="flex items-center gap-2 text-xs text-red-400">
              <span className="size-2 animate-pulse rounded-full bg-red-500" /> ضبط
            </span>
          </div>
          <video ref={videoPreview} muted playsInline
            className="aspect-[3/4] max-h-[min(68dvh,680px)] min-h-0 w-auto max-w-full rounded-[2rem] bg-black object-cover ring-1 ring-white/20 shadow-[0_0_60px_rgba(130,80,255,0.18)]" />
          <Button type="button" size="lg" variant="destructive"
            className="mb-1 mt-3 h-14 w-full max-w-lg rounded-2xl text-base"
            onClick={stopRecording}>
            <Square className="size-5" /> توقف ضبط
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
        <div className="absolute bottom-full left-2 right-2 z-40 mb-2 overflow-hidden rounded-2xl border border-primary/20 bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">همهٔ شکلک‌ها</span>
            <button type="button" onClick={() => setEmojiOpen(false)} aria-label="بستن شکلک‌ها">
              <X className="size-4" />
            </button>
          </div>
          <EmojiPicker
            onEmojiClick={(item) => setBody((value) => value + item.emoji)}
            width="100%"
            height={340}
            searchPlaceHolder="جست‌وجوی شکلک…"
            previewConfig={{ showPreview: false }}
            skinTonesDisabled={false}
            lazyLoadEmojis
          />
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
