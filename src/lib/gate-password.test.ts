import { describe, expect, it } from "vitest";
import { passwordMatches } from "./gate-password.server";

describe("shared password date entry", () => {
  // Synthetic date, not the configured site credential.
  const expected = "1300/02/03";
  it("accepts ASCII digits", () => expect(passwordMatches(expected, expected)).toBe(true));
  it("accepts Persian digits", () => expect(passwordMatches("۱۳۰۰/۰۲/۰۳", expected)).toBe(true));
  it("accepts Arabic digits", () => expect(passwordMatches("١٣٠٠/٠٢/٠٣", expected)).toBe(true));
  it("accepts mobile slash variants and invisible direction marks", () => expect(passwordMatches("\u200f۱۳۰۰∕۰۲∕۰۳ ", expected)).toBe(true));
  it("accepts date dashes", () => expect(passwordMatches("1300-02-03", expected)).toBe(true));
  it("rejects incorrect dates and missing digits", () => {
    expect(passwordMatches("1300/02/04", expected)).toBe(false);
    expect(passwordMatches("1300/02/", expected)).toBe(false);
  });
});