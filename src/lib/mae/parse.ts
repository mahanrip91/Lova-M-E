// Detects and normalizes the supported chat exports. Runs entirely in the browser.
// Sensitive Rubika fields (file_id, access_hash_rec, dc_id, thumbnails, guids of 3rd parties) are dropped here.

export type Side = "M" | "E";
export type Kind = "text" | "image" | "gif" | "video" | "voice" | "music" | "file" | "sticker" | "post" | "nontext";

export interface Msg {
  u: string; // unique id: source:id
  s: string; // source id
  t: number; // UTC ms
  k: string; // sender key
  x: string; // text
  kd: Kind;
  o: number; // original order within source
  r?: string; // reply uid
  m?: string; // media label (file name / emoji)
  e?: 1; // edited
  f?: 1; // forwarded
}
export interface SenderInfo { key: string; name: string; count: number; guess: Side; guessReason: string }
export interface Source { id: string; kind: "rubika" | "telegram"; label: string; fileName: string; count: number; from: number; to: number; senders: SenderInfo[] }
export interface ParsedFile { source: Source; messages: Msg[] }

const plain = (s: string) => s.normalize("NFKC").toLowerCase();
function nameGuess(name: string): Side | null {
  const n = plain(name);
  if (n.includes("mahan") || n.includes("ماهان")) return "M";
  if (n.includes("elis") || n.includes("الیسا")) return "E";
  return null;
}
const rubikaKind: Record<string, Kind> = { Image: "image", Gif: "gif", Video: "video", Voice: "voice", Music: "music", File: "file" };

export function detectFormat(json: unknown): "rubika" | "telegram" | null {
  if (json && typeof json === "object" && !Array.isArray(json) && Array.isArray((json as any).messages) && "chat_guid" in (json as any)) return "rubika";
  if (Array.isArray(json) && json.length > 0 && typeof json[0] === "object" && "sender_id" in json[0] && "date" in json[0]) return "telegram";
  return null;
}

function finalizeSenders(counts: Map<string, { name: string; count: number }>, hint: (key: string) => { side: Side | null; reason: string }): SenderInfo[] {
  const list = [...counts.entries()].map(([key, v]) => ({ key, ...v, ...hint(key) }));
  const out: SenderInfo[] = list.map((x) => ({ key: x.key, name: x.name, count: x.count, guess: x.side ?? "E", guessReason: x.side ? x.reason : "" }));
  // If only one side is known, the other sender is assumed to be the other side.
  if (out.length === 2) {
    const known = list.find((x) => x.side);
    list.forEach((x, i) => {
      if (!x.side && known && out[i]) { out[i].guess = known.side === "M" ? "E" : "M"; out[i]!.guessReason = "حدس: طرف مقابل در همین گفتگو"; }
    });
  }
  return out;
}

export function parseRubika(json: any, fileName: string): ParsedFile {
  const id = "R";
  const raw: any[] = json.messages;
  const counts = new Map<string, { name: string; count: number }>();
  const messages: Msg[] = raw.map((m, i) => {
    const k = `R:${m.author_object_guid}`;
    const c = counts.get(k) ?? { name: k === `R:${json.chat_guid}` ? "طرف مقابل گفتگو (Rubika)" : "صاحب خروجی (Rubika)", count: 0 };
    c.count++;
    counts.set(k, c);
    const fi = m.file_inline;
    let kd: Kind = "text";
    let media: string | undefined;
    if (m.type === "Sticker") { kd = "sticker"; media = m.sticker?.emoji_character; }
    else if (m.type === "RubinoPost") kd = "post";
    else if (fi) { kd = rubikaKind[fi.type] ?? "file"; media = fi.file_name; }
    const msg: Msg = { u: `R:${m.message_id}`, s: id, t: Number(m.time) * 1000, k, x: typeof m.text === "string" ? m.text : "", kd, o: i };
    if (m.reply_to_message_id) msg.r = `R:${m.reply_to_message_id}`;
    if (media) msg.m = String(media).slice(0, 80);
    if (m.is_edited) msg.e = 1;
    if (m.forwarded_from || m.forwarded_no_link) msg.f = 1;
    return msg;
  });
  const senders = finalizeSenders(counts, (key) =>
    key === `R:${json.chat_guid}`
      ? { side: "E", reason: "حدس: شناسه‌ی گفتگو معمولاً متعلق به طرف مقابل است" }
      : { side: "M", reason: "حدس: صاحب خروجی" },
  );
  return { source: mkSource(id, "rubika", "روبیکا", fileName, messages, senders), messages };
}

export function parseTelegram(json: any[], fileName: string, id: string, label: string): ParsedFile {
  const counts = new Map<string, { name: string; count: number }>();
  const messages: Msg[] = json.map((m, i) => {
    const k = `T:${m.sender_id}`;
    const c = counts.get(k) ?? { name: String(m.sender_name ?? m.sender_id), count: 0 };
    c.count++;
    counts.set(k, c);
    const x = typeof m.text === "string" ? m.text : "";
    const msg: Msg = { u: `${id}:${m.id}`, s: id, t: Date.parse(m.date), k, x, kd: x ? "text" : "nontext", o: i };
    if (m.reply_to != null) msg.r = `${id}:${m.reply_to}`;
    return msg;
  });
  const senders = finalizeSenders(counts, (key) => {
    const side = nameGuess(counts.get(key)!.name);
    return { side, reason: side ? "از روی نام فرستنده" : "" };
  });
  return { source: mkSource(id, "telegram", label, fileName, messages, senders), messages };
}

function mkSource(id: string, kind: Source["kind"], label: string, fileName: string, messages: Msg[], senders: SenderInfo[]): Source {
  let from = Infinity, to = -Infinity;
  for (const m of messages) { if (m.t < from) from = m.t; if (m.t > to) to = m.t; }
  return { id, kind, label, fileName, count: messages.length, from, to, senders };
}

/** Telegram files get a stable id from their sender pair so re-importing replaces, not duplicates. */
export function telegramSourceId(json: any[]): string {
  const ids = [...new Set(json.slice(0, 5000).map((m) => String(m.sender_id)))].sort();
  return "T" + ids.join("-");
}

export function sortMessages(all: Msg[], sourceOrder: string[]): Msg[] {
  const rank = new Map(sourceOrder.map((s, i) => [s, i]));
  return all.sort((a, b) => a.t - b.t || (rank.get(a.s) ?? 0) - (rank.get(b.s) ?? 0) || a.o - b.o);
}

/** Persian-aware normalization for search. */
export function normalizeFa(s: string): string {
  return s
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u200c\u200d\u200e\u200f]/g, "")
    .toLowerCase();
}
