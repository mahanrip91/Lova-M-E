export type Side = "M" | "E";
export type MessageKind = "text" | "image" | "gif" | "video" | "voice" | "file" | "sticker" | "music" | "post" | "nontext";
export type MessageSource = "live" | "archive";

export interface Profile {
  id: string;
  display_name: string;
  side: Side;
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  body: string | null;
  kind: MessageKind;
  media_path: string | null;
  reply_to: string | null;
  client_id: string;
  source: MessageSource;
  created_at: string;
  edited_at: string | null;
}