// Tehran / Jalali time utilities. Iran has used a fixed UTC+03:30 offset (no DST) since 2022,
// which covers the whole archive (2026) and runtime, so a fixed offset is exact here.
export const TEHRAN_OFFSET_MS = 3.5 * 3600 * 1000;
export const DAY_MS = 86400000;

export interface WallParts { y: number; m: number; d: number; h: number; mi: number; s: number }

export function tehranParts(ms: number): WallParts {
  const d = new Date(ms + TEHRAN_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds() };
}
export function tehranToUtc(y: number, m: number, d: number, h = 0, mi = 0, s = 0): number {
  return Date.UTC(y, m - 1, d, h, mi, s) - TEHRAN_OFFSET_MS;
}
/** Tehran calendar day key, YYYY-MM-DD (Gregorian). */
export function dayKey(ms: number): string {
  return new Date(ms + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}
export function dayStartMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return tehranToUtc(y, m, d);
}

// ---- Jalali conversion (jalaali algorithm) ----
const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14, jp = BREAKS[0], jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
export function toJalali(gy: number, gm: number, gd: number) {
  const jdn = g2d(gy, gm, gd);
  const g = d2g(jdn).gy;
  let jy = g - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(g, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}
export function toGregorian(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return d2g(g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1);
}
export function isJalaliLeap(jy: number) { return jalCal(jy).leap === 0; }
export function jalaliMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}
export function jalaliOf(ms: number) {
  const p = tehranParts(ms);
  return { ...toJalali(p.y, p.m, p.d), h: p.h, mi: p.mi, s: p.s };
}
export function jalaliToUtc(jy: number, jm: number, jd: number, h = 0, mi = 0, s = 0) {
  const g = toGregorian(jy, jm, jd);
  return tehranToUtc(g.gy, g.gm, g.gd, h, mi, s);
}

// ---- formatting ----
export const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const FA = "۰۱۲۳۴۵۶۷۸۹";
export const fa = (v: number | string) => String(v).replace(/\d/g, (c) => FA[+c]);
const p2 = (n: number) => String(n).padStart(2, "0");
export function fmtDate(ms: number) {
  const j = jalaliOf(ms);
  return `${fa(j.jd)} ${JALALI_MONTHS[j.jm - 1]} ${fa(j.jy)}`;
}
export function fmtTime(ms: number) {
  const j = jalaliOf(ms);
  return fa(`${p2(j.h)}:${p2(j.mi)}`);
}
export function fmtDateTime(ms: number) { return `${fmtDate(ms)} · ${fmtTime(ms)}`; }
export function fmtDuration(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${fa(m)} دقیقه`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${fa(h)} ساعت و ${fa(r)} دقیقه` : `${fa(h)} ساعت`;
}

// ---- elapsed time on the Jalali calendar ----
export interface Elapsed { years: number; months: number; days: number; hours: number; minutes: number; seconds: number; totalDays: number; negative: boolean }
export function elapsedJalali(startMs: number, nowMs: number): Elapsed {
  const negative = nowMs < startMs;
  const [a0, b0] = negative ? [nowMs, startMs] : [startMs, nowMs];
  const a = jalaliOf(a0), b = jalaliOf(b0);
  let s = b.s - a.s, mi = b.mi - a.mi, h = b.h - a.h, d = b.jd - a.jd, mo = b.jm - a.jm, y = b.jy - a.jy;
  if (s < 0) { s += 60; mi--; }
  if (mi < 0) { mi += 60; h--; }
  if (h < 0) { h += 24; d--; }
  if (d < 0) {
    const pm = b.jm === 1 ? 12 : b.jm - 1, py = b.jm === 1 ? b.jy - 1 : b.jy;
    d += jalaliMonthLength(py, pm);
    mo--;
  }
  if (mo < 0) { mo += 12; y--; }
  return { years: y, months: mo, days: d, hours: h, minutes: mi, seconds: s, totalDays: Math.floor((b0 - a0) / DAY_MS), negative };
}
