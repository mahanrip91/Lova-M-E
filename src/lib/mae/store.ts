// On-device store. All chat data lives only in this browser's IndexedDB.
import { useSyncExternalStore } from "react";
import { get, set, del } from "idb-keyval";
import { detectFormat, parseRubika, parseTelegram, parseTelegramDesktop, sortMessages, telegramSourceId, type Msg, type Side, type Source } from "./parse";
import { dayStats, sessionize, type DayStat, type Session } from "./analysis";
import { jalaliToUtc } from "./time";

export type EventKind = "bd-mahan" | "bd-elisa" | "mahan-celebrates" | "elisa-greets" | "custom";
export interface MemoryEvent { id: string; kind: EventKind; title: string; from: number; to: number; origin: "manual" | "candidate"; confidence?: string }
export interface SideEntry { side: Side; confirmed: boolean; name: string; reason: string }
export interface Settings { startMs: number; firstFrom: number; firstTo: number; startConfirmed: boolean; /** source holding the first night (a group chat); null until the user picks it */ firstSourceId: string | null }

export const DEFAULT_START = jalaliToUtc(1405, 1, 26, 0, 0, 0); // user-confirmed: 26 Farvardin 1405, 00:00 Tehran
export const defaultSettings = (): Settings => ({
  startMs: DEFAULT_START,
  startConfirmed: true,
  firstSourceId: null,
  firstFrom: DEFAULT_START - 3 * 3600000,
  firstTo: DEFAULT_START + 6 * 3600000,
});

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
}

let state: State = {
  status: "loading", messages: [], sources: [], sides: {}, bookmarks: [], events: [], settings: defaultSettings(),
  uidIndex: new Map(), sessions: [], days: [],
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function setState(p: Partial<State>) { state = { ...state, ...p }; emit(); }

export const sideOf = (k: string): Side | undefined => state.sides[k]?.side;
function derive(messages: Msg[], sides: Record<string, SideEntry>) {
  const uidIndex = new Map<string, number>();
  messages.forEach((m, i) => uidIndex.set(m.u, i));
  return { uidIndex, sessions: sessionize(messages), days: dayStats(messages, (k) => sides[k]?.side) };
}

let started = false;
export function initStore() {
  if (started || typeof window === "undefined") return;
  started = true;
  (async () => {
    try {
      const [messages, sources, sides, bookmarks, events, settings] = await Promise.all([
        get<Msg[]>("mae:messages"), get<Source[]>("mae:sources"), get("mae:sides"), get<string[]>("mae:bookmarks"), get<MemoryEvent[]>("mae:events"), get<Settings>("mae:settings"),
      ]);
      const msgs = messages ?? [];
      const sd = (sides as Record<string, SideEntry>) ?? {};
      setState({
        status: msgs.length ? "ready" : "empty", messages: msgs, sources: sources ?? [], sides: sd,
        bookmarks: bookmarks ?? [], events: events ?? [], settings: { ...defaultSettings(), ...(settings ?? {}) }, ...derive(msgs, sd),
      });
    } catch {
      setState({ status: "empty" });
    }
  })();
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sel(state), () => sel(state));
}
export const getState = () => state;

// ---- import ----
export interface ImportReport { fileName: string; ok: boolean; message: string }
export async function importFiles(files: File[], onProgress?: (p: string) => void): Promise<ImportReport[]> {
  const reports: ImportReport[] = [];
  let sources = [...state.sources];
  let all = [...state.messages];
  const sides = { ...state.sides };
  let tgN = sources.filter((s) => s.kind === "telegram").length;
  for (const file of files) {
    onProgress?.(`در حال خواندن ${file.name}…`);
    try {
      const json = JSON.parse(await file.text());
      const fmt = detectFormat(json);
      if (!fmt) { reports.push({ fileName: file.name, ok: false, message: "قالب فایل شناخته نشد" }); continue; }
      const parsed = fmt === "rubika" ? parseRubika(json, file.name) : fmt === "tgdesktop" ? parseTelegramDesktop(json, file.name) : (() => {
        const id = telegramSourceId(json);
        const existing = sources.find((s) => s.id === id);
        return parseTelegram(json, file.name, id, existing?.label ?? `تلگرام ${["۱", "۲", "۳", "۴"][tgN++] ?? ""}`);
      })();
      sources = sources.filter((s) => s.id !== parsed.source.id).concat(parsed.source);
      all = all.filter((m) => m.s !== parsed.source.id).concat(parsed.messages);
      for (const sn of parsed.source.senders) {
        if (!sides[sn.key]) sides[sn.key] = { side: sn.guess, confirmed: false, name: sn.name, reason: sn.guessReason };
      }
      reports.push({ fileName: file.name, ok: true, message: `${parsed.messages.length.toLocaleString("fa-IR")} پیام از ${parsed.source.label}` });
    } catch (e) {
      reports.push({ fileName: file.name, ok: false, message: "خطا در خواندن فایل: " + (e as Error).message });
    }
  }
  onProgress?.("مرتب‌سازی زمانی…");
  sources.sort((a, b) => a.from - b.from);
  const messages = sortMessages(all, sources.map((s) => s.id));
  onProgress?.("ذخیره روی همین دستگاه…");
  await Promise.all([set("mae:messages", messages), set("mae:sources", sources), set("mae:sides", sides)]);
  setState({ messages, sources, sides, status: messages.length ? "ready" : "empty", ...derive(messages, sides) });
  return reports;
}

export async function setSide(key: string, side: Side) {
  const sides = { ...state.sides, [key]: { name: key, reason: "", ...state.sides[key], side, confirmed: true } };
  await set("mae:sides", sides);
  setState({ sides, days: dayStats(state.messages, (k) => sides[k]?.side) });
}
export async function setSourceGroup(id: string, isGroup: boolean) {
  const sources = state.sources.map((s) => (s.id === id ? { ...s, isGroup } : s));
  await set("mae:sources", sources);
  setState({ sources });
}
export async function confirmAllSides() {
  const sides = Object.fromEntries(Object.entries(state.sides).map(([k, v]) => [k, { ...v, confirmed: true }]));
  await set("mae:sides", sides);
  setState({ sides });
}
export async function toggleBookmark(uid: string) {
  const b = state.bookmarks.includes(uid) ? state.bookmarks.filter((x) => x !== uid) : [...state.bookmarks, uid];
  await set("mae:bookmarks", b);
  setState({ bookmarks: b });
}
export async function saveEvent(ev: MemoryEvent) {
  const events = state.events.filter((e) => e.id !== ev.id && !(ev.kind !== "custom" && e.kind === ev.kind)).concat(ev);
  await set("mae:events", events);
  setState({ events });
}
export async function removeEvent(id: string) {
  const events = state.events.filter((e) => e.id !== id);
  await set("mae:events", events);
  setState({ events });
}
export async function updateSettings(p: Partial<Settings>) {
  const settings = { ...state.settings, ...p };
  await set("mae:settings", settings);
  setState({ settings });
}
export async function wipeAll() {
  await Promise.all(["mae:messages", "mae:sources", "mae:sides", "mae:bookmarks", "mae:events", "mae:settings"].map((k) => del(k)));
  setState({ status: "empty", messages: [], sources: [], sides: {}, bookmarks: [], events: [], settings: defaultSettings(), uidIndex: new Map(), sessions: [], days: [] });
}
