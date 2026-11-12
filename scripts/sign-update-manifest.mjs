import { createSign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const manifestPath = process.argv[2] ?? "public/update.json";
const signaturePath = process.argv[3] ?? "public/update.json.sig";
const keyPath = process.env.MAE_UPDATE_SIGNING_KEY ?? ".mae-update-private-key.pem";

const raw = readFileSync(manifestPath);
const privateKey = readFileSync(keyPath);
const signer = createSign("SHA256");
signer.update(raw);
signer.end();
const signature = signer.sign(privateKey).toString("base64");
writeFileSync(signaturePath, signature + "\n", { mode: 0o644 });
console.log(`Signed ${manifestPath} -> ${signaturePath} (${raw.length} bytes)`);
