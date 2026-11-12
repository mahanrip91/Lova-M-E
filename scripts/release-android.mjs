import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const value = (name) => {
  const item = args.find((x) => x.startsWith(`--${name}=`));
  return item ? item.slice(name.length + 3) : null;
};
const run = (cmd, argv, options = {}) => {
  const result = spawnSync(cmd, argv, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`Command failed: ${cmd} ${argv.join(" ")}`);
};
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const gitStatus = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
if (gitStatus.status !== 0 || gitStatus.stdout.trim()) throw new Error("Commit and push source changes before publishing an Android release.");
const branch = spawnSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" });
if (branch.stdout.trim() !== "main") throw new Error("Android releases must be published from main.");

const autoBuild = !value("apk") && !args.includes("--no-build");
const gradlePath = "android/app/build.gradle";
let gradle = readFileSync(gradlePath, "utf8");
let versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
let versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
if (!versionCode || !versionName) throw new Error("Could not read Android versionCode/versionName.");
const previousManifest = JSON.parse(readFileSync("public/update.json", "utf8"));
if (autoBuild && versionCode <= Number(previousManifest.versionCode || 0)) {
  const semver = versionName.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!semver) throw new Error("Version name must be MAJOR.MINOR.PATCH to auto-increment.");
  versionCode = Number(previousManifest.versionCode || versionCode) + 1;
  versionName = semver[1] + "." + semver[2] + "." + (Number(semver[3]) + 1);
  gradle = gradle.replace(/versionCode\s+\d+/, "versionCode " + versionCode)
    .replace(/versionName\s+"[^"]+"/, "versionName \"" + versionName + "\"");
  writeFileSync(gradlePath, gradle);
  run("git", ["add", gradlePath]);
  run("git", ["commit", "-m", "Bump Android version to " + versionName + " (" + versionCode + ")"]);
  run("git", ["push", "origin", "main"]);
  console.log("Auto-incremented Android version to " + versionName + " (" + versionCode + ").");
}
if (autoBuild) {
  run("npm", ["run", "build:app"]);
  // Copy the freshly built www/ output into android/app/src/main/assets/public.
  // Without this, Gradle can package stale web chunks from a previous build.
  run("npx", ["cap", "copy", "android"]);
  run("bash", ["android/gradlew", "-p", "android", "assembleDebug", "--no-daemon"]);
}
if (!value("apk") && !args.includes("--no-build")) {
  const webChanges = spawnSync("git", ["status", "--porcelain", "--", "www"], { cwd: root, encoding: "utf8" });
  if (webChanges.stdout.trim()) {
    run("git", ["add", "www"]);
    run("git", ["commit", "-m", "Build Android web assets " + versionName + " (" + versionCode + ")"]);
    run("git", ["push", "origin", "main"]);
  }
}
const tag = value("tag") || `v${versionName}-${versionCode}`;
const apk = path.resolve(value("apk") || "android/app/build/outputs/apk/debug/app-debug.apk");
let base = value("base") ? path.resolve(value("base")) : null;
const notes = value("notes") || "حذف مسیر به‌روزرسانی وب؛ یکپارچه‌سازی به‌روزرسانی امن APK و اصلاح پچ کم‌حجم.";
if (!existsSync(apk)) throw new Error(`APK not found: ${apk}`);
if (base && !existsSync(base)) throw new Error(`Base APK not found: ${base}`);
if (!base) {
  const latest = spawnSync("gh", ["release", "view", "--repo", "mahanrip91/Lova-M-E", "--json", "tagName,assets"], { cwd: root, encoding: "utf8" });
  if (latest.status === 0) {
    const release = JSON.parse(latest.stdout);
    if (release.assets?.some((asset) => asset.name === "M-AND-E.apk")) {
      const baseDir = path.resolve("dist/updates/base");
      mkdirSync(baseDir, { recursive: true });
      try {
        run("gh", ["release", "download", release.tagName, "--repo", "mahanrip91/Lova-M-E", "--pattern", "M-AND-E.apk", "--dir", baseDir, "--clobber"]);
        base = path.join(baseDir, "M-AND-E.apk");
        console.log("Using previous release APK as delta base: " + release.tagName);
      } catch (error) {
        console.warn("Previous APK could not be retrieved; publishing a full APK instead.");
        base = null;
      }
    } else {
      console.log("No previous APK release found; this first APK update will use the full package.");
    }
  }
}

const existing = spawnSync("gh", ["release", "view", tag, "--repo", "mahanrip91/Lova-M-E"], { cwd: root, stdio: "ignore" });
if (existing.status === 0) throw new Error(`Release ${tag} already exists; refusing to overwrite it.`);

const apkName = "M-AND-E.apk";
const publishDir = path.resolve("dist/updates");
mkdirSync(publishDir, { recursive: true });
const publishApk = path.join(publishDir, apkName);
copyFileSync(apk, publishApk);
const releaseUrl = `https://github.com/mahanrip91/Lova-M-E/releases/download/${tag}/${apkName}`;
const apkBytes = statSync(apk).size;
const apkSha = hash(apk);
let delta = null;
let patch = null;

if (base) {
  try {
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
  } catch (error) {
    console.warn("Delta build failed; publishing a full APK instead: " + (error?.message || error));
    delta = null;
    patch = null;
  }
}


const assets = [publishApk];
if (patch) assets.push(patch);
run("gh", [
  "release", "create", tag, ...assets,
  "--repo", "mahanrip91/Lova-M-E",
  "--title", `M AND E ${versionName} (${versionCode})`,
  "--notes", notes,
  "--latest",
]);

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

run("git", ["add", "public/update.json", "public/update.json.sig"]);
run("git", ["commit", "-m", `Publish M AND E update ${versionName} (${versionCode})`]);
run("git", ["push", "origin", "main"]);

console.log("\nPublished signed update manifest.");
console.log(`APK: ${apkBytes.toLocaleString("en-US")} bytes; SHA-256 ${apkSha}`);
console.log(delta ? `Delta: ${delta.patchSizeBytes.toLocaleString("en-US")} bytes` : "Delta: none (full APK fallback)");
console.log(`Release: https://github.com/mahanrip91/Lova-M-E/releases/tag/${tag}`);
