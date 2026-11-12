import {
  createHash,
  createPrivateKey,
  sign
} from "node:crypto";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  lstatSync,
  writeFileSync,
  copyFileSync,
  rmSync
} from "node:fs";

import path from "node:path";

const [bundleId, baseUrl, minNativeArg] = process.argv.slice(2);

if (!bundleId || !baseUrl) {
  console.error(
    "Usage: npm run ota:build -- <bundleId> <release-assets-url> [minNativeVersionCode]"
  );
  process.exit(1);
}

if (!/^[a-zA-Z0-9._-]{1,80}$/.test(bundleId)) {
  throw new Error("bundleId نامعتبر است.");
}

if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/?$/.test(baseUrl)) {
  throw new Error("آدرس باید لینک مستقیم GitHub Release باشد.");
}

const minNativeVersionCode = Number(minNativeArg ?? "2");

if (!Number.isSafeInteger(minNativeVersionCode) || minNativeVersionCode < 1) {
  throw new Error("minNativeVersionCode نامعتبر است.");
}

const webDir = path.resolve("www");
const privateKeyPath = path.resolve(".ota-private-key.pem");
const outputDir = path.resolve("ota-out");
const blobsDir = path.join(outputDir, "blobs");

if (!existsSync(webDir) || !existsSync(path.join(webDir, "index.html"))) {
  throw new Error("خروجی www آماده نیست؛ ابتدا npm run build:app را اجرا کن.");
}

if (!existsSync(privateKeyPath)) {
  throw new Error("کلید خصوصی OTA پیدا نشد.");
}

const privateKey = createPrivateKey(readFileSync(privateKeyPath));

if (privateKey.asymmetricKeyType !== "ec") {
  throw new Error("کلید خصوصی باید از نوع EC باشد.");
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(blobsDir, { recursive: true });

const files = [];
let totalSize = 0;

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const absolute = path.join(directory, entry);
    const info = lstatSync(absolute);

    if (info.isSymbolicLink()) {
      throw new Error(`Symlink مجاز نیست: ${absolute}`);
    }

    if (info.isDirectory()) {
      walk(absolute);
      continue;
    }

    if (!info.isFile()) continue;

    const relative = path.relative(webDir, absolute)
      .split(path.sep)
      .join("/");

    // APK update metadata remains managed by the native updater.
    if (relative === "update.json") continue;

    if (
      relative.startsWith("/") ||
      relative.split("/").some(part => part === "." || part === "..")
    ) {
      throw new Error(`مسیر نامعتبر: ${relative}`);
    }

    const content = readFileSync(absolute);
    const sha256 = createHash("sha256").update(content).digest("hex");
    const size = content.length;

    totalSize += size;

    if (size > 25 * 1024 * 1024) {
      throw new Error(`فایل بیش از حد بزرگ است: ${relative}`);
    }

    const blobPath = path.join(blobsDir, sha256);

    if (!existsSync(blobPath)) {
      writeFileSync(blobPath, content);
    }

    files.push({
      path: relative,
      sha256,
      size,
      url: `${baseUrl.replace(/\/$/, "")}/${sha256}`
    });
  }
}

walk(webDir);
files.sort((a, b) => a.path.localeCompare(b.path));

if (!files.some(file => file.path === "index.html")) {
  throw new Error("index.html در خروجی وجود ندارد.");
}

if (files.length > 2000 || totalSize > 200 * 1024 * 1024) {
  throw new Error("محدودیت تعداد یا حجم فایل‌ها رد شده است.");
}

const manifest = {
  schema: 1,
  bundleId,
  nativeApiLevel: 1,
  minNativeVersionCode,
  entry: "index.html",
  totalSize,
  releaseNotes: `OTA bundle ${bundleId}`,
  files
};

const manifestBytes = Buffer.from(
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

const signature = sign("sha256", manifestBytes, privateKey)
  .toString("base64");

writeFileSync(path.join(outputDir, "manifest.json"), manifestBytes);
writeFileSync(path.join(outputDir, "manifest.sig"), signature + "\n");

console.log("OTA bundle آماده شد.");
console.log("Bundle:", bundleId);
console.log("Files:", files.length);
console.log("Total size:", totalSize);
console.log("Unique blobs:", readdirSync(blobsDir).length);
console.log("Output:", outputDir);
console.log("امضای مانیفست ساخته شد.");
