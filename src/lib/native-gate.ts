import { NATIVE_PASSWORD_HASH } from "./native-gate.generated";
import type { Viewer } from "./gate.functions";

const KEY = "mae:native-gate";

function normalize(value: string) {
  return value.normalize("NFKC")
    .replace(/[۰-۹]/g, c => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, c => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[／⁄∕\\٫.-]/g, "/");
}

export function getNativeGate(): { unlocked: boolean; viewer: Viewer | null } {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "null");
    if (data?.unlocked === true && (data.viewer === "M" || data.viewer === "E")) {
      return { unlocked: true, viewer: data.viewer };
    }
  } catch {}
  return { unlocked: false, viewer: null };
}

export async function unlockNative(password: string, viewer: Viewer) {
  const bytes = new TextEncoder().encode(normalize(password));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map(x => x.toString(16).padStart(2, "0")).join("");

  if (hash !== NATIVE_PASSWORD_HASH) return false;

  localStorage.setItem(KEY, JSON.stringify({ unlocked: true, viewer }));
  return true;
}

export function lockNative() {
  localStorage.removeItem(KEY);
}
