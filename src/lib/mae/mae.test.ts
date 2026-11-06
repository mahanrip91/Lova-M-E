import { describe, expect, it } from "vitest";
import { dayKey, elapsedJalali, fmtTime, jalaliOf, jalaliToUtc, tehranToUtc, toGregorian, toJalali } from "./time";
import { detectFormat, normalizeFa, parseRubika, parseTelegram, sortMessages, type Msg } from "./parse";
import { birthdayCandidates, dayStats, pickRandomSession, sessionize, sliceRange, splitAtMidnight } from "./analysis";
import { DEFAULT_START, applyPresets, defaultSettings, presetEvents } from "./store";

const mk = (t: number, i: number, k = "a", x = "hi"): Msg => ({ u: `X:${i}`, s: "X", t, k, x, kd: "text", o: i });

describe("Jalali / Tehran time", () => {
  it("2026-04-15 is 26 Farvardin 1405", () => expect(toJalali(2026, 4, 15)).toEqual({ jy: 1405, jm: 1, jd: 26 }));
  it("round-trips Jalali to Gregorian", () => expect(toGregorian(1405, 1, 26)).toEqual({ gy: 2026, gm: 4, gd: 15 }));
  it("Nowruz 1405 is 2026-03-21", () => expect(toGregorian(1405, 1, 1)).toEqual({ gy: 2026, gm: 3, gd: 21 }));
  it("Tehran midnight is 20:30 UTC the previous day", () => {
    expect(new Date(tehranToUtc(2026, 4, 15)).toISOString()).toBe("2026-04-14T20:30:00.000Z");
    expect(dayKey(Date.parse("2026-04-14T20:29:59Z"))).toBe("2026-04-14");
    expect(dayKey(Date.parse("2026-04-14T20:30:00Z"))).toBe("2026-04-15");
  });
  it("default counter start is 1405/01/26 03:28 Tehran", () => {
    expect(jalaliOf(DEFAULT_START)).toMatchObject({ jy: 1405, jm: 1, jd: 26, h: 3, mi: 28, s: 0 });
  });
  it("Unix-seconds and ISO inputs agree (earliest archived message is 03:28 Tehran)", () => {
    const unix = 1776211116 * 1000;
    expect(fmtTime(unix)).toBe("۰۳:۲۸");
    expect(Date.parse("2026-04-14T23:58:36+00:00")).toBe(unix);
  });
});

describe("live counter (elapsed on Jalali calendar)", () => {
  it("computes exact components from the confirmed start to an injected now", () => {
    const now = jalaliToUtc(1405, 8, 7, 11, 53, 9);
    const e = elapsedJalali(DEFAULT_START, now);
    expect(e).toMatchObject({ years: 0, months: 6, days: 11, hours: 11, minutes: 53, seconds: 9, negative: false });
  });
  it("total days uses real elapsed time, not the archive", () => {
    expect(elapsedJalali(DEFAULT_START, DEFAULT_START + 200 * 86400000 + 5000).totalDays).toBe(200);
  });
  it("borrows the length of Esfand correctly (1404 has 29 days, 1403 has 30)", () => {
    const e = elapsedJalali(jalaliToUtc(1404, 11, 30), jalaliToUtc(1405, 1, 1));
    expect(e).toMatchObject({ months: 1, days: 0 });
    const e2 = elapsedJalali(jalaliToUtc(1403, 12, 10), jalaliToUtc(1404, 1, 5));
    expect(e2).toMatchObject({ months: 0, days: 25 });
  });
  it("ticks: one second later adds one second", () => {
    const a = elapsedJalali(DEFAULT_START, DEFAULT_START + 61000);
    expect(a).toMatchObject({ minutes: 1, seconds: 1 });
  });
});

describe("first conversation across midnight", () => {
  const base = tehranToUtc(2026, 4, 14, 23, 40);
  const msgs = Array.from({ length: 6 }, (_, i) => mk(base + i * 10 * 60000, i));
  it("stays one session", () => {
    const s = sessionize(msgs);
    expect(s).toHaveLength(1);
    expect(s[0]!.crossesMidnight).toBe(true);
  });
  it("splits visually into 2 calendar-date segments", () => {
    const segs = splitAtMidnight(base, base + 60 * 60000, msgs);
    expect(segs.map((x) => x.day)).toEqual(["2026-04-14", "2026-04-15"]);
    expect(segs[0]!.messages).toHaveLength(2);
    expect(segs[1]!.messages).toHaveLength(4);
  });
  it("missing pre-midnight part yields an empty segment, never invented messages", () => {
    const only = [mk(tehranToUtc(2026, 4, 15, 3, 28), 0), mk(tehranToUtc(2026, 4, 15, 3, 29), 1)];
    const { firstFrom: from, firstTo: to } = defaultSettings();
    const segs = splitAtMidnight(from, to, sliceRange(only, from, to));
    expect(segs[0]!.messages).toHaveLength(0);
    expect(segs[1]!.messages).toHaveLength(2);
  });
  it("respects a user-edited range", () => {
    expect(sliceRange(msgs, base + 15 * 60000, base + 35 * 60000).map((m) => m.o)).toEqual([2, 3]);
  });
});

describe("parsing & merge", () => {
  it("detects formats", () => {
    expect(detectFormat({ chat_guid: "g", messages: [] })).toBe("rubika");
    expect(detectFormat([{ sender_id: 1, date: "x" }])).toBe("telegram");
    expect(detectFormat({ foo: 1 })).toBeNull();
  });
  it("drops sensitive Rubika file fields", () => {
    const p = parseRubika({ chat_guid: "u2", messages: [{ message_id: "1", time: "100", type: "FileInline", author_object_guid: "g1", file_inline: { type: "Image", file_name: "a.jpg", access_hash_rec: "SECRET", file_id: "9" } }] }, "f");
    expect(JSON.stringify(p.messages)).not.toContain("SECRET");
    expect(p.messages[0]!.kd).toBe("image");
    expect(p.source.senders.find((s) => s.key === "R:g1")?.guess).toBe("M");
  });
  it("maps senders by decorated name", () => {
    const p = parseTelegram([{ id: 1, date: "2026-01-01T00:00:00+00:00", sender_id: 5, sender_name: "𝓶𝓪𝓱𝓪𝓷", text: "x", reply_to: null }, { id: 2, date: "2026-01-01T00:00:01+00:00", sender_id: 6, sender_name: "꣄𖹭", text: "", reply_to: 1 }], "f", "T1", "t");
    expect(p.source.senders.find((s) => s.key === "T:5")?.guess).toBe("M");
    expect(p.source.senders.find((s) => s.key === "T:6")?.guess).toBe("E");
    expect(p.messages[1]).toMatchObject({ kd: "nontext", r: "T1:1" });
  });
  it("merges chronologically with stable tie-breaks", () => {
    const a = [{ ...mk(10, 0), s: "B", u: "B:0" }, { ...mk(10, 1), s: "B", u: "B:1" }];
    const b = [{ ...mk(10, 0), s: "A", u: "A:0" }, { ...mk(5, 1), s: "A", u: "A:1" }];
    expect(sortMessages([...a, ...b], ["A", "B"]).map((m) => m.u)).toEqual(["A:1", "A:0", "B:0", "B:1"]);
  });
  it("normalizes Persian for search", () => expect(normalizeFa("مي\u200cكنم")).toBe("میکنم"));
});

describe("memories", () => {
  it("birthday candidates are scored, not facts", () => {
    const t = tehranToUtc(2026, 9, 27, 12);
    const msgs = [mk(t, 0, "m", "تولدت مبارک"), mk(t + 1000, 1, "m", "🎂"), mk(t + 2000, 2, "m", "تولد تولد"), mk(t + 3000, 3, "e", "مرسی")];
    const side = (k: string) => (k === "m" ? "M" : "E") as "M" | "E";
    const c = birthdayCandidates(msgs, side, dayStats(msgs, side));
    expect(c[0]).toMatchObject({ day: "2026-09-27", side: "M", matches: 3 });
  });
  it("random memory always returns a real session", () => {
    const msgs = Array.from({ length: 30 }, (_, i) => mk(i * 1000, i));
    const s = pickRandomSession(sessionize(msgs), () => 0.5)!;
    expect(s.count).toBe(30);
    expect(pickRandomSession([])).toBeNull();
  });
});

describe("group archives", () => {
  it("parses Telegram Desktop group export using true UTC unix time, skipping service messages", async () => {
    const { parseTelegramDesktop, detectFormat: df } = await import("./parse");
    const json = { name: "G", type: "private_supergroup", id: 42, messages: [
      { id: 1, type: "service", date_unixtime: "1776200000" },
      { id: 2, type: "message", date: "2026-04-14T23:50:00", date_unixtime: String(tehranToUtc(2026, 4, 14, 23, 50) / 1000), from: "𝓶𝓪𝓱𝓪𝓷", from_id: "user7001392382", text: ["hi ", { type: "bold", text: "there" }] },
      { id: 3, type: "message", date_unixtime: String(tehranToUtc(2026, 4, 15, 0, 20) / 1000), from: "ℯ𝑙𝑖𝓈𝒶", from_id: "user1", text: "x", reply_to_message_id: 2 },
      { id: 4, type: "message", date_unixtime: String(tehranToUtc(2026, 4, 15, 1, 0) / 1000), from: "Someone", from_id: "user9", text: "y" },
    ] };
    expect(df(json)).toBe("tgdesktop");
    const p = parseTelegramDesktop(json, "result.json");
    expect(p.source.isGroup).toBe(true);
    expect(p.messages).toHaveLength(3);
    expect(p.messages[0]!.x).toBe("hi there");
    expect(p.messages[0]!.k).toBe("T:7001392382");
    const g = Object.fromEntries(p.source.senders.map((s) => [s.key, s.guess]));
    expect(g).toEqual({ "T:7001392382": "M", "T:1": "E", "T:9": "O" });
    const segs = splitAtMidnight(tehranToUtc(2026, 4, 14, 22), tehranToUtc(2026, 4, 15, 4), p.messages);
    expect(segs.map((s) => s.messages.length)).toEqual([1, 2]);
  });
  it("Rubika group gets its own source id and no private-chat side guesses", () => {
    const p = parseRubika({ chat_guid: "g0ABCDEFGHIJ", chat_title: "T", messages: [
      { message_id: "1", time: "100", type: "Text", text: "a", author_object_guid: "u1" },
      { message_id: "2", time: "101", type: "Text", text: "b", author_object_guid: "u2" },
      { message_id: "3", time: "102", type: "Text", text: "c", author_object_guid: "u3" },
    ] }, "f");
    expect(p.source.id).not.toBe("R");
    expect(p.source.isGroup).toBe(true);
    expect(p.source.senders.every((s) => s.guess === "O")).toBe(true);
  });
});

describe("user-confirmed dates", () => {
  const ev = (k: string) => presetEvents().find((e) => e.kind === k)!;
  it("Mahan's birthday is 10 Mehr", () => expect(jalaliOf(ev("bd-mahan").from)).toMatchObject({ jm: 7, jd: 10, h: 0 }));
  it("Elisa's birthday is 8 Tir", () => expect(jalaliOf(ev("bd-elisa").from)).toMatchObject({ jm: 4, jd: 8, h: 0 }));
  it("Elisa's greeting window contains 1405/07/10 00:33", () => {
    const g = jalaliToUtc(1405, 7, 10, 0, 33);
    expect(ev("elisa-greets").from).toBeLessThanOrEqual(g);
    expect(ev("elisa-greets").to).toBeGreaterThan(g);
  });
  it("Mahan celebrating Elisa's birthday is marked as not in the messages", () => expect(ev("mahan-celebrates").unavailable).toBe(true));
  it("presets never overwrite a user's own event", () => {
    const mine = { ...ev("bd-mahan"), from: 1, to: 2, origin: "manual" as const };
    const r = applyPresets([mine], defaultSettings());
    expect(r.events.filter((e) => e.kind === "bd-mahan")).toEqual([mine]);
  });
  it("migrates the old 00:00 start to 03:28", () => {
    const r = applyPresets([], { ...defaultSettings(), startMs: jalaliToUtc(1405, 1, 26) });
    expect(r.settings.startMs).toBe(DEFAULT_START);
  });
});
