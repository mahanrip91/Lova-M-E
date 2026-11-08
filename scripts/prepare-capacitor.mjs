import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

const source = "dist/client";
const target = "www";

await stat(`${source}/_shell.html`);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });

let html = await readFile(`${target}/_shell.html`, "utf8");

html = html.replace(
  /((?:src|href|poster)=["'])\/(assets|icons|favicon\.png|manifest\.webmanifest)/g,
  '$1./$2'
);

await writeFile(`${target}/index.html`, html);
console.log("Capacitor assets prepared with relative paths.");
