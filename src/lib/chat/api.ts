import { supabase } from "@/lib/supabase";
import { get, set } from "idb-keyval";
import type { ChatMessage, Profile } from "./types";

const messageColumns = "id,sender_id,body,kind,media_path,reply_to,client_id,source,created_at,edited_at";
const CHAT_CACHE_KEY = "mae:unified-chat:v1";

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// از نشست ذخیره‌شده استفاده می‌کنیم تا ورود آفلاین هم ممکن باشد.
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError) throw authError;
  const userId = auth.session?.user.id;
  if (!userId) return null;

  const cacheKey = `mae:profile:${userId}`;

  try {
    const { data, error } = await supabase.from("profiles")
      .select("id,display_name,side").eq("id", userId).maybeSingle();

    if (error) throw error;
    if (!data || (data.side !== "M" && data.side !== "E")) return null;

    const profile = data as Profile;
    await set(cacheKey, profile);
    return profile;
  } catch (error) {
    const cached = await get<Profile>(cacheKey);
    if (cached) return cached;
    throw error;
  }
}

async function fetchLiveMessages(limit = 200): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from("messages").select(messageColumns)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ChatMessage[]).reverse();
}

async function fetchArchiveMessages(limit = 50): Promise<ChatMessage[]> {
  const { data: profiles, error: profileError } = await supabase
    .from("profiles").select("id,side").in("side", ["M", "E"]);

  if (profileError) throw profileError;

  const ids: Record<string, string> = {};
  for (const p of profiles ?? []) {
    if (p.side === "M" || p.side === "E") ids[p.side] = p.id;
  }
  if (!ids["M"] || !ids["E"]) {
    throw new Error("پروفایل هر دو طرف گفتگو پیدا نشد.");
  }

  const { data, error } = await supabase.from("archive_messages")
    .select("uid,sender_side,occurred_at,body,kind,reply_uid,media_label,is_edited")
    .order("occurred_at", { ascending: false })
    .order("uid", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return [...(data ?? [])].reverse().map((row): ChatMessage => ({
    id: `archive:${row.uid}`,
    sender_id: ids[row.sender_side] ?? "",
    body: row.body,
    kind: ([
      "text", "image", "gif", "video", "voice",
      "music", "file", "sticker", "post", "nontext"
    ].includes(row.kind) ? row.kind : "nontext") as ChatMessage["kind"],
    media_path: row.media_label,
    reply_to: row.reply_uid ? `archive:${row.reply_uid}` : null,
    client_id: `archive:${row.uid}`,
    source: "archive",
    created_at: row.occurred_at,
    edited_at: row.is_edited ? row.occurred_at : null,
  }));
}

export async function saveMessagesCache(messages: ChatMessage[]) {
  try {
    await set(CHAT_CACHE_KEY, messages);
  } catch (error) {
    console.warn("M AND E cache save failed:", error);
  }
}

export async function listMessages(_profile: Profile): Promise<ChatMessage[]> {
  const cached = await get<ChatMessage[]>(CHAT_CACHE_KEY).catch(() => []);
  try {
    const [archive, live] = await Promise.all([
      fetchArchiveMessages(50),
      fetchLiveMessages(200)
    ]);
    const combined = mergeMessages(archive, live);
    await saveMessagesCache(combined);
    return combined;
  } catch (error) {
    if (cached?.length) return cached.slice(-250);
    throw error;
  }
}

export async function sendTextMessage(body: string, senderId: string): Promise<ChatMessage> {
  const text = body.trim();
  if (!text) throw new Error("EMPTY_MESSAGE");

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user || auth.user.id !== senderId) throw new Error("INVALID_SENDER");

  const { data, error } = await supabase.from("messages").insert({
    sender_id: auth.user.id,
    body: text,
    kind: "text",
    source: "live",
    client_id: crypto.randomUUID(),
  }).select(messageColumns).single();

  if (error) throw error;
  return data as ChatMessage;
}

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const rows = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) rows.set(message.id, message);
  return [...rows.values()].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

export function subscribeMessages(
  onInsert: (message: ChatMessage) => void,
  onStatus?: (status: string) => void,
  onUpdate?: (message: ChatMessage) => void,
  onDelete?: (id: string) => void,
) {
  const channel = supabase.channel(`mae-live-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
      (payload) => onInsert(payload.new as ChatMessage))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" },
      (payload) => onUpdate?.(payload.new as ChatMessage))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old.id) onDelete?.(old.id);
      })
    .subscribe((status) => onStatus?.(status));

  return () => { void supabase.removeChannel(channel); };
}

export function chatError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "invalid_credentials") return "ایمیل یا رمز درست نیست.";
  if (code === "email_not_confirmed") return "ابتدا ایمیلت را تأیید کن.";
  if (code === "42501") return "این حساب اجازهٔ دسترسی به گفتگو را ندارد.";
  return "ارتباط برقرار نشد یا دسترسی ممکن نیست؛ دوباره امتحان کن.";
}


export async function sendMediaMessage(
  file: Blob,
  kind: "voice" | "video" | "image" | "gif",
  senderId: string
): Promise<ChatMessage> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user || auth.user.id !== senderId) throw new Error("INVALID_SENDER");

  const mime = (file.type.split(";")[0] ?? "").toLowerCase();
  const allowed: Record<string, string[]> = {
    voice: ["audio/webm", "audio/mp4", "audio/ogg"],
    video: ["video/webm", "video/mp4"],
    image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"],
    gif: ["image/gif"],
  };
  if (!allowed[kind]?.includes(mime)) throw new Error("فرمت رسانه پشتیبانی نمی‌شود.");
  const maxSize = kind === "voice" ? 12 * 1024 * 1024
    : kind === "image" || kind === "gif" ? 12 * 1024 * 1024
    : 25 * 1024 * 1024;
  if (file.size > maxSize) throw new Error("حجم فایل بیش از حد مجاز است.");

  const ext = mime.includes("jpeg") ? "jpg"
    : mime.includes("png") ? "png"
    : mime.includes("webp") ? "webp"
    : mime.includes("gif") ? "gif"
    : mime.includes("heic") ? "heic"
    : mime.includes("heif") ? "heif"
    : mime.includes("mp4") ? "mp4"
    : mime.includes("ogg") ? "ogg" : "webm";
  const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("chat-media")
    .upload(path, file, { contentType: mime, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.from("messages").insert({
    sender_id: auth.user.id,
    body: "",
    kind,
    media_path: path,
    source: "live",
    client_id: crypto.randomUUID(),
  }).select(messageColumns).single();

  if (error) {
    await supabase.storage.from("chat-media").remove([path]);
    throw error;
  }
  return data as ChatMessage;
}

export async function getChatMediaBlob(path: string): Promise<Blob> {
  const cacheKey = `mae:media-cache:${path}`;
  const cached = await get<Blob>(cacheKey).catch(() => undefined);
  if (cached instanceof Blob && cached.size > 0) return cached;

  const { data, error } = await supabase.storage
    .from("chat-media")
    .download(path);
  if (error) throw error;
  if (!data || data.size === 0) throw new Error("فایل رسانه خالی است.");

  try {
    await set(cacheKey, data);
  } catch (cacheError) {
    console.warn("M AND E media cache failed:", cacheError);
  }
  return data;
}


export async function editLiveMessage(id: string, body: string): Promise<ChatMessage> {
  const clean = body.trim();
  if (!clean) throw new Error("متن پیام نمی‌تواند خالی باشد.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("نشست کاربری معتبر نیست.");

  const { data, error } = await supabase.from("messages")
    .update({ body: clean, edited_at: new Date().toISOString() })
    .eq("id", id)
    .eq("sender_id", auth.user.id)
    .select(messageColumns)
    .single();

  if (error) throw error;
  return data as ChatMessage;
}

export async function deleteLiveMessage(id: string): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("نشست کاربری معتبر نیست.");

  const { data: row, error: readError } = await supabase.from("messages")
    .select("id,media_path")
    .eq("id", id)
    .eq("sender_id", auth.user.id)
    .single();

  if (readError) throw readError;

  const { error } = await supabase.from("messages")
    .delete()
    .eq("id", id)
    .eq("sender_id", auth.user.id);

  if (error) throw error;

  if (row?.media_path) {
    const { error: storageError } = await supabase.storage
      .from("chat-media").remove([row.media_path]);
    if (storageError) console.warn("Media cleanup failed:", storageError);
  }
}
