package app.mande.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;

import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "OtaUpdater")
public class OtaUpdaterPlugin extends Plugin {

    private static final String STATE_PREFS = "mae_ota_state";
    private static final String ACTIVE = "active_bundle";
    private static final String PREVIOUS = "previous_bundle";
    private static final String PENDING = "pending_confirmation";
    private static final String ATTEMPTS = "launch_attempts";

    private static final String WEB_PREFS = "CapWebViewSettings";
    private static final String WEB_PATH = "serverBasePath";

    private static final int OTA_NATIVE_API = 1;
    private static final int MAX_FILES = 2000;
    private static final long MAX_FILE_SIZE = 25L * 1024 * 1024;
    private static final long MAX_TOTAL_SIZE = 200L * 1024 * 1024;
    private static final int MAX_MANIFEST_SIZE = 1024 * 1024;

    private static final String PUBLIC_KEY =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAESVeR+iHU6hCpqyngwD9D4wMQVw9m" +
        "nQxYlundyolIxtcxO+K7slqOzS4zuZlEEwRPQb+fr4eTDqx6ivhFz58uZg==";

    private SharedPreferences state() {
        return getContext().getSharedPreferences(
            STATE_PREFS, Context.MODE_PRIVATE
        );
    }

    private SharedPreferences webPrefs() {
        return getContext().getSharedPreferences(
            WEB_PREFS, Context.MODE_PRIVATE
        );
    }

    private File bundlesRoot() throws Exception {
        File root = new File(
            getContext().getFilesDir(), "mae-ota/bundles"
        ).getCanonicalFile();

        if (!root.exists() && !root.mkdirs()) {
            throw new IllegalStateException("ساخت پوشهٔ OTA ناموفق بود.");
        }
        return root;
    }

    private File bundleDirectory(String id) throws Exception {
        if (id == null || !id.matches("[a-zA-Z0-9._-]{1,80}")) {
            throw new IllegalArgumentException("شناسه نسخه نامعتبر است.");
        }

        File root = bundlesRoot();
        File bundle = new File(root, id).getCanonicalFile();

        if (!bundle.getPath().startsWith(root.getPath() + File.separator)) {
            throw new SecurityException("مسیر نسخه مجاز نیست.");
        }

        File index = new File(bundle, "index.html").getCanonicalFile();

        if (!bundle.isDirectory()
            || !index.isFile()
            || !index.getPath().startsWith(bundle.getPath() + File.separator)) {
            throw new IllegalStateException("نسخه کامل یا معتبر نیست.");
        }

        return bundle;
    }

    @PluginMethod
    public void confirmBundleReady(PluginCall call) {
        boolean saved = state().edit()
            .putBoolean(PENDING, false)
            .putInt(ATTEMPTS, 0)
            .commit();

        if (!saved) {
            call.reject("ثبت تأیید نسخه OTA ناموفق بود.");
            return;
        }

        call.resolve();
    }

    @PluginMethod
    public void getOtaStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("activeBundle", state().getString(ACTIVE, ""));
        result.put("previousBundle", state().getString(PREVIOUS, ""));
        result.put("storageReady", true);
        call.resolve(result);
    }

    @PluginMethod
    public void activateBundle(PluginCall call) {
        String id = call.getString("bundleId");

        try {
            String active = state().getString(ACTIVE, "");
            if (id != null && id.equals(active)) {
                call.reject("این نسخه هم‌اکنون فعال است.");
                return;
            }

            File bundle = bundleDirectory(id);
            String path = bundle.getCanonicalPath();
            String oldPath = webPrefs().getString(WEB_PATH, "");

            if (!state().edit()
                .putString(PREVIOUS, active)
                .putString(ACTIVE, id)
                .putBoolean(PENDING, true)
                .putInt(ATTEMPTS, 0)
                .commit()) {
                throw new IllegalStateException("ذخیره وضعیت نسخه ناموفق بود.");
            }

            try {
                if (!webPrefs().edit().putString(WEB_PATH, path).commit()) {
                    throw new IllegalStateException("ذخیره مسیر نسخه ناموفق بود.");
                }

                getBridge().setServerBasePath(path);
                call.resolve();
            } catch (Exception e) {
                if (oldPath == null || oldPath.isEmpty()) {
                    webPrefs().edit().remove(WEB_PATH).commit();
                } else {
                    webPrefs().edit().putString(WEB_PATH, oldPath).commit();
                }

                state().edit()
                    .putString(ACTIVE, active)
                    .putString(PREVIOUS, "")
                    .putBoolean(PENDING, false)
                    .putInt(ATTEMPTS, 0)
                    .commit();

                try {
                    if (oldPath == null || oldPath.isEmpty()) {
                        getBridge().setServerAssetPath("public");
                    } else {
                        getBridge().setServerBasePath(oldPath);
                    }
                } catch (Exception ignored) {}

                call.reject("فعال‌سازی نسخه انجام نشد: " + e.getMessage());
            }
        } catch (Exception e) {
            call.reject("نسخه OTA قابل فعال‌سازی نیست: " + e.getMessage());
        }
    }

    @PluginMethod
    public void rollbackOta(PluginCall call) {
        String previous = state().getString(PREVIOUS, "");

        try {
            if (previous == null || previous.isEmpty()) {
                resetToBuiltIn();
                call.resolve();
                return;
            }

            File bundle = bundleDirectory(previous);
            String path = bundle.getCanonicalPath();
            String current = state().getString(ACTIVE, "");
            String oldPath = webPrefs().getString(WEB_PATH, "");

            if (!webPrefs().edit().putString(WEB_PATH, path).commit()) {
                throw new IllegalStateException("ذخیره مسیر بازگشت ناموفق بود.");
            }

            boolean stateSaved = state().edit()
                .putString(ACTIVE, previous)
                .putString(PREVIOUS, current == null ? "" : current)
                .putBoolean(PENDING, false)
                .putInt(ATTEMPTS, 0)
                .commit();

            if (!stateSaved) {
                if (oldPath == null || oldPath.isEmpty()) {
                    webPrefs().edit().remove(WEB_PATH).commit();
                } else {
                    webPrefs().edit().putString(WEB_PATH, oldPath).commit();
                }
                throw new IllegalStateException("ذخیره وضعیت بازگشت ناموفق بود.");
            }

            getBridge().setServerBasePath(path);
            call.resolve();
        } catch (Exception e) {
            call.reject("بازگشت به نسخه قبلی انجام نشد: " + e.getMessage());
        }
    }

    @PluginMethod
    public void resetToBuiltIn(PluginCall call) {
        try {
            resetToBuiltIn();
            call.resolve();
        } catch (Exception e) {
            call.reject("بازگشت به نسخه داخلی برنامه ناموفق بود.");
        }
    }

    private void resetToBuiltIn() {
        String oldPath = webPrefs().getString(WEB_PATH, "");

        if (!webPrefs().edit().remove(WEB_PATH).commit()) {
            throw new IllegalStateException("حذف مسیر OTA ناموفق بود.");
        }

        boolean stateSaved = state().edit()
            .remove(ACTIVE)
            .remove(PREVIOUS)
            .putBoolean(PENDING, false)
            .putInt(ATTEMPTS, 0)
            .commit();

        if (!stateSaved) {
            if (oldPath != null && !oldPath.isEmpty()) {
                webPrefs().edit().putString(WEB_PATH, oldPath).commit();
            }
            throw new IllegalStateException("پاک‌سازی وضعیت OTA ناموفق بود.");
        }

        getBridge().setServerAssetPath("public");
    }

    // Downloads, verifies and stages a complete OTA bundle.
    // It does NOT activate the bundle automatically.
    @PluginMethod
    public void downloadAndVerifyBundle(PluginCall call) {
        String manifestUrl = call.getString("manifestUrl");
        String signatureUrl = call.getString("signatureUrl");

        if (!isHttps(manifestUrl) || !isHttps(signatureUrl)) {
            call.reject("آدرس مانیفست و امضا باید HTTPS باشند.");
            return;
        }

        new Thread(() -> {
            File staging = null;

            try {
                byte[] manifestBytes = downloadBytes(
                    manifestUrl, MAX_MANIFEST_SIZE
                );

                byte[] signatureBytes = downloadBytes(
                    signatureUrl, 4096
                );

                String signatureText = new String(
                    signatureBytes, StandardCharsets.UTF_8
                ).trim();

                verifyManifestSignature(manifestBytes, signatureText);

                JSONObject manifest = new JSONObject(
                    new String(manifestBytes, StandardCharsets.UTF_8)
                );

                if (manifest.optInt("schema", -1) != 1) {
                    throw new SecurityException("نسخه ساختار مانیفست پشتیبانی نمی‌شود.");
                }

                String bundleId = manifest.getString("bundleId");
                if (!bundleId.matches("[a-zA-Z0-9._-]{1,80}")) {
                    throw new SecurityException("شناسه نسخه نامعتبر است.");
                }

                if (manifest.optInt("nativeApiLevel", -1) != OTA_NATIVE_API) {
                    throw new SecurityException("این نسخه با API بومی برنامه سازگار نیست.");
                }

                long minNative = manifest.optLong("minNativeVersionCode", -1);
                PackageInfo packageInfo = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
                long installedCode = PackageInfoCompat.getLongVersionCode(packageInfo);

                if (minNative < 0 || installedCode < minNative) {
                    throw new SecurityException("نسخه اندرویدی برنامه برای این OTA قدیمی است.");
                }

                if (!"index.html".equals(manifest.optString("entry"))) {
                    throw new SecurityException("فایل ورودی مانیفست نامعتبر است.");
                }

                JSONArray files = manifest.getJSONArray("files");
                if (files.length() < 1 || files.length() > MAX_FILES) {
                    throw new SecurityException("تعداد فایل‌های OTA نامعتبر است.");
                }

                long declaredTotal = manifest.getLong("totalSize");
                if (declaredTotal < 1 || declaredTotal > MAX_TOTAL_SIZE) {
                    throw new SecurityException("حجم کل OTA خارج از محدوده مجاز است.");
                }

                Set<String> paths = new HashSet<>();
                long calculatedTotal = 0;
                boolean hasIndex = false;

                for (int i = 0; i < files.length(); i++) {
                    JSONObject item = files.getJSONObject(i);
                    String path = item.getString("path");
                    String hash = item.getString("sha256").toLowerCase(Locale.ROOT);
                    long size = item.getLong("size");
                    String url = item.getString("url");

                    validateRelativePath(path);

                    if (!paths.add(path)) {
                        throw new SecurityException("مسیر تکراری در مانیفست: " + path);
                    }

                    if (!hash.matches("[a-f0-9]{64}")) {
                        throw new SecurityException("هش نامعتبر برای " + path);
                    }

                    if (size < 0 || size > MAX_FILE_SIZE) {
                        throw new SecurityException("اندازه فایل خارج از محدوده است: " + path);
                    }

                    if (!isHttps(url)) {
                        throw new SecurityException("آدرس فایل باید HTTPS باشد.");
                    }

                    calculatedTotal += size;
                    if (calculatedTotal > MAX_TOTAL_SIZE) {
                        throw new SecurityException("حجم کل فایل‌ها بیش از حد مجاز است.");
                    }

                    if ("index.html".equals(path)) {
                        hasIndex = true;
                    }
                }

                if (!hasIndex || calculatedTotal != declaredTotal) {
                    throw new SecurityException("مجموع حجم یا فایل ورودی مانیفست نادرست است.");
                }

                File root = bundlesRoot();
                File target = new File(root, bundleId).getCanonicalFile();

                if (!target.getPath().startsWith(root.getPath() + File.separator)
                    || target.exists()) {
                    throw new IllegalStateException("این شناسه نسخه قبلاً استفاده شده است.");
                }

                String activeId = state().getString(ACTIVE, "");
                File activeDir = null;

                if (activeId != null && !activeId.isEmpty()) {
                    try {
                        activeDir = bundleDirectory(activeId);
                    } catch (Exception ignored) {
                        activeDir = null;
                    }
                }

                staging = new File(
                    root, ".staging-" + UUID.randomUUID()
                ).getCanonicalFile();

                if (!staging.mkdirs()) {
                    throw new IllegalStateException("ساخت پوشه موقت ناموفق بود.");
                }

                long downloaded = 0;
                long reused = 0;

                for (int i = 0; i < files.length(); i++) {
                    JSONObject item = files.getJSONObject(i);

                    String relative = item.getString("path");
                    String expectedHash = item.getString("sha256")
                        .toLowerCase(Locale.ROOT);
                    long expectedSize = item.getLong("size");
                    String url = item.getString("url");

                    File output = resolveInside(staging, relative);
                    File parent = output.getParentFile();

                    if (parent == null || (!parent.exists() && !parent.mkdirs())) {
                        throw new IllegalStateException("ساخت مسیر فایل ناموفق بود.");
                    }

                    boolean copied = false;

                    if (activeDir != null) {
                        File oldFile = resolveInside(activeDir, relative);

                        if (oldFile.isFile()
                            && oldFile.length() == expectedSize
                            && expectedHash.equals(sha256(oldFile))) {
                            copyFile(oldFile, output);
                            copied = true;
                            reused += expectedSize;
                        }
                    }

                    if (!copied) {
                        downloadFile(url, output, expectedSize, expectedHash);
                        downloaded += expectedSize;
                    }

                    if (!output.isFile()
                        || output.length() != expectedSize
                        || !expectedHash.equals(sha256(output))) {
                        throw new SecurityException("تأیید نهایی فایل ناموفق بود: " + relative);
                    }
                }

                File index = new File(staging, "index.html");
                if (!index.isFile()) {
                    throw new SecurityException("فایل index.html وجود ندارد.");
                }

                if (!staging.renameTo(target)) {
                    throw new IllegalStateException("ثبت اتمیک نسخه جدید ناموفق بود.");
                }

                staging = null;

                JSObject result = new JSObject();
                result.put("status", "verified");
                result.put("bundleId", bundleId);
                result.put("totalSize", declaredTotal);
                result.put("downloadedBytes", downloaded);
                result.put("reusedBytes", reused);
                result.put("fileCount", files.length());
                result.put("releaseNotes", manifest.optString("releaseNotes", ""));
                call.resolve(result);

            } catch (Exception e) {
                if (staging != null && staging.exists()) {
                    deleteTree(staging);
                }
                call.reject("دریافت یا اعتبارسنجی OTA ناموفق بود: " + e.getMessage());
            }
        }, "MAE-OTA-Download").start();
    }

    private void verifyManifestSignature(byte[] data, String signatureText)
        throws Exception {

        byte[] signatureBytes = android.util.Base64.decode(
            signatureText,
            android.util.Base64.DEFAULT
        );

        byte[] keyBytes = android.util.Base64.decode(
            PUBLIC_KEY,
            android.util.Base64.DEFAULT
        );

        PublicKey publicKey = KeyFactory.getInstance("EC")
            .generatePublic(new X509EncodedKeySpec(keyBytes));

        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(publicKey);
        verifier.update(data);

        if (!verifier.verify(signatureBytes)) {
            throw new SecurityException("امضای دیجیتال مانیفست معتبر نیست.");
        }
    }

    private byte[] downloadBytes(String address, int maxBytes) throws Exception {
        HttpURLConnection connection = openHttps(address);

        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("خطای دریافت فایل: HTTP " + status);
            }

            try (InputStream in = new BufferedInputStream(connection.getInputStream());
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {

                byte[] buffer = new byte[8192];
                int count;
                int total = 0;

                while ((count = in.read(buffer)) != -1) {
                    total += count;
                    if (total > maxBytes) {
                        throw new SecurityException("حجم پاسخ بیش از حد مجاز است.");
                    }
                    out.write(buffer, 0, count);
                }

                return out.toByteArray();
            }
        } finally {
            connection.disconnect();
        }
    }

    private void downloadFile(
        String address,
        File output,
        long expectedSize,
        String expectedHash
    ) throws Exception {

        HttpURLConnection connection = openHttps(address);

        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("خطای دریافت فایل: HTTP " + status);
            }

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long total = 0;

            try (InputStream in = new BufferedInputStream(connection.getInputStream());
                 OutputStream out = new BufferedOutputStream(new FileOutputStream(output))) {

                byte[] buffer = new byte[16384];
                int count;

                while ((count = in.read(buffer)) != -1) {
                    total += count;

                    if (total > expectedSize || total > MAX_FILE_SIZE) {
                        throw new SecurityException("حجم واقعی فایل بیشتر از مقدار اعلام‌شده است.");
                    }

                    digest.update(buffer, 0, count);
                    out.write(buffer, 0, count);
                }
            }

            if (total != expectedSize || !expectedHash.equals(toHex(digest.digest()))) {
                throw new SecurityException("هش یا اندازه فایل مطابقت ندارد.");
            }
        } catch (Exception e) {
            output.delete();
            throw e;
        } finally {
            connection.disconnect();
        }
    }

    private HttpURLConnection openHttps(String address) throws Exception {
        String currentAddress = address;

        for (int redirects = 0; redirects <= 5; redirects++) {
            if (!isHttps(currentAddress)) {
                throw new SecurityException("مقصد دانلود باید HTTPS معتبر باشد.");
            }

            URL currentUrl = new URL(currentAddress);
            HttpURLConnection connection =
                (HttpURLConnection) currentUrl.openConnection();

            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "M-AND-E-OTA/1");

            int status;
            try {
                status = connection.getResponseCode();
            } catch (Exception e) {
                connection.disconnect();
                throw e;
            }

            boolean redirect = status == 301 || status == 302
                || status == 303 || status == 307 || status == 308;

            if (!redirect) {
                return connection;
            }

            String location = connection.getHeaderField("Location");
            connection.disconnect();

            if (redirects == 5 || location == null || location.trim().isEmpty()) {
                throw new SecurityException("تعداد یا مقصد ریدایرکت مجاز نیست.");
            }

            URL nextUrl = new URL(currentUrl, location);
            currentAddress = nextUrl.toExternalForm();

            if (!isHttps(currentAddress)) {
                throw new SecurityException("ریدایرکت به مقصد غیر HTTPS مسدود شد.");
            }
        }

        throw new SecurityException("ریدایرکت بیش از حد مجاز است.");
    }

    private boolean isHttps(String address) {
        if (address == null || address.length() > 4096) return false;

        try {
            URL parsed = new URL(address);
            return "https".equalsIgnoreCase(parsed.getProtocol())
                && parsed.getHost() != null
                && !parsed.getHost().isEmpty()
                && parsed.getUserInfo() == null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void validateRelativePath(String path) throws Exception {
        if (path == null || path.isEmpty()
            || path.startsWith("/")
            || path.contains("\\")
            || path.contains(":")
            || path.contains("\u0000")
            || path.length() > 240) {
            throw new SecurityException("مسیر فایل نامعتبر است.");
        }

        String[] parts = path.split("/", -1);
        for (String part : parts) {
            if (part.isEmpty() || ".".equals(part) || "..".equals(part)) {
                throw new SecurityException("مسیر فایل مجاز نیست.");
            }
        }
    }

    private File resolveInside(File root, String relative) throws Exception {
        validateRelativePath(relative);

        File canonicalRoot = root.getCanonicalFile();
        File result = new File(canonicalRoot, relative).getCanonicalFile();

        if (!result.getPath().startsWith(
            canonicalRoot.getPath() + File.separator
        )) {
            throw new SecurityException("خروج از مسیر مجاز فایل.");
        }

        return result;
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");

        try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[16384];
            int count;

            while ((count = in.read(buffer)) != -1) {
                digest.update(buffer, 0, count);
            }
        }

        return toHex(digest.digest());
    }

    private String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder();

        for (byte b : bytes) {
            result.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        }

        return result.toString();
    }

    private void copyFile(File source, File destination) throws Exception {
        try (InputStream in = new BufferedInputStream(new FileInputStream(source));
             OutputStream out = new BufferedOutputStream(new FileOutputStream(destination))) {

            byte[] buffer = new byte[16384];
            int count;

            while ((count = in.read(buffer)) != -1) {
                out.write(buffer, 0, count);
            }
        }
    }

    private void deleteTree(File file) {
        if (file == null || !file.exists()) return;

        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteTree(child);
            }
        }

        file.delete();
    }
}
