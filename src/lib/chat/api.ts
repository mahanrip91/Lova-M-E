import { supabase } from "@/lib/supabase";
import type { ChatMessage, Profile } from "./types";

const messageColumns = "id,sender_id,body,kind,media_path,reply_to,client_id,source,created_at,edited_at";

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Revalidate the user with Auth, not just a locally cached token.
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  const result = await supabase.auth.getUser();
  if (result.error || !result.data.user) return null;
  return data.session;
}

export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return null;
  const { data, error } = await supabase.from("profiles")
    .select("id,display_name,side").eq("id", auth.user.id).maybeSingle();
  if (error) throw error;
  if (!data || (data.side !== "M" && data.side !== "E")) return null;
  return data as Profile;
}

export async function listMessages(limit = 200): Promise<ChatMessage[]> {
  // Fetch the newest window, then render chronologically (not the oldest 200).
  const { data, error } = await supabase.from("messages").select(messageColumns)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ChatMessage[]).reverse();
}

export async function sendTextMessage(body: string, senderId: string): Promise<ChatMessage> {
  const text = body.trim();
  if (!text) throw new Error("EMPTY_MESSAGE");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user || auth.user.id !== senderId) throw new Error("INVALID_SENDER");
  const { data, error } = await supabase.from("messages").insert({
    sender_id: auth.user.id, body: text, kind: "text", source: "live",
    client_id: crypto.randomUUID(),
  }).select(messageColumns).single();
  if (error) throw error;
  return data as ChatMessage;
}

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const rows = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) rows.set(message.id, message);
  return [...rows.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
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