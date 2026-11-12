package app.mande.chat;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.pm.PackageInfoCompat;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Locale;
import org.json.JSONObject;

final class UpdateInstaller {
    private static final long MAX_APK_BYTES = 200L * 1024L * 1024L;
    private static final long MAX_PATCH_BYTES = 150L * 1024L * 1024L;
    private static final String PACKAGE_NAME = "app.mande.chat";

    static final class Result {
        final File apk;
        final String method;
        final String fallbackReason;
        Result(File apk, String method, String fallbackReason) {
            this.apk = apk;
            this.method = method;
            this.fallbackReason = fallbackReason;
        }
    }

    interface ProgressListener {
        void onProgress(String stage, String method, long downloadedBytes, long totalBytes);
    }

    private UpdateInstaller() {}

    static Result prepare(Context context, ProgressListener progress) throws Exception {
        report(progress, "checking", "", 0, 0);
        JSONObject manifest = fetchVerifiedManifest();
        long targetCode = manifest.getLong("versionCode");
        String targetName = manifest.getString("versionName");
        String apkUrl = manifest.getString("apkUrl");
        String apkHash = requireHash(manifest.getString("apkSha256"));
        long apkSize = manifest.getLong("apkSizeBytes");
        if (targetCode <= 0 || targetName.trim().isEmpty() || apkSize <= 0 || apkSize > MAX_APK_BYTES ||
            !UpdateConfig.isAllowedApkUrl(apkUrl)) throw new SecurityException("اطلاعات فایل نصب معتبر نیست.");

        PackageManager pm = context.getPackageManager();
        PackageInfo installed = getPackageInfo(pm, context.getPackageName());
        long installedCode = PackageInfoCompat.getLongVersionCode(installed);
        if (targetCode <= installedCode) throw new IllegalStateException("نسخهٔ جدیدتری برای نصب وجود ندارد.");

        // Keep the reconstructed APK inside the app's private cache; never use public Downloads.
        File updatesDir = new File(context.getCacheDir(), "mae-updates");
        if (!updatesDir.exists() && !updatesDir.mkdirs()) throw new IllegalStateException("ساخت پوشهٔ به‌روزرسانی ممکن نشد.");
        File finalApk = new File(updatesDir, "M-AND-E-update.apk");
        File tempDir = new File(context.getCacheDir(), "mae-updates");
        if (!tempDir.exists() && !tempDir.mkdirs()) throw new IllegalStateException("ساخت پوشهٔ موقت ممکن نشد.");

        JSONObject delta = manifest.optJSONObject("delta");
        String fallbackReason = null;
        if (delta != null) {
            File patch = new File(tempDir, "update.bsdiff");
            File rebuilt = new File(tempDir, "rebuilt.apk");
            try {
                long fromCode = delta.getLong("fromVersionCode");
                String fromHash = requireHash(delta.getString("fromApkSha256"));
                String patchUrl = delta.getString("url");
                String patchHash = requireHash(delta.getString("patchSha256"));
                long patchSize = delta.getLong("patchSizeBytes");
                long targetSize = delta.getLong("targetApkSizeBytes");
                String deltaTargetHash = requireHash(delta.getString("targetApkSha256"));
                if (fromCode != installedCode || patchSize <= 0 || patchSize > MAX_PATCH_BYTES || patchSize >= (long) (apkSize * 0.85d) ||
                    targetSize != apkSize || !deltaTargetHash.equals(apkHash) ||
                    !isAllowedReleaseUrl(patchUrl, ".bsdiff")) throw new SecurityException("اطلاعات پچ با نسخهٔ فعلی سازگار نیست.");

                File baseApk = new File(context.getApplicationInfo().sourceDir);
                if (!sha256(baseApk).equals(fromHash)) throw new SecurityException("فایل پایه با پچ سازگار نیست.");
                report(progress, "downloading", "delta", 0, patchSize);
                downloadVerified(patchUrl, patch, patchSize, patchHash, MAX_PATCH_BYTES, progress, "delta");
                report(progress, "rebuilding", "delta", patchSize, patchSize);
                BsdiffApplier.apply(baseApk, patch, rebuilt, targetSize, MAX_APK_BYTES);
                report(progress, "verifying", "delta", patchSize, patchSize);
                if (!sha256(rebuilt).equals(apkHash)) throw new SecurityException("خروجی پچ با APK منتشرشده یکی نیست.");
                validateApk(context, rebuilt, targetCode, targetName, installed);
                copyFile(rebuilt, finalApk);
                return new Result(finalApk, "delta", null);
            } catch (Exception deltaFailure) {
                fallbackReason = deltaFailure.getMessage() == null
                    ? deltaFailure.getClass().getSimpleName()
                    : deltaFailure.getMessage();
                android.util.Log.w("MAE-UPDATE", "Delta patch failed; using verified full APK: " + fallbackReason, deltaFailure);
                report(progress, "fallback", "full", 0, apkSize);
                // Delta is an optimization only. A verified full APK is the safe fallback.
                //noinspection ResultOfMethodCallIgnored
                patch.delete();
                //noinspection ResultOfMethodCallIgnored
                rebuilt.delete();
                // Continue to the full APK path.
            }
        }

        report(progress, "downloading", "full", 0, apkSize);
        downloadVerified(apkUrl, finalApk, apkSize, apkHash, MAX_APK_BYTES, progress, "full");
        report(progress, "verifying", "full", apkSize, apkSize);
        try {
            validateApk(context, finalApk, targetCode, targetName, installed);
        } catch (Exception invalid) {
            //noinspection ResultOfMethodCallIgnored
            finalApk.delete();
            throw invalid;
        }
        return new Result(finalApk, "full", fallbackReason);
    }

    private static JSONObject fetchVerifiedManifest() throws Exception {
        byte[] raw = fetchBytes(UpdateConfig.MANIFEST_URL, 64 * 1024);
        byte[] sigRaw = fetchBytes(UpdateConfig.MANIFEST_SIGNATURE_URL, 4096);
        String signatureText = new String(sigRaw, java.nio.charset.StandardCharsets.UTF_8).trim();
        byte[] keyBytes = android.util.Base64.decode(UpdateConfig.UPDATE_PUBLIC_KEY, android.util.Base64.DEFAULT);
        PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(keyBytes));
        java.security.Signature verifier = java.security.Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(key);
        verifier.update(raw);
        if (!verifier.verify(android.util.Base64.decode(signatureText, android.util.Base64.DEFAULT))) {
            throw new SecurityException("امضای اطلاعات به‌روزرسانی معتبر نیست.");
        }
        return new JSONObject(new String(raw, java.nio.charset.StandardCharsets.UTF_8));
    }

    private static byte[] fetchBytes(String address, int max) throws Exception {
        HttpURLConnection c = openConnection(address, false);
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (c.getResponseCode() != 200) throw new IllegalStateException("دریافت اطلاعات نسخه ناموفق بود.");
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) {
                if (out.size() + n > max) throw new IllegalStateException("فایل اطلاعات نسخه بیش از حد بزرگ است.");
                out.write(buffer, 0, n);
            }
            return out.toByteArray();
        } finally { c.disconnect(); }
    }

    private static HttpURLConnection openConnection(String address, boolean redirects) throws Exception {
        URL current = new URL(address);
        for (int attempt = 0; attempt <= (redirects ? 5 : 0); attempt++) {
            if (!"https".equalsIgnoreCase(current.getProtocol()) || current.getUserInfo() != null ||
                (current.getPort() != -1 && current.getPort() != 443)) {
                throw new SecurityException("نشانی امن نیست.");
            }
            String host = current.getHost().toLowerCase(Locale.ROOT);
            if (!host.equals("raw.githubusercontent.com") && !host.equals("github.com") &&
                !host.equals("release-assets.githubusercontent.com") && !host.equals("objects.githubusercontent.com")) {
                throw new SecurityException("میزبان دانلود مجاز نیست.");
            }
            HttpURLConnection c = (HttpURLConnection) current.openConnection();
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(false);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && redirects) {
                String location = c.getHeaderField("Location");
                c.disconnect();
                if (location == null || attempt == 5) throw new IllegalStateException("مسیر دانلود معتبر نیست.");
                current = new URL(current, location);
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new IllegalStateException("سرور فایل را برنگرداند (HTTP " + code + ").");
            }
            return c;
        }
        throw new IllegalStateException("تعداد تغییرمسیرها بیش از حد مجاز است.");
    }

    private static boolean isAllowedReleaseUrl(String value, String extension) {
        try {
            Uri u = Uri.parse(value);
            String path = u.getPath();
            return "https".equals(u.getScheme()) && "github.com".equals(u.getHost()) &&
                u.getPort() == -1 && u.getUserInfo() == null && path != null && !path.contains("..") &&
                path.startsWith("/mahanrip91/Lova-M-E/releases/download/") &&
                path.toLowerCase(Locale.ROOT).endsWith(extension);
        } catch (Exception e) { return false; }
    }

    private static void downloadVerified(String url, File output, long expectedSize, String expectedHash, long max,
                                         ProgressListener progress, String method) throws Exception {
        if (expectedSize <= 0 || expectedSize > max) throw new SecurityException("حجم دانلود نامعتبر است.");
        File parent = output.getAbsoluteFile().getParentFile();
        if (!parent.exists() && !parent.mkdirs()) throw new IllegalStateException("ساخت پوشهٔ دانلود ناموفق بود.");
        HttpURLConnection c = openConnection(url, true);
        boolean ok = false;
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(output)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[65536];
            long total = 0;
            int n;
            while ((n = in.read(buffer)) != -1) {
                total += n;
                if (total > expectedSize || total > max) throw new SecurityException("حجم فایل از مقدار اعلام‌شده بیشتر است.");
                digest.update(buffer, 0, n);
                out.write(buffer, 0, n);
                report(progress, "downloading", method, total, expectedSize);
            }
            if (total != expectedSize || !hex(digest.digest()).equals(expectedHash)) {
                throw new SecurityException("بررسی صحت فایل دانلودشده ناموفق بود.");
            }
            ok = true;
        } finally {
            c.disconnect();
            if (!ok) { //noinspection ResultOfMethodCallIgnored
                output.delete();
            }
        }
    }

    private static void report(ProgressListener listener, String stage, String method, long downloaded, long total) {
        if (listener == null) return;
        listener.onProgress(stage, method, Math.max(0, downloaded), Math.max(0, total));
    }

    private static void validateApk(Context context, File apk, long expectedCode, String expectedName, PackageInfo installed) throws Exception {
        PackageManager pm = context.getPackageManager();
        PackageInfo candidate = pm.getPackageArchiveInfo(apk.getAbsolutePath(),
            Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
        if (candidate == null || !PACKAGE_NAME.equals(candidate.packageName) ||
            PackageInfoCompat.getLongVersionCode(candidate) != expectedCode ||
            !expectedName.equals(candidate.versionName)) {
            throw new SecurityException("مشخصات APK بازسازی‌شده معتبر نیست.");
        }
        Signature[] installedSigners = signers(installed);
        Signature[] candidateSigners = signers(candidate);
        if (installedSigners.length == 0 || candidateSigners.length == 0 ||
            !sameSigners(installedSigners, candidateSigners)) {
            throw new SecurityException("امضای APK با برنامهٔ نصب‌شده یکسان نیست.");
        }
    }

    private static PackageInfo getPackageInfo(PackageManager pm, String name) throws Exception {
        return pm.getPackageInfo(name, Build.VERSION.SDK_INT >= 28
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
    }

    private static Signature[] signers(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= 28 && info.signingInfo != null) {
            return info.signingInfo.getApkContentsSigners();
        }
        return info.signatures == null ? new Signature[0] : info.signatures;
    }

    private static boolean sameSigners(Signature[] a, Signature[] b) throws Exception {
        if (a.length != b.length) return false;
        java.util.ArrayList<String> left = new java.util.ArrayList<>();
        java.util.ArrayList<String> right = new java.util.ArrayList<>();
        for (Signature s : a) left.add(hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray())));
        for (Signature s : b) right.add(hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray())));
        java.util.Collections.sort(left);
        java.util.Collections.sort(right);
        return left.equals(right);
    }

    private static void copyFile(File from, File to) throws Exception {
        try (InputStream in = new FileInputStream(from); OutputStream out = new FileOutputStream(to)) {
            byte[] b = new byte[65536]; int n;
            while ((n = in.read(b)) != -1) out.write(b, 0, n);
            out.flush();
        }
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] b = new byte[65536]; int n;
            while ((n = in.read(b)) != -1) md.update(b, 0, n);
        }
        return hex(md.digest());
    }

    private static String requireHash(String value) {
        if (value == null || !value.matches("(?i)^[a-f0-9]{64}$")) throw new IllegalArgumentException("SHA-256 نامعتبر است.");
        return value.toLowerCase(Locale.ROOT);
    }

    private static String hex(byte[] bytes) {
        StringBuilder s = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) s.append(String.format(Locale.ROOT, "%02x", b));
        return s.toString();
    }
}
