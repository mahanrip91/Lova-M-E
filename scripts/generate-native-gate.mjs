import fs from "node:fs";
import { createHash } from "node:crypto";

const env = fs.readFileSync(".dev.vars", "utf8");
const line = env.split(/\r?\n/).find(x => /^\s*SITE_PASSWORD\s*=/.test(x));

if (!line) throw new Error("SITE_PASSWORD در .dev.vars پیدا نشد");

let password = line.slice(line.indexOf("=") + 1).trim();
if ((password.startsWith('"') && password.endsWith('"')) ||
    (password.startsWith("'") && password.endsWith("'"))) {
  password = password.slice(1, -1);
}

function normalize(value) {
  return value.normalize("NFKC")
    .replace(/[۰-۹]/g, c => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)))
    .replace(/[٠-٩]/g, c => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[\s\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[／⁄∕\\٫.-]/g, "/");
}

const hash = createHash("sha256").update(normalize(password)).digest("hex");
fs.writeFileSync("src/lib/native-gate.generated.ts",
  `export const NATIVE_PASSWORD_HASH = "${hash}";\n`);
console.log("Native password hash generated.");
