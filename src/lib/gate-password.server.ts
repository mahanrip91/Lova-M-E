import { createHash, timingSafeEqual } from "node:crypto";

function normalizePassword(value: string): string {
  return value.normalize("NFKC")
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[／⁄∕\\٫.-]/g, "/");
}

export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(normalizePassword(input), "utf8").digest();
  const b = createHash("sha256").update(normalizePassword(expected), "utf8").digest();
  return timingSafeEqual(a, b);
}