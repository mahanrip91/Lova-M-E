import type { Msg, Side } from "./parse";
import { dayKey, dayStartMs, DAY_MS } from "./time";

export interface Session { a: number; b: number; from: number; to: number; count: number; crossesMidnight: boolean }
export const SESSION_GAP_MS = 90 * 60 * 1000;

export function sessionize(msgs: Msg[], gap = SESSION_GAP_MS): Session[] {
  const out: Session[] = [];
  if (!msgs.length) return out;
  let a = 0;
  const push = (b: number) => out.push({ a, b, from: msgs[a].t, to: msgs[b].t, count: b - a + 1, crossesMidnight: dayKey(msgs[a].t) !== dayKey(msgs[b].t) });
  for (let i = 1; i < msgs.length; i++) if (msgs[i].t - msgs[i - 1].t >= gap) { push(i - 1); a = i; }
  push(msgs.length - 1);
  return out;
}

/** First index with t >= ms (binary search). */
export function lowerBound(msgs: Msg[], ms: number): number {
  let lo = 0, hi = msgs.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (msgs[mid].t < ms) lo = mid + 1; else hi = mid; }
  return lo;
}
export function sliceRange(msgs: Msg[], from: number, to: number): Msg[] {
  return msgs.slice(lowerBound(msgs, from), lowerBound(msgs, to + 1));
}

export interface Segment { day: string; from: number; to: number; messages: Msg[] }
/** Splits a time window at Tehran midnights. Segments with no archived messages are kept (empty) so gaps stay visible. */
export function splitAtMidnight(windowFrom: number, windowTo: number, msgs: Msg[]): Segment[] {
  const segs: Segment[] = [];
  let start = windowFrom;
  while (start <= windowTo) {
    const day = dayKey(start);
    const end = Math.min(windowTo, dayStartMs(day) + DAY_MS - 1);
    segs.push({ day, from: start, to: end, messages: msgs.filter((m) => m.t >= start && m.t <= end) });
    start = end + 1;
  }
  return segs;
}

export interface DayStat { day: string; total: number; M: number; E: number; first: number; hours: number[] }
export function dayStats(msgs: Msg[], sideOf: (k: string) => Side | undefined): DayStat[] {
  const map = new Map<string, DayStat>();
  for (const m of msgs) {
    const day = dayKey(m.t);
    let d = map.get(day);
    if (!d) { d = { day, total: 0, M: 0, E: 0, first: m.t, hours: new Array(24).fill(0) }; map.set(day, d); }
    d.total++;
    const s = sideOf(m.k);
    if (s) d[s]++;
    d.hours[Math.floor(((m.t - dayStartMs(day)) / 3600000)) % 24]++;
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

// ---- birthday candidate discovery (suggestions only, never facts) ----
export const BIRTHDAY_RE = /تولد|🎂|🥳|happy\s*birth|birthday|hbd/i;
export type Confidence = "high" | "medium" | "low";
export interface Candidate { day: string; side: Side; matches: number; dayTotal: number; confidence: Confidence; firstMatch: number }

export function birthdayCandidates(msgs: Msg[], sideOf: (k: string) => Side | undefined, days: DayStat[]): Candidate[] {
  const totals = days.map((d) => d.total).sort((a, b) => a - b);
  const median = totals[Math.floor(totals.length / 2)] ?? 0;
  const byDay = new Map<string, Candidate>();
  for (const m of msgs) {
    if (!m.x || !BIRTHDAY_RE.test(m.x)) continue;
    const side = sideOf(m.k);
    if (!side) continue;
    const day = dayKey(m.t);
    const key = day + side;
    const c = byDay.get(key) ?? { day, side, matches: 0, dayTotal: days.find((d) => d.day === day)?.total ?? 0, confidence: "low" as Confidence, firstMatch: m.t };
    c.matches++;
    byDay.set(key, c);
  }
  const out = [...byDay.values()];
  for (const c of out) {
    const spike = c.dayTotal > median * 1.5;
    c.confidence = c.matches >= 3 && spike ? "high" : c.matches >= 2 ? "medium" : "low";
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.confidence] - rank[b.confidence] || b.matches - a.matches);
}

/** Picks a real archived session with some substance; returns null if none. */
export function pickRandomSession(sessions: Session[], rand = Math.random): Session | null {
  const good = sessions.filter((s) => s.count >= 12);
  const pool = good.length ? good : sessions;
  if (!pool.length) return null;
  return pool[Math.floor(rand() * pool.length)];
}
