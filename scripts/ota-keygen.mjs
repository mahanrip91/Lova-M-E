import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const privatePath = ".ota-private-key.pem";
const publicPath = "scripts/ota-public-key.pem";

if (existsSync(privatePath) || existsSync(publicPath)) {
  console.error("کلید قبلی وجود دارد؛ برای جلوگیری از جایگزینی متوقف شد.");
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey);

console.log("کلیدها ساخته شدند.");
console.log("\n========== PUBLIC KEY ==========\n");
console.log(publicKey);
console.log("========== PRIVATE KEY ==========");
console.log("کلید خصوصی ذخیره شد؛ آن را ارسال یا منتشر نکن.");
