/**
 * Public APK update manifest (public/update.json).
 * Only signed Android APK updates are supported.
 */
export const UPDATE_MANIFEST_URL =
  "https://raw.githubusercontent.com/mahanrip91/Lova-M-E/main/public/update.json";

const RELEASE_PATH_PREFIXES = [
  "/mahanrip91/Lova-M-E/releases/download/",
  "/mahanrip91/Lova-M-E/releases/latest/download/",
];

export type UpdateManifest = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  apkSizeBytes: number | null;
  apkSha256: string | null;
  releaseNotes: string[];
  updateType: "apk";
  delta: {
    algorithm: "bsdiff40";
    url: string;
    fromVersionCode: number;
    fromApkSha256: string;
    patchSizeBytes: number;
    patchSha256: string;
    targetApkSizeBytes: number;
    targetApkSha256: string;
  } | null;
  minimumSupportedVersionCode: number | null;
  publishedAt: string | null;
};

export type ManifestResult = { ok: true; manifest: UpdateManifest } | { ok: false; error: string };

export function isAllowedApkUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port) return false;
  if (url.username || url.password) return false;
  if (!url.pathname.toLowerCase().endsWith(".apk") || url.pathname.includes("..")) return false;
  return RELEASE_PATH_PREFIXES.some((p) => url.pathname.startsWith(p));
}

const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

export function isAllowedPatchUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && !url.port &&
      !url.username && !url.password && url.pathname.startsWith("/mahanrip91/Lova-M-E/releases/download/") &&
      !url.pathname.includes("..") && url.pathname.toLowerCase().endsWith(".bsdiff");
  } catch {
    return false;
  }
}

export function parseUpdateManifest(raw: unknown): ManifestResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "ساختار فایل نسخه نامعتبر است." };
  const r = raw as Record<string, unknown>;
  if (!isPosInt(r["versionCode"])) return { ok: false, error: "شمارهٔ نسخه (versionCode) نامعتبر است." };
  if (typeof r["versionName"] !== "string" || !r["versionName"].trim()) return { ok: false, error: "نام نسخه نامعتبر است." };
  if (typeof r["apkUrl"] !== "string" || !isAllowedApkUrl(r["apkUrl"])) return { ok: false, error: "نشانی فایل نصب مجاز نیست." };
  const updateType = r["updateType"] ?? "apk";
  if (updateType !== "apk") return { ok: false, error: "این نوع به‌روزرسانی پشتیبانی نمی‌شود." };

  let apkSizeBytes: number | null = null;
  if (r["apkSizeBytes"] != null) {
    if (!isPosInt(r["apkSizeBytes"])) return { ok: false, error: "حجم فایل نامعتبر است." };
    apkSizeBytes = r["apkSizeBytes"];
  }
  let apkSha256: string | null = null;
  if (r["apkSha256"] != null) {
    if (typeof r["apkSha256"] !== "string" || !/^[a-f0-9]{64}$/i.test(r["apkSha256"]))
      return { ok: false, error: "چکیدهٔ SHA-256 نامعتبر است." };
    apkSha256 = r["apkSha256"].toLowerCase();
  }
  let releaseNotes: string[] = [];
  if (typeof r["releaseNotes"] === "string") releaseNotes = [r["releaseNotes"]];
  else if (Array.isArray(r["releaseNotes"]) && r["releaseNotes"].every((n) => typeof n === "string")) releaseNotes = r["releaseNotes"] as string[];
  else if (r["releaseNotes"] != null) return { ok: false, error: "یادداشت انتشار نامعتبر است." };
  releaseNotes = releaseNotes.map((n) => n.trim()).filter(Boolean);

  let delta: UpdateManifest["delta"] = null;
  if (r["delta"] != null) {
    const d = r["delta"];
    if (!d || typeof d !== "object" || Array.isArray(d)) return { ok: false, error: "اطلاعات پچ نامعتبر است." };
    const v = d as Record<string, unknown>;
    if (v["algorithm"] !== "bsdiff40" || typeof v["url"] !== "string" ||
        !isAllowedPatchUrl(v["url"]) || !isPosInt(v["fromVersionCode"]) ||
        typeof v["fromApkSha256"] !== "string" || !/^[a-f0-9]{64}$/i.test(v["fromApkSha256"]) ||
        !isPosInt(v["patchSizeBytes"]) || typeof v["patchSha256"] !== "string" ||
        !/^[a-f0-9]{64}$/i.test(v["patchSha256"]) || !isPosInt(v["targetApkSizeBytes"]) ||
        typeof v["targetApkSha256"] !== "string" || !/^[a-f0-9]{64}$/i.test(v["targetApkSha256"])) {
      return { ok: false, error: "اطلاعات پچ ناقص یا نامعتبر است." };
    }
    if (apkSizeBytes != null && v["targetApkSizeBytes"] !== apkSizeBytes) return { ok: false, error: "حجم هدف پچ با APK یکی نیست." };
    if (apkSha256 != null && String(v["targetApkSha256"]).toLowerCase() !== apkSha256) return { ok: false, error: "چکیدهٔ هدف پچ با APK یکی نیست." };
    delta = {
      algorithm: "bsdiff40", url: v["url"], fromVersionCode: v["fromVersionCode"],
      fromApkSha256: v["fromApkSha256"].toLowerCase(), patchSizeBytes: v["patchSizeBytes"],
      patchSha256: v["patchSha256"].toLowerCase(), targetApkSizeBytes: v["targetApkSizeBytes"],
      targetApkSha256: v["targetApkSha256"].toLowerCase(),
    };
  }

  let minimumSupportedVersionCode: number | null = null;
  if (r["minimumSupportedVersionCode"] != null) {
    if (!isPosInt(r["minimumSupportedVersionCode"])) return { ok: false, error: "حداقل نسخهٔ پشتیبانی‌شده نامعتبر است." };
    minimumSupportedVersionCode = r["minimumSupportedVersionCode"];
  }
  let publishedAt: string | null = null;
  if (r["publishedAt"] != null) {
    if (typeof r["publishedAt"] !== "string" || Number.isNaN(Date.parse(r["publishedAt"])))
      return { ok: false, error: "تاریخ انتشار نامعتبر است." };
    publishedAt = r["publishedAt"];
  }
  return {
    ok: true,
    manifest: {
      versionCode: r["versionCode"],
      versionName: r["versionName"].trim(),
      apkUrl: r["apkUrl"],
      apkSizeBytes,
      apkSha256,
      releaseNotes,
      updateType: "apk",
      delta,
      minimumSupportedVersionCode,
      publishedAt,
    },
  };
}

/** Compare by integer versionCode only; versionName is display text. */
export function isNewerVersion(manifest: Pick<UpdateManifest, "versionCode">, installedVersionCode: number | null): boolean {
  if (installedVersionCode == null || !Number.isFinite(installedVersionCode)) return false;
  return manifest.versionCode > installedVersionCode;
}

export function isBelowMinimum(manifest: UpdateManifest, installedVersionCode: number | null): boolean {
  return installedVersionCode != null && manifest.minimumSupportedVersionCode != null && installedVersionCode < manifest.minimumSupportedVersionCode;
}

export function formatBytes(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes.toLocaleString("fa-IR")} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} مگابایت`;
}

export async function fetchUpdateManifest(fetcher: typeof fetch = fetch): Promise<ManifestResult> {
  let res: Response;
  try {
    res = await fetcher(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, { cache: "no-store" });
  } catch {
    return { ok: false, error: "اتصال به اینترنت برقرار نشد." };
  }
  if (!res.ok) return { ok: false, error: `دریافت اطلاعات نسخه ناموفق بود (کد ${res.status}).` };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: "فایل اطلاعات نسخه قابل خواندن نیست." };
  }
  return parseUpdateManifest(json);
}

/** Parses an app deep link; returns true when it targets the updates section. */
export function isUpdatesDeepLink(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "app.mande.chat:") return false;
    const path = `${u.hostname}${u.pathname}`.replace(/\/+$/, "");
    return path === "settings/updates";
  } catch {
    return false;
  }
}
