#!/usr/bin/env python3
"""Build and validate a BSDIFF40 patch between two signed M AND E APKs."""
from __future__ import annotations
import argparse, hashlib, json, shutil, subprocess, sys
from pathlib import Path
import bsdiff4

ROOT = Path(__file__).resolve().parents[1]
APK_ANALYZER = Path.home() / "android-sdk/cmdline-tools/cmdline-tools/bin/apkanalyzer"
APKSIGNER = Path.home() / "android-sdk/build-tools/35.0.0/apksigner"

def run(args: list[str]) -> str:
    p = subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return p.stdout

def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def apk_info(path: Path) -> dict:
    run([str(APKSIGNER), "verify", "--verbose", str(path)])
    cert = run([str(APKSIGNER), "verify", "--print-certs", str(path)])
    cert_line = next((x.split(":", 1)[1].strip().lower() for x in cert.splitlines()
                      if "Signer #1 certificate SHA-256 digest" in x), None)
    if not cert_line or len(cert_line) != 64:
        raise RuntimeError(f"Could not read signing certificate for {path}")
    package = run([str(APK_ANALYZER), "manifest", "application-id", str(path)]).strip()
    version_code = int(run([str(APK_ANALYZER), "manifest", "version-code", str(path)]).strip())
    version_name = run([str(APK_ANALYZER), "manifest", "version-name", str(path)]).strip()
    return {"packageName": package, "versionCode": version_code,
            "versionName": version_name, "signerSha256": cert_line}

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--max-ratio", type=float, default=0.75)
    args = parser.parse_args()
    base, target, out = args.base.resolve(), args.target.resolve(), args.out.resolve()
    if not base.is_file() or not target.is_file():
        raise SystemExit("Base and target APK files must exist.")
    old, new = apk_info(base), apk_info(target)
    if old["packageName"] != "app.mande.chat" or new["packageName"] != old["packageName"]:
        raise SystemExit("Package mismatch: only app.mande.chat updates are allowed.")
    if new["signerSha256"] != old["signerSha256"]:
        raise SystemExit("Signing certificate mismatch; Android will reject this update.")
    if new["versionCode"] <= old["versionCode"]:
        raise SystemExit("Target versionCode must be greater than base versionCode.")
    out.parent.mkdir(parents=True, exist_ok=True)
    patch = bsdiff4.diff(base.read_bytes(), target.read_bytes())
    out.write_bytes(patch)
    ratio = len(patch) / target.stat().st_size
    metadata = {
        "algorithm": "bsdiff40",
        "fromVersionCode": old["versionCode"],
        "fromVersionName": old["versionName"],
        "fromApkSha256": sha(base),
        "targetVersionCode": new["versionCode"],
        "targetVersionName": new["versionName"],
        "targetPackageName": new["packageName"],
        "targetApkSizeBytes": target.stat().st_size,
        "targetApkSha256": sha(target),
        "targetSignerSha256": new["signerSha256"],
        "patchSizeBytes": len(patch),
        "patchSha256": sha(out),
        "patchRecommended": ratio <= args.max_ratio,
        "patchToFullRatio": round(ratio, 6),
    }
    meta = out.with_suffix(out.suffix + ".json")
    meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    if not metadata["patchRecommended"]:
        print(f"Patch is {ratio:.1%} of full APK; keep full APK as the preferred route.", file=sys.stderr)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
