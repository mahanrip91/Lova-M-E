# OTA web-bundle updater for M AND E (Android, Capacitor 8)

## Recommendation
Option B: a small self-hosted updater using Capacitor's built-in `Bridge.setServerBasePath()`, with signed per-file manifests hosted on GitHub Releases. It needs no paid service, adds no third-party plugin, fits the Termux flow (only Node scripts are needed for web releases), and keeps the existing APK updater as the fallback for native changes.

## How the WebView loads a downloaded bundle
- Capacitor Android serves `www/` from the APK's assets through `WebViewLocalServer` at `https://localhost`. Changing `www` on disk has no effect on an installed APK.
- Capacitor 8 can serve from a folder on the device instead: `bridge.setServerBasePath(absPath)` switches the local server to read from that folder and reloads. The origin stays `https://localhost`, so IndexedDB, localStorage and the Supabase session are unchanged. This is the same mechanism used by Ionic's live updates and by Capgo.
- At startup, `MainActivity` (in `onCreate`, after `super`) reads `files/ota/current.json`. If it points to a verified, compatible bundle, it calls `setServerBasePath(files/ota/bundles/<id>)`. Otherwise it serves from the APK assets.
- No separate HTTP server and no remote URL are involved. Code only ever runs from local, verified files.

## Options compared
| | A: Capgo | B: Custom (recommended) |
|---|---|---|
| Delta | Per-file manifest ("delta") downloads | Per-file SHA-256 content-addressed downloads |
| Signing | Optional end-to-end encryption/signing | Ed25519 manifest signature, public key built into the APK |
| Hosting | Capgo cloud (paid tiers, bandwidth/MAU limits; self-hosting is possible but complex) | GitHub Releases/raw, free |
| Rollback | Built in (`notifyAppReady`) | Built ourselves with the same pattern |
| Effort | Low code, but account, CLI and vendor lock-in | About 600 lines of Java + TS + scripts |
| Termux | CLI needs Node; works | Node scripts only |
Capgo pricing and limits change often. Check them before choosing it; this plan does not depend on them.

## Protocol
`ota/channel.json` (small, polled), served from `https://github.com/mahanrip91/Lova-M-E/releases/latest/download/ota-channel.json`:
```json
{ "schema":1, "bundleId":"web-2026.11.12-1", "manifestUrl":"…/ota-manifest-<id>.json",
  "minNativeVersionCode":2, "maxNativeVersionCode":null, "publishedAt":"…" }
```
`ota-manifest-<id>.json` + `ota-manifest-<id>.json.sig` (Ed25519 over the exact bytes):
```json
{ "schema":1, "bundleId":"…", "minNativeVersionCode":2, "nativeApiLevel":1,
  "baseUrl":"…/ota-files/", "entry":"index.html", "totalSize":123,
  "files":[{"path":"assets/app-abc.js","sha256":"…","size":1234}],
  "releaseNotes":"…" }
```
- Files are fetched as `baseUrl + sha256` (content-addressed, hosted as one release asset per hash, or a single release with all blobs). Unchanged hashes are copied or hard-linked from the local blob store `files/ota/blobs/<sha>`, so only changed files download.
- `nativeApiLevel` is a constant in the Java plugin. It increases when the JS↔native plugin surface changes, and a bundle that needs a higher level is refused and the APK update is offered instead.

## Security
- Ed25519 public key built into the APK (`UpdateConfig`). The manifest is rejected unless its signature verifies, on Java 15+ / Android 13+ via `Signature.getInstance("Ed25519")` or otherwise via bundled BouncyCastle-lite (a decision before building: see below).
- Every file is checked for size and SHA-256 after download, and a mismatch deletes it.
- Path rules: relative paths only, `[A-Za-z0-9._/-]`, no `..`, no leading `/`, no backslash. The canonical path must stay inside the staging dir.
- Limits: at most 2,000 files, at most 25 MB per file, at most 60 MB total, and free-space check × 2. No zip is used, so there is no zip-bomb risk.
- HTTPS only, allowlisted hosts (`github.com`, `objects.githubusercontent.com`).
- The signing private key stays on the user's machine (`.ota-signing-key`, gitignored) and is never committed or put in CI unencrypted.

## Activation and rollback
```text
download → staging/<id> → verify all → rename to bundles/<id> (atomic)
→ current.json = {pending:<id>, lastGood:<old|builtin>, attempts:0} (written to tmp+rename)
→ apply on next cold start (or "Restart now")
→ JS calls OtaUpdater.notifyReady() within 15 s of boot
   ok  → lastGood = id, pending cleared, old bundles pruned (keep 2)
   no  → next start: attempts++ ; ≥1 failure → revert to lastGood, mark id bad
```
- "Reset to built-in version" button in Settings.
- After an APK update (new versionCode), any OTA bundle with a lower `minNativeVersionCode`/build stamp than the APK is discarded so the newer built-in assets win.
- Only `files/ota/` is touched. IndexedDB, localStorage, caches and Supabase are never cleared.

## Files to change or add
Native (needs one final APK, v1.2.0 / versionCode 3):
- `android/.../OtaUpdaterPlugin.java` (new): `check`, `download` (progress events), `apply`, `notifyReady`, `reset`, `getState`.
- `android/.../OtaStore.java` (new): verify, paths, atomic write, rollback logic.
- `MainActivity.java`: register plugin, choose base path at startup.
- `UpdateCheckWorker.java`: also poll `ota-channel.json`, download in the background on Wi-Fi/unmetered only, notify "update ready". The tap opens the existing `app.mande.chat://settings/updates` link.
- `UpdateConfig.java`: channel URL, public key, `NATIVE_API_LEVEL`.
- `android/app/build.gradle`: versionCode 3; BouncyCastle only if needed.

Web:
- `src/lib/ota-manifest.ts` (new) + `ota-manifest.test.ts`: strict parse, path validation, compatibility decision, and choosing between OTA, APK and none.
- `src/lib/update-manifest.ts`: unchanged APK parser. Add `nativeRequired` routing only.
- `src/routes/settings.tsx`: Updates section shows the web bundle id, progress bar, "Restart to apply", "Reset to built-in", and an APK block (kept).
- `src/routes/__root.tsx`: call `notifyReady()` after the first successful render.
- `scripts/build-ota.mjs` (new): from `www/`, hash files, write the manifest, sign it with Ed25519 (`node:crypto`), and output `ota-out/` (manifest, sig, channel, blobs named by hash).
- `scripts/ota-keygen.mjs` (new), `.gitignore` (key, ota-out).
- `public/update.json`: unchanged.

## Release workflow (Termux)
1. `npm run build:app` → `www/`
2. `node scripts/build-ota.mjs --min-native 3` → `ota-out/`
3. `gh release create web-<id> ota-out/*` (and update the `latest` channel asset)
4. Native changes: bump versionCode, build the APK, and publish as today. The APK flow stays the same.

## Tests
- TS (vitest): manifest parse/reject (bad schema, traversal, oversize, duplicates), compatibility matrix, delta plan (which hashes to fetch), rollback state machine (pure TS mirror).
- Script test: build-ota output verifies with the public key, and tampering fails.
- Java: JUnit for `OtaStore` path checks and the rollback state machine (runs only where Gradle works; may not run on Termux).
- Manual on device: apply, a bundle that never calls notifyReady (rollback), wrong signature, airplane mode mid-download, APK upgrade over an OTA bundle.

## Migration and rollback
- The first OTA-capable APK (versionCode 3) must still be installed once with the existing APK updater.
- Kill switch: publish a channel with `bundleId:"builtin"`, which makes devices reset to the APK assets.
- If OTA is ever removed, a later APK simply ignores `files/ota/`.

## Tradeoffs and things not promised
- This is not binary APK delta patching. Native, permission or plugin changes always need a full APK.
- Changing Vite chunk hashes can make many files "changed". The real saving depends on how much of the build changes; usually a large saving compared with a full APK.
- An update applies on the next restart, not live mid-session.
- Ed25519 support: decision needed between requiring API 33+ native crypto or bundling BouncyCastle (adds about 1 MB). The default is to bundle it for older Android.
- Java has not been compiled in this environment; it must be built locally.
