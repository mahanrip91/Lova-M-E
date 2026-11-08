// On-device store. All chat data lives only in this browser's IndexedDB.
import { useSyncExternalStore } from "react";
import { get, set, del } from "idb-keyval";
import { detectFormat, parseRubika, parseTelegram, parseTelegramDesktop, sortMessages, telegramSourceId, type Msg, type Side, type Source } from "./parse";
import { dayStats, sessionize, type DayStat, type Session } from "./analysis";
import { jalaliToUtc } from "./time";

export type EventKind = "bd-mahan" | "bd-elisa" | "mahan-celebrates" | "elisa-greets" | "custom";
export interface MemoryEvent { id: string; kind: EventKind; title: string; from: number; to: number; origin: "manual" | "candidate" | "preset"; confidence?: string; /** true = the user confirmed it happened but it is not in the messages */ unavailable?: boolean }
export interface SideEntry { side: Side; confirmed: boolean; name: string; reason: string }
export interface Settings { presetsApplied?: number; startMs: number; firstFrom: number; firstTo: number; startConfirmed: boolean; /** source holding the first night (a group chat); null until the user picks it */ firstSourceId: string | null }

export const DEFAULT_START = jalaliToUtc(1405, 1, 26, 3, 28, 0); // user-confirmed: 26 Farvardin 1405, 03:28 Tehran
const OLD_DEFAULT_START = jalaliToUtc(1405, 1, 26, 0, 0, 0);
const FIRST_MIDNIGHT = jalaliToUtc(1405, 1, 26, 0, 0, 0);
export const defaultSettings = (): Settings => ({
  startMs: DEFAULT_START,
  startConfirmed: true,
  firstSourceId: null,
  firstFrom: FIRST_MIDNIGHT - 3 * 3600000,
  firstTo: FIRST_MIDNIGHT + 6 * 3600000,
});

const HOUR = 3600000;
const PRESETS_VERSION = 1;
/** User-confirmed dates (birthdays: Mahan 10 Mehr, Elisa 8 Tir; Elisa's greeting 1405/07/10 00:33). */
export function presetEvents(): MemoryEvent[] {
  const bdM = jalaliToUtc(1405, 7, 10), bdE = jalaliToUtc(1405, 4, 8), greet = jalaliToUtc(1405, 7, 10, 0, 33);
  return [
    { id: "bd-mahan", kind: "bd-mahan", title: "تولد ماهان", from: bdM, to: bdM + 24 * HOUR - 1, origin: "preset" },
    { id: "bd-elisa", kind: "bd-elisa", title: "تولد الیسا", from: bdE, to: bdE + 24 * HOUR - 1, origin: "preset" },
    { id: "elisa-greets", kind: "elisa-greets", title: "الیسا تولد ماهان را تبریک گفت", from: greet - 10 * 60000, to: greet + 3 * HOUR, origin: "preset" },
    { id: "mahan-celebrates", kind: "mahan-celebrates", title: "ماهان تولد الیسا را جشن گرفت", from: bdE, to: bdE + 24 * HOUR - 1, origin: "preset", unavailable: true },
  ];
}
/** Adds missing preset events once (per preset version); never overwrites user edits. */
export function applyPresets(events: MemoryEvent[], settings: Settings): { events: MemoryEvent[]; settings: Settings; changed: boolean } {
  let changed = false;
  let st = settings;
  if (st.startMs === OLD_DEFAULT_START) { st = { ...st, startMs: DEFAULT_START }; changed = true; }
  if ((st.presetsApplied ?? 0) >= PRESETS_VERSION) return { events, settings: st, changed };
  const have = new Set(events.map((e) => e.kind));
  const add = presetEvents().filter((p) => !have.has(p.kind));
  return { events: [...events, ...add], settings: { ...st, presetsApplied: PRESETS_VERSION }, changed: true };
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
      const p = applyPresets(events ?? [], { ...defaultSettings(), ...(settings ?? {}) });
      if (p.changed) await Promise.all([set("mae:events", p.events), set("mae:settings", p.settings)]);
      setState({
        status: msgs.length ? "ready" : "empty", messages: msgs, sources: sources ?? [], sides: sd,
        bookmarks: bookmarks ?? [], events: p.events, settings: p.settings, ...derive(msgs, sd),
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
      if (json?.format === BUNDLE_FORMAT) {
        if (files.length !== 1) throw new Error("بستهٔ کامل را به‌تنهایی انتخاب کن، نه همراه فایل‌های دیگر");
        await restoreBundle(json as Bundle);
        reports.push({ fileName: file.name, ok: true, message: `بسته‌ی کامل: ${(json.messages?.length ?? 0).toLocaleString("fa-IR")} پیام و همه‌ی تنظیمات` });
        sources = [...state.sources]; all = [...state.messages]; Object.assign(sides, state.sides);
        continue;
      }
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
// ---- bundle: one file with everything, to hand over to the other person ----
export const BUNDLE_FORMAT = "mae-bundle";
export interface Bundle { format: typeof BUNDLE_FORMAT; v: 1; createdAt: number; messages: Msg[]; sources: Source[]; sides: Record<string, SideEntry>; events: MemoryEvent[]; settings: Settings; bookmarks: string[] }
export function makeBundle(): Bundle {
  const { messages, sources, sides, events, settings, bookmarks } = state;
  return { format: BUNDLE_FORMAT, v: 1, createdAt: Date.now(), messages, sources, sides, events, settings, bookmarks };
}
export function validateBundle(b: Bundle): void {
  if (b.v !== 1 || !Array.isArray(b.messages) || !Array.isArray(b.sources) || !Array.isArray(b.events) || !Array.isArray(b.bookmarks) || !b.settings || !b.sides) throw new Error("بسته ناقص یا نسخهٔ آن ناسازگار است");
  const ids = new Set(b.sources.map((s) => s.id));
  const uids = new Set<string>();
  for (const m of b.messages) {
    if (!m || typeof m.u !== "string" || uids.has(m.u) || !ids.has(m.s) || !Number.isFinite(m.t) || typeof m.x !== "string" || typeof m.k !== "string" || !Number.isFinite(m.o)) throw new Error("پیام‌های بسته معتبر نیستند");
    uids.add(m.u);
  }
  for (const s of b.sources) {
    if (!s || typeof s.id !== "string" || typeof s.label !== "string" || !Array.isArray(s.senders) || !Number.isFinite(s.from) || !Number.isFinite(s.to)) throw new Error("منابع بسته معتبر نیستند");
  }
  for (const e of b.events) {
    if (!e || typeof e.id !== "string" || typeof e.title !== "string" || !Number.isFinite(e.from) || !Number.isFinite(e.to) || e.to < e.from) throw new Error("تاریخ‌های بسته معتبر نیستند");
  }
  if (![b.settings.startMs, b.settings.firstFrom, b.settings.firstTo].every(Number.isFinite) || b.settings.firstTo < b.settings.firstFrom) throw new Error("تنظیمات تاریخ بسته معتبر نیستند");
}
async function restoreBundle(b: Bundle) {
  validateBundle(b);
  const settings = { ...defaultSettings(), ...(b.settings ?? {}) };
  const sides = b.sides ?? {};
  const messages = sortMessages(b.messages, b.sources.map((s) => s.id));
  await Promise.all([set("mae:messages", messages), set("mae:sources", b.sources), set("mae:sides", sides), set("mae:events", b.events), set("mae:settings", settings), set("mae:bookmarks", b.bookmarks)]);
  setState({ messages, sources: b.sources, sides, events: b.events, settings, bookmarks: b.bookmarks, status: messages.length ? "ready" : "empty", ...derive(messages, sides) });
}

export async function wipeAll() {
  await Promise.all(["mae:messages", "mae:sources", "mae:sides", "mae:bookmarks", "mae:events", "mae:settings"].map((k) => del(k)));
  const p = applyPresets([], defaultSettings());
  await Promise.all([set("mae:events", p.events), set("mae:settings", p.settings)]);
  setState({ status: "empty", messages: [], sources: [], sides: {}, bookmarks: [], events: p.events, settings: p.settings, uidIndex: new Map(), sessions: [], days: [] });
}
