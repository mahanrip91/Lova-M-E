import type { ChatMessage, Profile } from "@/lib/chat/types";
// Offline-first local cache; the canonical archive and shared memory settings live in Supabase.
import { useSyncExternalStore } from "react";
import { get, set, del } from "idb-keyval";
import { supabase } from "@/lib/supabase";
import {
  detectFormat,
  parseRubika,
  parseTelegram,
  parseTelegramDesktop,
  sortMessages,
  telegramSourceId,
  type Msg,
  type Side,
  type Source,
} from "./parse";
import { dayStats, sessionize, type DayStat, type Session } from "./analysis";
import { jalaliToUtc } from "./time";

type LiveMessageRow = {
  id: string;
  sender_id: string;
  body: string | null;
  kind: Msg["kd"];
  media_path: string | null;
  created_at: string;
  reply_to: string | null;
  edited_at: string | null;
};

type ArchiveMessageRow = {
  uid: string;
  source_id: string;
  occurred_at: string;
  sender_key: string;
  body: string | null;
  kind: string;
  original_order: number;
  reply_uid: string | null;
  media_label: string | null;
  is_edited: boolean | null;
  is_forwarded: boolean | null;
};

export type EventKind = "bd-mahan" | "bd-elisa" | "mahan-celebrates" | "elisa-greets" | "custom";
export interface MemoryEvent {
  id: string;
  kind: EventKind;
  title: string;
  from: number;
  to: number;
  origin: "manual" | "candidate" | "preset";
  confidence?: string;
  /** true = the user confirmed it happened but it is not in the messages */ unavailable?: boolean;
}
export interface SideEntry {
  side: Side;
  confirmed: boolean;
  name: string;
  reason: string;
}
export interface Settings {
  presetsApplied?: number;
  startMs: number;
  firstFrom: number;
  firstTo: number;
  startConfirmed: boolean;
  /** source holding the first-day group archive */
  firstSourceId: string | null;
  /** First three confirmed private-chat sessions, shared across devices. */
  beganFrom?: number;
  beganTo?: number;
  beganSourceId?: string | null;
  beganCount?: number;
}

export const DEFAULT_START = jalaliToUtc(1405, 1, 26, 3, 28, 0); // user-confirmed: 26 Farvardin 1405, 03:28 Tehran
const OLD_DEFAULT_START = jalaliToUtc(1405, 1, 26, 0, 0, 0);
export const defaultSettings = (): Settings => ({
  startMs: DEFAULT_START,
  startConfirmed: true,
  firstSourceId: "rubika_assassins_20260415_0329_0507",
  firstFrom: Date.parse("2026-04-14T23:58:36.000Z"),
  firstTo: Date.parse("2026-04-15T01:37:00.000Z"),
  beganFrom: Date.parse("2026-04-14T23:58:36.000Z"),
  beganTo: Date.parse("2026-04-15T01:37:00.000Z"),
  beganSourceId: null,
  beganCount: 282,
});

const HOUR = 3600000;
const PRESETS_VERSION = 2;
/** User-confirmed dates (birthdays: Mahan 10 Mehr, Elisa 8 Tir; Elisa's greeting 1405/07/10 00:33). */
export function presetEvents(): MemoryEvent[] {
  const bdM = jalaliToUtc(1405, 7, 10),
    bdE = jalaliToUtc(1405, 4, 8),
    greet = jalaliToUtc(1405, 7, 10, 0, 33);
  return [
    {
      id: "bd-mahan",
      kind: "bd-mahan",
      title: "تولد ماهان",
      from: bdM,
      to: bdM + 24 * HOUR - 1,
      origin: "preset",
    },
    {
      id: "bd-elisa",
      kind: "bd-elisa",
      title: "تولد الیسا",
      from: bdE,
      to: bdE + 24 * HOUR - 1,
      origin: "preset",
    },
    {
      id: "elisa-greets",
      kind: "elisa-greets",
      title: "الیسا تولد ماهان را جشن گرفت",
      from: greet - 10 * 60000,
      to: greet + 3 * HOUR,
      origin: "preset",
    },
    {
      id: "mahan-celebrates",
      kind: "mahan-celebrates",
      title: "ماهان تولد الیسا را جشن گرفت",
      from: bdE,
      to: bdE + 24 * HOUR - 1,
      origin: "preset",
      unavailable: true,
    },
  ];
}
/** Adds missing preset events once (per preset version); never overwrites user edits. */
export function applyPresets(
  events: MemoryEvent[],
  settings: Settings,
): { events: MemoryEvent[]; settings: Settings; changed: boolean } {
  let changed = false;
  let st = settings;
  const migratedEvents = events.map((event) => {
    if (
      event.kind === "elisa-greets" &&
      event.origin === "preset" &&
      event.title === "الیسا تولد ماهان را تبریک گفت"
    ) {
      changed = true;
      return { ...event, title: "الیسا تولد ماهان را جشن گرفت" };
    }
    return event;
  });
  if (st.startMs === OLD_DEFAULT_START) {
    st = { ...st, startMs: DEFAULT_START };
    changed = true;
  }
  if ((st.presetsApplied ?? 0) >= PRESETS_VERSION)
    return { events: migratedEvents, settings: st, changed };
  const have = new Set(migratedEvents.map((e) => e.kind));
  const add = presetEvents().filter((p) => !have.has(p.kind));
  return {
    events: [...migratedEvents, ...add],
    settings: { ...st, presetsApplied: PRESETS_VERSION },
    changed: true,
  };
}

interface State {
  status: "loading" | "empty" | "ready";
  messages: Msg[];
  sources: Source[];
  sides: Record<string, SideEntry>;
  bookmarks: string[];
  events: MemoryEvent[];
  settings: Settings;
  // derived
  uidIndex: Map<string, number>;
  sessions: Session[];
  days: DayStat[];
  archiveDays: DayStat[];
}

let state: State = {
  status: "loading",
  messages: [],
  sources: [],
  sides: {},
  bookmarks: [],
  events: [],
  settings: defaultSettings(),
  uidIndex: new Map(),
  sessions: [],
  days: [],
  archiveDays: [],
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function setState(p: Partial<State>) {
  state = { ...state, ...p };
  emit();
}

export const sideOf = (k: string): Side | undefined => state.sides[k]?.side;
function derive(messages: Msg[], sides: Record<string, SideEntry>) {
  const uidIndex = new Map<string, number>();
  messages.forEach((m, i) => uidIndex.set(m.u, i));
  return {
    uidIndex,
    sessions: sessionize(messages),
    days: dayStats(messages, (k) => sides[k]?.side),
  };
}

let remoteSynced = false;
let remoteSyncPromise: Promise<boolean> | null = null;
const ARCHIVE_PAGE_SIZE = 50;
let archiveOffset = 0;
let archiveTotal = 0;
let archivePageLoading = false;

async function syncRemoteArchive() {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return false;

  const [
    { data: sourceRows, error: sourceError },
    { data: senderRows, error: senderError },
    { data: profiles, error: profileError },
    { data: sharedState, error: sharedStateError },
  ] = await Promise.all([
    supabase
      .from("archive_sources")
      .select("id,platform,label,file_name,is_group,message_count,from_at,to_at")
      .order("from_at"),
    supabase
      .from("archive_senders")
      .select("source_id,sender_key,display_name,side,confirmed,guess_reason,message_count"),
    supabase.from("profiles").select("id,display_name,side"),
    supabase.from("mae_shared_state").select("settings,events").eq("id", "main").maybeSingle(),
  ]);

  if (sourceError) throw sourceError;
  if (senderError) throw senderError;
  if (profileError) throw profileError;
  if (sharedStateError) throw sharedStateError;

  const sources = (sourceRows ?? []).map((r) => ({
    id: r.id,
    kind: r.platform === "rubika" ? ("rubika" as const) : ("telegram" as const),
    isGroup: !!r.is_group,
    label: r.label,
    fileName: r.file_name,
    count: Number(r.message_count),
    from: Date.parse(r.from_at),
    to: Date.parse(r.to_at),
    senders: (senderRows ?? [])
      .filter((x) => x.source_id === r.id)
      .map((x) => ({
        key: `${r.id}:${x.sender_key}`,
        name: x.display_name,
        count: Number(x.message_count),
        guess: x.side === "M" || x.side === "E" ? x.side : ("O" as const),
        guessReason: x.guess_reason ?? "",
      })),
  }));

  const sides: Record<string, SideEntry> = {};
  for (const r of senderRows ?? []) {
    const key = `${r.source_id}:${r.sender_key}`;
    sides[key] = {
      side: r.side === "M" || r.side === "E" ? r.side : "O",
      confirmed: !!r.confirmed,
      name: r.display_name,
      reason: r.guess_reason ?? "",
    };
  }

  const expected = (sourceRows ?? []).reduce((n, r) => n + Number(r.message_count), 0);
  const { count, error: countError } = await supabase
    .from("archive_messages")
    .select("uid", { count: "exact", head: true });
  if (countError) throw countError;
  if (count !== expected)
    throw new Error(`تعداد آرشیو با منابع برابر نیست: ${count} / ${expected}`);

  // تقویم فقط آمار می‌گیرد؛ متن پیام‌ها دانلود نمی‌شود.
  const { data: statRows, error: statsError } = await supabase.rpc(
    "get_archive_day_stats",
    { p_source_id: null },
  );
  if (statsError) throw statsError;

  type ArchiveDayStatRow = {
    day: string;
    total: number | string;
    m_count: number | string;
    e_count: number | string;
    o_count: number | string;
    hours?: unknown;
  };

  const archiveDays: DayStat[] = (statRows ?? []).map((r: ArchiveDayStatRow) => ({
    day: String(r.day),
    total: Number(r.total),
    M: Number(r.m_count),
    E: Number(r.e_count),
    O: Number(r.o_count),
    first: 0,
    hours: Array.isArray(r.hours)
      ? r.hours.map(Number)
      : new Array(24).fill(0),
  }));

  // پیام‌های آرشیو در شروع برنامه دانلود نمی‌شوند.
  // فقط با انتخاب تاریخ، محتوای همان بازه دریافت می‌شود.
  archiveOffset = 0;
  archiveTotal = count ?? 0;

  const kindMap: Record<string, Msg["kd"]> = {
    text: "text",
    image: "image",
    gif: "gif",
    video: "video",
    voice: "voice",
    music: "music",
    file: "file",
    sticker: "sticker",
    post: "post",
    nontext: "nontext",
  };

  const messages: Msg[] = [];

  // پیام‌های زنده نیز به همان جریان زمانی اضافه می‌شوند.
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const { count: liveCount, error: liveCountError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true });
  if (liveCountError) throw liveCountError;

  const liveRows: LiveMessageRow[] = [];
  for (let base = 0; base < (liveCount ?? 0); base += 1000) {
    const { data, error } = await supabase
      .from("messages")
      .select("id,sender_id,body,kind,media_path,created_at,reply_to,edited_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(base, base + 999);
    if (error) throw error;
    liveRows.push(...(data ?? []));
  }

  if (liveRows.length !== liveCount) throw new Error("دریافت پیام‌های زنده کامل نشد.");

  const liveSource: Source = {
    id: "LIVE",
    kind: "telegram",
    isGroup: false,
    label: "گفتگوی زنده",
    fileName: "Supabase",
    count: liveRows.length,
    from: liveRows[0] ? Date.parse(liveRows[0].created_at) : Date.now(),
    to: liveRows.length > 0 ? Date.parse(liveRows[liveRows.length - 1]!.created_at) : Date.now(),
    senders: [],
  };

  for (const p of profiles ?? []) {
    if (p.side === "M" || p.side === "E") {
      const key = `LIVE:${p.side}`;
      sides[key] = { side: p.side, confirmed: true, name: p.display_name, reason: "" };
      liveSource.senders.push({
        key,
        name: p.display_name,
        count: liveRows.filter((m) => m.sender_id === p.id).length,
        guess: p.side,
        guessReason: "",
      });
    }
  }

  const liveMessages: Msg[] = liveRows.map((r) => {
    const p = profileById.get(r.sender_id);
    const side = p?.side === "M" || p?.side === "E" ? p.side : "O";
    const m: Msg = {
      u: `live:${r.id}`,
      s: "LIVE",
      t: Date.parse(r.created_at),
      k: `LIVE:${side}`,
      x: r.body ?? "",
      kd: kindMap[r.kind] ?? "nontext",
      o: 0,
    };
    if (r.media_path) m.mediaPath = r.media_path;
    if (r.reply_to) m.r = `live:${r.reply_to}`;
    if (r.edited_at) m.e = 1;
    return m;
  });

  const allSources = liveRows.length ? [...sources, liveSource] : sources;
  const allMessages = sortMessages(
    [...messages, ...liveMessages],
    allSources.map((x) => x.id),
  );

  const [savedEvents, savedSettings] = await Promise.all([
    get<MemoryEvent[]>("mae:events"),
    get<Settings>("mae:settings"),
  ]);
  const mergedEvents = new Map<string, MemoryEvent>();
  for (const event of savedEvents ?? state.events) mergedEvents.set(event.id, event);
  for (const event of (Array.isArray(sharedState?.events) ? sharedState.events : []) as MemoryEvent[]) mergedEvents.set(event.id, event);
  const p = applyPresets([...mergedEvents.values()], {
    ...defaultSettings(),
    ...(savedSettings ?? state.settings),
    ...((sharedState?.settings && typeof sharedState.settings === "object") ? sharedState.settings as Partial<Settings> : {}),
  });
  await Promise.all([
    set("mae:messages", allMessages),
    set("mae:sources", allSources),
    set("mae:sides", sides),
    set("mae:events", p.events),
    set("mae:settings", p.settings),
    set("mae:archive-days", archiveDays),
  ]);

  setState({
    status: expected + liveMessages.length > 0 ? "ready" : "empty",
    messages: allMessages,
    sources: allSources,
    sides,
    events: p.events,
    settings: p.settings,
    archiveDays,
    ...derive(allMessages, sides),
  });
  await persistSharedState(p.settings, p.events);
  remoteSynced = true;
  return true;
}

export async function upsertLiveChatMessages(rows: ChatMessage[], profile: Profile): Promise<void> {
  if (!rows.length) return;

  const messages = [...state.messages];
  const sides = { ...state.sides };
  const seen = new Set(messages.map((m) => m.u));

  for (const row of rows) {
    const side: Side =
      row.sender_id === profile.id ? profile.side : profile.side === "M" ? "E" : "M";

    const key = `LIVE:${side}`;
    const old = sides[key];

    sides[key] = {
      side,
      confirmed: true,
      name:
        old?.name ??
        (side === profile.side ? profile.display_name : side === "M" ? "ماهان" : "الیسا"),
      reason: "",
    };

    const uid = `live:${row.id}`;
    const message: Msg = {
      u: uid,
      s: "LIVE",
      t: Date.parse(row.created_at),
      k: key,
      x: row.body ?? "",
      kd: row.kind,
      o: 0,
    };
    if (row.media_path) message.mediaPath = row.media_path;
    if (row.reply_to) message.r = `live:${row.reply_to}`;
    if (row.edited_at) message.e = 1;

    const existingIndex = messages.findIndex((item) => item.u === uid);
    if (existingIndex >= 0) messages[existingIndex] = message;
    else messages.push(message);
  }

  const liveMessages = messages.filter((m) => m.s === "LIVE");
  const existingSource = state.sources.find((s) => s.id === "LIVE");

  const liveSource: Source = {
    id: "LIVE",
    kind: "telegram",
    isGroup: false,
    label: "گفتگوی زنده",
    fileName: "Supabase",
    count: liveMessages.length,
    from: liveMessages.length ? Math.min(...liveMessages.map((m) => m.t)) : Date.now(),
    to: liveMessages.length ? Math.max(...liveMessages.map((m) => m.t)) : Date.now(),
    senders: (["M", "E"] as Side[]).map((side) => ({
      key: `LIVE:${side}`,
      name: sides[`LIVE:${side}`]?.name ?? (side === "M" ? "ماهان" : "الیسا"),
      count: liveMessages.filter((m) => m.k === `LIVE:${side}`).length,
      guess: side,
      guessReason: "",
    })),
  };

  const sources = existingSource
    ? state.sources.map((s) => (s.id === "LIVE" ? liveSource : s))
    : [...state.sources, liveSource];

  const sorted = sortMessages(
    messages,
    sources.map((s) => s.id),
  );

  await Promise.all([
    set("mae:messages", sorted),
    set("mae:sources", sources),
    set("mae:sides", sides),
  ]);

  setState({
    messages: sorted,
    sources,
    sides,
    status: sorted.length ? "ready" : "empty",
    ...derive(sorted, sides),
  });
}

export async function updateLiveMessageInStore(row: ChatMessage): Promise<void> {
  const uid = `live:${row.id}`;
  const messages = state.messages.map((m) => {
    if (m.u !== uid) return m;
    const next = { ...m, x: row.body ?? "", e: 1 as const };
    return next;
  });
  await set("mae:messages", messages);
  setState({ messages, ...derive(messages, state.sides) });
}

export async function removeLiveMessageFromStore(id: string): Promise<void> {
  const uid = `live:${id}`;
  const messages = state.messages.filter((m) => m.u !== uid);
  await set("mae:messages", messages);
  setState({ messages, ...derive(messages, state.sides) });
}

export function syncRemoteArchiveAfterLogin(): Promise<boolean> {
  if (remoteSynced) return Promise.resolve(true);
  if (!remoteSyncPromise) {
    remoteSyncPromise = syncRemoteArchive().finally(() => {
      remoteSyncPromise = null;
    });
  }
  return remoteSyncPromise;
}

export function hasOlderArchiveMessages() {
  return archiveOffset < archiveTotal;
}

export async function loadOlderArchiveMessages(): Promise<number> {
  if (archivePageLoading || !hasOlderArchiveMessages()) return 0;

  archivePageLoading = true;
  try {
    const start = archiveOffset;
    const { data, error } = await supabase
      .from("archive_messages")
      .select(
        "uid,source_id,occurred_at,sender_key,body,kind,original_order,reply_uid,media_label,is_edited,is_forwarded",
      )
      .order("occurred_at", { ascending: false })
      .order("uid", { ascending: false })
      .range(start, start + ARCHIVE_PAGE_SIZE - 1);

    if (error) throw error;

    const rows = [...(data ?? [])].reverse();
    if (!rows.length) {
      archiveOffset = archiveTotal;
      return 0;
    }

    const kindMap: Record<string, Msg["kd"]> = {
      text: "text",
      image: "image",
      gif: "gif",
      video: "video",
      voice: "voice",
      music: "music",
      file: "file",
      sticker: "sticker",
      post: "post",
      nontext: "nontext",
    };

    const older: Msg[] = rows.map((r: ArchiveMessageRow) => {
      const m: Msg = {
        u: `archive:${r.uid}`,
        s: r.source_id,
        t: Date.parse(r.occurred_at),
        k: `${r.source_id}:${r.sender_key}`,
        x: r.body ?? "",
        kd: kindMap[r.kind] ?? "nontext",
        o: Number(r.original_order),
      };
      if (r.reply_uid) m.r = `archive:${r.reply_uid}`;
      if (r.media_label) m.m = r.media_label;
      if (r.is_edited) m.e = 1;
      if (r.is_forwarded) m.f = 1;
      return m;
    });

    const seen = new Set(state.messages.map((m) => m.u));
    const merged = sortMessages(
      [...state.messages, ...older.filter((m) => !seen.has(m.u))],
      state.sources.map((s) => s.id),
    );

    await set("mae:messages", merged);
    setState({
      messages: merged,
      status: merged.length ? "ready" : "empty",
      ...derive(merged, state.sides),
    });

    archiveOffset += rows.length;
    return rows.length;
  } finally {
    archivePageLoading = false;
  }
}

/**
 * Loads a selected memory range plus six hours of surrounding context.
 * Uses bounded pages instead of downloading the entire archive.
 */
export async function ensureArchiveRange(from: number, to: number): Promise<number> {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;

  const startAt = new Date(from).toISOString();
  const endAt = new Date(to).toISOString();
  const pageSize = 1000;
  const rows: ArchiveMessageRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("archive_messages")
      .select(
        "uid,source_id,occurred_at,sender_key,body,kind,original_order,reply_uid,media_label,is_edited,is_forwarded",
      )
      .gte("occurred_at", startAt)
      .lte("occurred_at", endAt)
      .order("occurred_at", { ascending: true })
      .order("uid", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  const kindMap: Record<string, Msg["kd"]> = {
    text: "text",
    image: "image",
    gif: "gif",
    video: "video",
    voice: "voice",
    music: "music",
    file: "file",
    sticker: "sticker",
    post: "post",
    nontext: "nontext",
  };

  const incoming: Msg[] = rows.map((r: ArchiveMessageRow) => {
    const m: Msg = {
      u: `archive:${r.uid}`,
      s: r.source_id,
      t: Date.parse(r.occurred_at),
      k: `${r.source_id}:${r.sender_key}`,
      x: r.body ?? "",
      kd: kindMap[r.kind] ?? "nontext",
      o: Number(r.original_order),
    };
    if (r.reply_uid) m.r = `archive:${r.reply_uid}`;
    if (r.media_label) m.m = r.media_label;
    if (r.is_edited) m.e = 1;
    if (r.is_forwarded) m.f = 1;
    return m;
  });

  const seen = new Set(state.messages.map((m) => m.u));
  const merged = sortMessages(
    [...state.messages, ...incoming.filter((m) => !seen.has(m.u))],
    state.sources.map((source) => source.id),
  );

  await set("mae:messages", merged);
  setState({
    messages: merged,
    status: merged.length ? "ready" : "empty",
    ...derive(merged, state.sides),
  });

  return incoming.length;
}

let started = false;
export function initStore() {
  if (started || typeof window === "undefined") return;
  started = true;
  (async () => {
    try {
      const [messages, sources, sides, bookmarks, events, settings, archiveDays] = await Promise.all([
        get<Msg[]>("mae:messages"),
        get<Source[]>("mae:sources"),
        get("mae:sides"),
        get<string[]>("mae:bookmarks"),
        get<MemoryEvent[]>("mae:events"),
        get<Settings>("mae:settings"),
        get<DayStat[]>("mae:archive-days"),
      ]);
      const msgs = messages ?? [];
      const sd = (sides as Record<string, SideEntry>) ?? {};
      const p = applyPresets(events ?? [], { ...defaultSettings(), ...(settings ?? {}) });
      if (p.changed)
        await Promise.all([set("mae:events", p.events), set("mae:settings", p.settings)]);
      setState({
        status: msgs.length || (sources?.length ?? 0) ? "ready" : "empty",
        messages: msgs,
        sources: sources ?? [],
        sides: sd,
        bookmarks: bookmarks ?? [],
        events: p.events,
        settings: p.settings,
        archiveDays: archiveDays ?? [],
        ...derive(msgs, sd),
      });

      // نمایش فوری آرشیو محلی؛ همگام‌سازی شبکه در پس‌زمینه
      void syncRemoteArchiveAfterLogin().catch((error) => {
        console.warn("M AND E remote archive sync failed:", error);
      });
    } catch (error) {
      console.warn("M AND E local store initialization failed:", error);
      setState({ status: state.messages.length ? "ready" : "empty" });
    }
  })();
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
    () => sel(state),
  );
}
export const getState = () => state;

// ---- import ----
export interface ImportReport {
  fileName: string;
  ok: boolean;
  message: string;
}
export async function importFiles(
  files: File[],
  onProgress?: (p: string) => void,
): Promise<ImportReport[]> {
  const reports: ImportReport[] = [];
  let sources = [...state.sources];
  let all = [...state.messages];
  const sides = { ...state.sides };
  let tgN = sources.filter((s) => s.kind === "telegram").length;
  for (const file of files) {
    onProgress?.(`در حال خواندن ${file.name}…`);
    try {
      const json = JSON.parse(await file.text());
      if (json?.format === BUNDLE_FORMAT) {
        if (files.length !== 1)
          throw new Error("بستهٔ کامل را به‌تنهایی انتخاب کن، نه همراه فایل‌های دیگر");
        await restoreBundle(json as Bundle);
        reports.push({
          fileName: file.name,
          ok: true,
          message: `بسته‌ی کامل: ${(json.messages?.length ?? 0).toLocaleString("fa-IR")} پیام و همه‌ی تنظیمات`,
        });
        sources = [...state.sources];
        all = [...state.messages];
        Object.assign(sides, state.sides);
        continue;
      }
      const fmt = detectFormat(json);
      if (!fmt) {
        reports.push({ fileName: file.name, ok: false, message: "قالب فایل شناخته نشد" });
        continue;
      }
      const parsed =
        fmt === "rubika"
          ? parseRubika(json, file.name)
          : fmt === "tgdesktop"
            ? parseTelegramDesktop(json, file.name)
            : (() => {
                const id = telegramSourceId(json);
                const existing = sources.find((s) => s.id === id);
                return parseTelegram(
                  json,
                  file.name,
                  id,
                  existing?.label ?? `تلگرام ${["۱", "۲", "۳", "۴"][tgN++] ?? ""}`,
                );
              })();
      sources = sources.filter((s) => s.id !== parsed.source.id).concat(parsed.source);
      all = all.filter((m) => m.s !== parsed.source.id).concat(parsed.messages);
      for (const sn of parsed.source.senders) {
        if (!sides[sn.key])
          sides[sn.key] = {
            side: sn.guess,
            confirmed: false,
            name: sn.name,
            reason: sn.guessReason,
          };
      }
      reports.push({
        fileName: file.name,
        ok: true,
        message: `${parsed.messages.length.toLocaleString("fa-IR")} پیام از ${parsed.source.label}`,
      });
    } catch (e) {
      reports.push({
        fileName: file.name,
        ok: false,
        message: "خطا در خواندن فایل: " + (e as Error).message,
      });
    }
  }
  onProgress?.("مرتب‌سازی زمانی…");
  sources.sort((a, b) => a.from - b.from);
  const messages = sortMessages(
    all,
    sources.map((s) => s.id),
  );
  onProgress?.("ذخیره روی همین دستگاه…");
  await Promise.all([
    set("mae:messages", messages),
    set("mae:sources", sources),
    set("mae:sides", sides),
  ]);
  setState({
    messages,
    sources,
    sides,
    status: messages.length ? "ready" : "empty",
    ...derive(messages, sides),
  });
  return reports;
}


/** Import the curated Assassin's Creed Rubika time-window export into the shared archive. */
export async function importAssassinsArchiveFile(
  file: File,
  onProgress?: (message: string) => void,
): Promise<{ sourceId: string; count: number }> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("برای افزودن آرشیو، ابتدا وارد حساب شو.");

  onProgress?.("در حال بررسی فایل آرشیو…");
  const json = JSON.parse(await file.text()) as {
    chat_title?: string;
    chat_guid?: string;
    date_tehran?: string;
    time_range_tehran?: string;
    timezone?: string;
    complete_scan?: boolean;
    message_count?: number;
    messages?: Array<Record<string, any>>;
  };
  if (
    !json ||
    !Array.isArray(json.messages) ||
    json.messages.length !== 290 ||
    json.complete_scan !== true ||
    json.messages.length !== Number(json.message_count)
  ) {
    throw new Error("این فایل، خروجی کامل ۲۹۰ پیامی مورد انتظار نیست.");
  }

  const sourceId = "rubika_assassins_20260415_0329_0507";
  const sanitizeArchiveValue = (value: unknown): unknown => {
    if (typeof value === "string") return value.replace(/\u0000/g, "\uFFFD");
    if (Array.isArray(value)) return value.map(sanitizeArchiveValue);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeArchiveValue(item)]));
    return value;
  };
  const mGuid = "u0IXjOY0628872b21df7782484bd1219";
  const eGuid = "u0EfdEc0e8d15e21da201f2dae41c2c3";
  const senderMap = new Map<string, { name: string; side: "M" | "E" | "O"; count: number }>();
  const messages = json.messages.map((raw, index) => {
    const authorType = String(raw["author_type"] ?? "User");
    const isSystem = authorType === "System" || raw["type"] === "Event";
    const isBot = authorType === "Bot";
    const guid = String(raw["author_object_guid"] ?? (isSystem ? "group-event" : isBot ? "unknown-bot" : "unknown"));
    const senderKey = isSystem ? `SYSTEM:${guid}` : isBot ? `BOT:${guid}` : `R:${guid}`;
    const side: "M" | "E" | "O" =
      !isSystem && !isBot && guid === mGuid ? "M" :
      !isSystem && !isBot && guid === eGuid ? "E" : "O";
    const username = String(raw["author_username"] ?? "");
    const displayName = isSystem
      ? "سیستم گروه"
      : isBot
        ? (username ? `ربات · ${username}` : "ربات گروه")
        : side === "M"
          ? "ماهان · @MAHAN_R_I_P"
          : side === "E"
            ? "@Al_00_1387"
            : (username ? `@${username}` : "عضو گروه");
    const prior = senderMap.get(senderKey) ?? { name: displayName, side, count: 0 };
    prior.count += 1;
    senderMap.set(senderKey, prior);

    const inline = raw["file_inline"] && typeof raw["file_inline"] === "object" ? raw["file_inline"] : null;
    const type = String(raw["type"] ?? "Text");
    const kind =
      isSystem ? "text" :
      type === "Sticker" ? "sticker" :
      type === "RubinoPost" ? "post" :
      inline ? ({ Image: "image", Gif: "gif", Video: "video", Voice: "voice", Music: "music", File: "file" } as Record<string, string>)[String(inline.type)] ?? "file" :
      "text";
    const metadata: Record<string, unknown> = {
      raw_message: sanitizeArchiveValue(raw),
      author_type: authorType,
      author_username: username,
      author_object_guid: guid,
      original_type: type,
      time_unix: String(raw["time"] ?? ""),
      allow_transcription: Boolean(raw["allow_transcription"]),
      file_inline: inline ? sanitizeArchiveValue(inline) : null,
    };
    return {
      uid: `${sourceId}:${String(raw["message_id"] ?? index)}`,
      source_id: sourceId,
      original_id: String(raw["message_id"] ?? ""),
      occurred_at: new Date(Number(raw["time"]) * 1000).toISOString(),
      sender_key: senderKey,
      sender_side: side,
      body: typeof raw["text"] === "string" ? String(sanitizeArchiveValue(raw["text"])) : "",
      kind,
      original_order: index,
      reply_uid: raw["reply_to_message_id"] ? `${sourceId}:${String(raw["reply_to_message_id"])}` : null,
      media_label: inline?.file_name ? String(inline.file_name).slice(0, 180) : raw["sticker"]?.emoji_character ? String(raw["sticker"].emoji_character) : null,
      is_edited: Boolean(raw["is_edited"]),
      is_forwarded: Boolean(raw["forwarded_from"] || raw["forwarded_no_link"]),
      metadata,
    };
  });

  const uidSet = new Set(messages.map((m) => m.uid));
  for (const message of messages) {
    if (message.reply_uid && !uidSet.has(message.reply_uid)) {
      message.metadata = { ...message.metadata, reply_target_outside_export: true };
      message.reply_uid = null;
    }
  }
  const times = messages.map((m) => Date.parse(m.occurred_at));
  const fromAt = new Date(Math.min(...times)).toISOString();
  const toAt = new Date(Math.max(...times)).toISOString();
  const source = {
    id: sourceId,
    platform: "rubika",
    label: `${json.chat_title || "Assassin's Creed"} · ${json.date_tehran || "۲۶ فروردین ۱۴۰۵"} · ${json.time_range_tehran || "۰۳:۲۹–۰۵:۰۷"}`,
    file_name: file.name,
    is_group: true,
    message_count: messages.length,
    from_at: fromAt,
    to_at: toAt,
    metadata: {
      chat_guid: json.chat_guid ?? null,
      date_tehran: json.date_tehran ?? null,
      time_range_tehran: json.time_range_tehran ?? null,
      timezone: json.timezone ?? "Asia/Tehran",
      complete_scan: true,
      scanned_messages_in_time_window: json.message_count,
      imported_by: auth.user.id,
    },
  };

  onProgress?.("در حال ثبت منبع و فرستنده‌ها…");
  const { error: sourceError } = await supabase.from("archive_sources").upsert(source, { onConflict: "id" });
  if (sourceError) throw sourceError;

  const senderRows = [...senderMap.entries()].map(([sender_key, sender]) => ({
    source_id: sourceId,
    sender_key,
    display_name: sender.name,
    side: sender.side,
    confirmed: sender.side === "M" || sender.side === "E",
    guess_reason: sender.side === "M" || sender.side === "E" ? "شناسهٔ فرستنده از آرشیو تأیید شد" : "عضو، ربات یا رویداد گروه",
    message_count: sender.count,
  }));
  const { error: senderError } = await supabase.from("archive_senders").upsert(senderRows, { onConflict: "source_id,sender_key" });
  if (senderError) throw senderError;

  onProgress?.("در حال انتقال ۲۹۰ پیام به آرشیو مرکزی…");
  for (let offset = 0; offset < messages.length; offset += 100) {
    const { error } = await supabase.from("archive_messages").upsert(messages.slice(offset, offset + 100), { onConflict: "uid" });
    if (error) throw error;
    onProgress?.(`انتقال پیام‌ها… ${Math.min(offset + 100, messages.length)} از ${messages.length}`);
  }

  remoteSynced = false;
  await syncRemoteArchive();
  return { sourceId, count: messages.length };
}

export async function setSide(key: string, side: Side) {
  const sides = {
    ...state.sides,
    [key]: { name: key, reason: "", ...state.sides[key], side, confirmed: true },
  };
  await set("mae:sides", sides);
  setState({ sides, days: dayStats(state.messages, (k) => sides[k]?.side) });
}
export async function setSourceGroup(id: string, isGroup: boolean) {
  const sources = state.sources.map((s) => (s.id === id ? { ...s, isGroup } : s));
  await set("mae:sources", sources);
  setState({ sources });
}
export async function confirmAllSides() {
  const sides = Object.fromEntries(
    Object.entries(state.sides).map(([k, v]) => [k, { ...v, confirmed: true }]),
  );
  await set("mae:sides", sides);
  setState({ sides });
}
export async function toggleBookmark(uid: string) {
  const b = state.bookmarks.includes(uid)
    ? state.bookmarks.filter((x) => x !== uid)
    : [...state.bookmarks, uid];
  await set("mae:bookmarks", b);
  setState({ bookmarks: b });
}
async function persistSharedState(settings: Settings, events: MemoryEvent[]) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return;
  const { error } = await supabase.from("mae_shared_state").upsert({
    id: "main",
    settings,
    events,
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}
function queueSharedStateSync(settings: Settings, events: MemoryEvent[]) {
  void persistSharedState(settings, events).catch((error) => {
    console.warn("M AND E shared memory sync failed:", error);
  });
}

export async function saveEvent(ev: MemoryEvent) {
  const events = state.events
    .filter((e) => e.id !== ev.id && !(ev.kind !== "custom" && e.kind === ev.kind))
    .concat(ev);
  await set("mae:events", events);
  setState({ events });
  queueSharedStateSync(state.settings, events);
}
export async function removeEvent(id: string) {
  const events = state.events.filter((e) => e.id !== id);
  await set("mae:events", events);
  setState({ events });
  queueSharedStateSync(state.settings, events);
}
export async function updateSettings(p: Partial<Settings>) {
  const settings = { ...state.settings, ...p };
  await set("mae:settings", settings);
  setState({ settings });
  queueSharedStateSync(settings, state.events);
}
// ---- bundle: one file with everything, to hand over to the other person ----
export const BUNDLE_FORMAT = "mae-bundle";
export interface Bundle {
  format: typeof BUNDLE_FORMAT;
  v: 1;
  createdAt: number;
  messages: Msg[];
  sources: Source[];
  sides: Record<string, SideEntry>;
  events: MemoryEvent[];
  settings: Settings;
  bookmarks: string[];
}
export function makeBundle(): Bundle {
  const { messages, sources, sides, events, settings, bookmarks } = state;
  return {
    format: BUNDLE_FORMAT,
    v: 1,
    createdAt: Date.now(),
    messages,
    sources,
    sides,
    events,
    settings,
    bookmarks,
  };
}
export function validateBundle(b: Bundle): void {
  if (
    b.v !== 1 ||
    !Array.isArray(b.messages) ||
    !Array.isArray(b.sources) ||
    !Array.isArray(b.events) ||
    !Array.isArray(b.bookmarks) ||
    !b.settings ||
    !b.sides
  )
    throw new Error("بسته ناقص یا نسخهٔ آن ناسازگار است");
  const ids = new Set(b.sources.map((s) => s.id));
  const uids = new Set<string>();
  for (const m of b.messages) {
    if (
      !m ||
      typeof m.u !== "string" ||
      uids.has(m.u) ||
      !ids.has(m.s) ||
      !Number.isFinite(m.t) ||
      typeof m.x !== "string" ||
      typeof m.k !== "string" ||
      !Number.isFinite(m.o)
    )
      throw new Error("پیام‌های بسته معتبر نیستند");
    uids.add(m.u);
  }
  for (const s of b.sources) {
    if (
      !s ||
      typeof s.id !== "string" ||
      typeof s.label !== "string" ||
      !Array.isArray(s.senders) ||
      !Number.isFinite(s.from) ||
      !Number.isFinite(s.to)
    )
      throw new Error("منابع بسته معتبر نیستند");
  }
  for (const e of b.events) {
    if (
      !e ||
      typeof e.id !== "string" ||
      typeof e.title !== "string" ||
      !Number.isFinite(e.from) ||
      !Number.isFinite(e.to) ||
      e.to < e.from
    )
      throw new Error("تاریخ‌های بسته معتبر نیستند");
  }
  if (
    ![b.settings.startMs, b.settings.firstFrom, b.settings.firstTo].every(Number.isFinite) ||
    b.settings.firstTo < b.settings.firstFrom
  )
    throw new Error("تنظیمات تاریخ بسته معتبر نیستند");
}
async function restoreBundle(b: Bundle) {
  validateBundle(b);
  const settings = { ...defaultSettings(), ...(b.settings ?? {}) };
  const sides = b.sides ?? {};
  const messages = sortMessages(
    b.messages,
    b.sources.map((s) => s.id),
  );
  await Promise.all([
    set("mae:messages", messages),
    set("mae:sources", b.sources),
    set("mae:sides", sides),
    set("mae:events", b.events),
    set("mae:settings", settings),
    set("mae:bookmarks", b.bookmarks),
  ]);
  setState({
    messages,
    sources: b.sources,
    sides,
    events: b.events,
    settings,
    bookmarks: b.bookmarks,
    status: messages.length ? "ready" : "empty",
    ...derive(messages, sides),
  });
}

export async function wipeAll() {
  await Promise.all(
    ["mae:messages", "mae:sources", "mae:sides", "mae:bookmarks", "mae:events", "mae:settings"].map(
      (k) => del(k),
    ),
  );
  const p = applyPresets([], defaultSettings());
  await Promise.all([set("mae:events", p.events), set("mae:settings", p.settings)]);
  setState({
    status: "empty",
    messages: [],
    sources: [],
    sides: {},
    bookmarks: [],
    events: p.events,
    settings: p.settings,
    uidIndex: new Map(),
    sessions: [],
    days: [],
  });
}
