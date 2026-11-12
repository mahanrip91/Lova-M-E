import { describe, expect, it } from "vitest";
import { isAllowedApkUrl, isAllowedPatchUrl, isNewerVersion, isUpdatesDeepLink, parseUpdateManifest } from "./update-manifest";
import current from "../../public/update.json";

const base = { versionCode: 3, versionName: "1.2.0", apkUrl: "https://github.com/mahanrip91/Lova-M-E/releases/download/v1.2.0/M-AND-E.apk" };

describe("update manifest", () => {
  it("accepts the shipped public/update.json", () => {
    expect(parseUpdateManifest(current).ok).toBe(true);
  });
  it("accepts legacy manifest with only three fields and nulls optional ones", () => {
    const r = parseUpdateManifest(base);
    expect(r.ok && r.manifest.apkSha256).toBe(null);
    expect(r.ok && r.manifest.updateType).toBe("apk");
  });
  it("compares versionCode, not versionName", () => {
    expect(isNewerVersion({ versionCode: 3 }, 2)).toBe(true);
    expect(isNewerVersion({ versionCode: 2 }, 2)).toBe(false);
    expect(isNewerVersion({ versionCode: 10 }, 9)).toBe(true);
    expect(isNewerVersion({ versionCode: 1 }, 2)).toBe(false);
  });
  it("rejects non-apk update types", () => {
    expect(parseUpdateManifest({ ...base, updateType: "web" }).ok).toBe(false);
  });
  it("rejects bad checksum and accepts valid one", () => {
    expect(parseUpdateManifest({ ...base, apkSha256: "abc" }).ok).toBe(false);
    expect(parseUpdateManifest({ ...base, apkSha256: "A".repeat(64) }).ok).toBe(true);
  });
  it("validates BSDIFF metadata and only accepts this repository's patch assets", () => {
    const delta = {
      algorithm: "bsdiff40",
      url: "https://github.com/mahanrip91/Lova-M-E/releases/download/v1.2.0/update.bsdiff",
      fromVersionCode: 2,
      fromApkSha256: "a".repeat(64),
      patchSizeBytes: 1200,
      patchSha256: "b".repeat(64),
      targetApkSizeBytes: 5000,
      targetApkSha256: "c".repeat(64),
    };
    const r = parseUpdateManifest({ ...base, apkSizeBytes: 5000, apkSha256: "c".repeat(64), delta });
    expect(r.ok && r.manifest.delta?.fromVersionCode).toBe(2);
    expect(isAllowedPatchUrl(delta.url)).toBe(true);
    expect(isAllowedPatchUrl("https://evil.example/update.bsdiff")).toBe(false);
    expect(parseUpdateManifest({ ...base, delta: { ...delta, patchSha256: "bad" } }).ok).toBe(false);
  });
  it("accepts string release notes", () => {
    const r = parseUpdateManifest({ ...base, releaseNotes: "بهبود پایداری" });
    expect(r.ok && r.manifest.releaseNotes).toEqual(["بهبود پایداری"]);
  });
  it("only allows this project's GitHub release APK URLs", () => {
    expect(isAllowedApkUrl(base.apkUrl)).toBe(true);
    expect(isAllowedApkUrl("http://github.com/mahanrip91/Lova-M-E/releases/download/v1/a.apk")).toBe(false);
    expect(isAllowedApkUrl("https://evil.com/mahanrip91/Lova-M-E/releases/download/v1/a.apk")).toBe(false);
    expect(isAllowedApkUrl("https://github.com/other/repo/releases/download/v1/a.apk")).toBe(false);
    expect(isAllowedApkUrl("https://github.com/mahanrip91/Lova-M-E/releases/download/v1/a.zip")).toBe(false);
  });
  it("recognizes the updates deep link", () => {
    expect(isUpdatesDeepLink("app.mande.chat://settings/updates")).toBe(true);
    expect(isUpdatesDeepLink("app.mande.chat://chat")).toBe(false);
  });
});
