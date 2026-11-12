import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const value = (name) => {
  const item = args.find((x) => x.startsWith(`--${name}=`));
  return item ? item.slice(name.length + 3) : null;
};
const flag = (name) => args.includes(`--${name}`);
const run = (cmd, argv, options = {}) => {
  const result = spawnSync(cmd, argv, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`Command failed: ${cmd} ${argv.join(" ")}`);
};
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

if (!value("apk") && !args.includes("--no-build")) {
  run("npm", ["run", "build:app"]);
  run("bash", ["android/gradlew", "-p", "android", "assembleDebug", "--no-daemon"]);
}

const gradle = readFileSync("android/app/build.gradle", "utf8");
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (!versionCode || !versionName) throw new Error("Could not read Android versionCode/versionName.");
const tag = value("tag") || `v${versionName}-${versionCode}`;
const apk = path.resolve(value("apk") || "android/app/build/outputs/apk/debug/app-debug.apk");
let base = value("base") ? path.resolve(value("base")) : null;
const notes = value("notes") || "به‌روزرسانی هوشمند M AND E؛ بهبود پایداری و نصب امن.";
if (!existsSync(apk)) throw new Error(`APK not found: ${apk}`);
if (base && !existsSync(base)) throw new Error(`Base APK not found: ${base}`);
if (!base) {
  const latest = spawnSync("gh", ["release", "view", "--repo", "mahanrip91/Lova-M-E", "--json", "tagName,assets"], { cwd: root, encoding: "utf8" });
  if (latest.status === 0) {
    const release = JSON.parse(latest.stdout);
    if (release.assets?.some((asset) => asset.name === "M-AND-E.apk")) {
      const baseDir = path.resolve("dist/updates/base");
      mkdirSync(baseDir, { recursive: true });
      run("gh", ["release", "download", release.tagName, "--repo", "mahanrip91/Lova-M-E", "--pattern", "M-AND-E.apk", "--dir", baseDir]);
      base = path.join(baseDir, "M-AND-E.apk");
      console.log("Using previous release APK as delta base: " + release.tagName);
    } else {
      console.log("No previous APK release found; this first APK update will use the full package.");
    }
  }
}

const existing = spawnSync("gh", ["release", "view", tag, "--repo", "mahanrip91/Lova-M-E"], { cwd: root, stdio: "ignore" });
if (existing.status === 0) throw new Error(`Release ${tag} already exists; refusing to overwrite it.`);

const apkName = "M-AND-E.apk";
const releaseUrl = `https://github.com/mahanrip91/Lova-M-E/releases/download/${tag}/${apkName}`;
const apkBytes = statSync(apk).size;
const apkSha = hash(apk);
let delta = null;
let patch = null;

if (base) {
  patch = path.resolve(`dist/updates/M-AND-E-${tag}.bsdiff`);
  run("python", ["scripts/build-delta.py", "--base", base, "--target", apk, "--out", patch]);
  const metadata = JSON.parse(readFileSync(patch + ".json", "utf8"));
  if (metadata.patchRecommended) {
    delta = {
      algorithm: "bsdiff40",
      url: `https://github.com/mahanrip91/Lova-M-E/releases/download/${tag}/M-AND-E-${tag}.bsdiff`,
      fromVersionCode: metadata.fromVersionCode,
      fromApkSha256: metadata.fromApkSha256,
      patchSizeBytes: metadata.patchSizeBytes,
      patchSha256: metadata.patchSha256,
      targetApkSizeBytes: metadata.targetApkSizeBytes,
      targetApkSha256: metadata.targetApkSha256,
    };
  } else {
    console.log("Patch is not sufficiently smaller; publishing the full APK only.");
    patch = null;
  }
}

const manifestPath = "public/update.json";
const previous = JSON.parse(readFileSync(manifestPath, "utf8"));
const manifest = {
  versionCode,
  versionName,
  apkUrl: releaseUrl,
  apkSizeBytes: apkBytes,
  apkSha256: apkSha,
  releaseNotes: notes.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
  updateType: "apk",
  delta,
  minimumSupportedVersionCode: previous.minimumSupportedVersionCode ?? null,
  publishedAt: new Date().toISOString(),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
run("node", ["scripts/sign-update-manifest.mjs"]);

const assets = [`${apk}#${apkName}`];
if (patch) assets.push(`${patch}#M-AND-E-${tag}.bsdiff`);
run("gh", [
  "release", "create", tag, ...assets,
  "--repo", "mahanrip91/Lova-M-E",
  "--title", `M AND E ${versionName} (${versionCode})`,
  "--notes", notes,
  "--latest",
]);

run("git", ["add", "public/update.json", "public/update.json.sig"]);
run("git", ["commit", "-m", `Publish M AND E update ${versionName} (${versionCode})`]);
run("git", ["push", "origin", "main"]);

console.log("\nPublished signed update manifest.");
console.log(`APK: ${apkBytes.toLocaleString("en-US")} bytes; SHA-256 ${apkSha}`);
console.log(delta ? `Delta: ${delta.patchSizeBytes.toLocaleString("en-US")} bytes` : "Delta: none (full APK fallback)");
console.log(`Release: https://github.com/mahanrip91/Lova-M-E/releases/tag/${tag}`);
