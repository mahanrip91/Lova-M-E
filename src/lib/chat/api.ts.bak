import { supabase } from "@/lib/supabase";
import { get, set } from "idb-keyval";
import type { ChatMessage, Profile } from "./types";

const messageColumns = "id,sender_id,body,kind,media_path,reply_to,client_id,source,created_at,edited_at";
const CHAT_CACHE_KEY = "mae:unified-chat:v1";
const ARCHIVE_COMPLETE_KEY = "mae:archive-complete:v1";

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

async function fetchArchiveMessages(): Promise<ChatMessage[]> {
  const { data: profiles, error: profileError } = await supabase
    .from("profiles").select("id,side").in("side", ["M", "E"]);

  if (profileError) throw profileError;

  const ids: Record<string, string> = {};
  for (const p of profiles ?? []) {
    if (p.side === "M" || p.side === "E") ids[p.side] = p.id;
  }
  if (!ids["M"] || !ids["E"]) throw new Error("پروفایل هر دو طرف گفتگو پیدا نشد.");

  type ArchiveRow = {
    uid: string;
    sender_side: "M" | "E";
    occurred_at: string;
    body: string | null;
    kind: string;
    reply_uid: string | null;
    media_label: string | null;
    is_edited: boolean;
  };

  const { count, error: countError } = await supabase
    .from("archive_messages")
    .select("uid", { count: "exact", head: true });

  if (countError) throw countError;
  if (count === null) throw new Error("تعداد پیام‌های آرشیو قابل بررسی نیست.");

  const rows: ArchiveRow[] = [];
  const pageSize = 1000;
  const batchSize = 8;

  // صفحه‌بندی برای دریافت کامل آرشیو، بدون محدودیت ۱۰۰۰ ردیفی Supabase
  for (let base = 0; ; base += pageSize * batchSize) {
    const starts = Array.from(
      { length: batchSize },
      (_, i) => base + i * pageSize
    );

    const pages = await Promise.all(starts.map(async (start) => {
      const { data, error } = await supabase.from("archive_messages")
        .select("uid,sender_side,occurred_at,body,kind,reply_uid,media_label,is_edited")
        .order("occurred_at", { ascending: true })
        .order("uid", { ascending: true })
        .range(start, start + pageSize - 1);

      if (error) throw error;
      return (data ?? []) as ArchiveRow[];
    }));

    for (const page of pages) rows.push(...page);

    if (pages.some((page) => page.length < pageSize)) break;
  }

  if (rows.length !== count) {
    throw new Error(`آرشیو ناقص دریافت شد: ${rows.length} از ${count}`);
  }

  return rows.map((row): ChatMessage => ({
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

export async function listMessages(profile: Profile): Promise<ChatMessage[]> {
  const cached = await get<ChatMessage[]>(CHAT_CACHE_KEY).catch(() => []);
  const cachedRows = cached ?? [];
  const cachedArchive = cachedRows.filter((m) => m.source === "archive");

  try {
    // فقط آرشیوی که نشانگر تکمیل معتبر دارد از کش خوانده می‌شود.
    const cachedComplete = await get<number>(ARCHIVE_COMPLETE_KEY).catch(() => 0);
    const useCache = cachedArchive.length > 0 &&
      cachedComplete === cachedArchive.length;

    const archive = useCache ? cachedArchive : await fetchArchiveMessages();
    const live = await fetchLiveMessages();
    const combined = mergeMessages(archive, live);

    await saveMessagesCache(combined);
    if (!useCache) await set(ARCHIVE_COMPLETE_KEY, archive.length);

    return combined;
  } catch (error) {
    // اگر اینترنت قطع بود، نسخهٔ ذخیره‌شده روی گوشی نمایش داده می‌شود.
    if (cachedRows.length) return cachedRows;
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
) {
  const channel = supabase.channel(`mae-live-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
      (payload) => onInsert(payload.new as ChatMessage))
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
