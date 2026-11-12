package app.mande.chat;

import android.Manifest;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(
    name = "NativeTools",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NativeToolsPlugin extends Plugin {
    private static final String APK_NAME = "M-AND-E-update.apk";
    private BroadcastReceiver downloadReceiver;
    private long activeDownloadId = -1;
    private PluginCall pendingDownloadCall;

    // ---------- media permissions (unchanged behaviour) ----------
    private String state(String alias) {
        PermissionState s = getPermissionState(alias);
        return s == null ? "prompt" : s.toString().toLowerCase(Locale.ROOT);
    }

    private JSObject mediaState() {
        JSObject r = new JSObject();
        r.put("camera", state("camera"));
        r.put("microphone", state("microphone"));
        return r;
    }

    @PluginMethod
    public void getMediaPermissions(PluginCall call) { call.resolve(mediaState()); }

    @PluginMethod
    public void requestMediaPermissions(PluginCall call) {
        requestPermissionForAliases(new String[] { "camera", "microphone" }, call, "mediaPermsCallback");
    }

    @PermissionCallback
    private void mediaPermsCallback(PluginCall call) { call.resolve(mediaState()); }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("version", info.versionName);
            r.put("versionCode", PackageInfoCompat.getLongVersionCode(info));
        } catch (Exception e) {
            r.put("version", "");
        }
        r.put("platform", "android");
        call.resolve(r);
    }

    // ---------- update notifications ----------
    private JSObject notificationState() {
        JSObject r = new JSObject();
        String perm = Build.VERSION.SDK_INT >= 33 ? state("notifications") : "granted";
        r.put("permission", perm);
        r.put("enabled", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        return r;
    }

    @PluginMethod
    public void getUpdateNotificationStatus(PluginCall call) { call.resolve(notificationState()); }

    /** Must only be called from a user action in Settings; the background worker never prompts. */
    @PluginMethod
    public void requestUpdateNotificationPermission(PluginCall call) {
        UpdateCheckWorker.ensureChannel(getContext());
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(notificationState());
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermCallback");
    }

    @PermissionCallback
    private void notificationPermCallback(PluginCall call) { call.resolve(notificationState()); }

    // ---------- APK download + install ----------
    /**
     * Downloads the APK, verifies SHA-256 when provided, then opens the system installer.
     * Resolves {status:"installer_opened", verified} — installation itself still requires the
     * user's confirmation in Android's installer and is NOT reported as complete here.
     */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String sha256 = call.getString("sha256");
        if (!UpdateConfig.isAllowedApkUrl(url)) { call.reject("نشانی فایل نصب مجاز نیست.", "INVALID_URL"); return; }
        if (sha256 != null && !sha256.matches("(?i)^[a-f0-9]{64}$")) { call.reject("چکیدهٔ SHA-256 نامعتبر است.", "INVALID_SHA"); return; }
        if (pendingDownloadCall != null) { call.reject("دانلود دیگری در جریان است.", "BUSY"); return; }

        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.reject("اجازهٔ نصب از این برنامه را فعال کن و دوباره امتحان کن.", "INSTALL_PERMISSION_REQUIRED");
            return;
        }

        File dir = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates");
        if (!dir.exists() && !dir.mkdirs()) { call.reject("ساخت پوشهٔ دانلود ممکن نشد.", "STORAGE"); return; }
        File apk = new File(dir, APK_NAME);
        if (apk.exists()) //noinspection ResultOfMethodCallIgnored
            apk.delete(); // only our own previous update APK

        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
            .setTitle("M AND E")
            .setDescription("دریافت نسخهٔ جدید")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            .setDestinationUri(Uri.fromFile(apk));

        call.setKeepAlive(true);
        pendingDownloadCall = call;
        // Register BEFORE enqueue so a fast completion cannot be missed.
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != activeDownloadId) return;
                onDownloadFinished(dm, id, apk, sha256);
            }
        };
        ContextCompat.registerReceiver(ctx, downloadReceiver,
            new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
        try {
            activeDownloadId = dm.enqueue(req);
        } catch (Exception e) {
            finish(null, "شروع دانلود ممکن نشد.", "DOWNLOAD_START");
        }
    }

    /** Signed-manifest updater: BSDIFF40 first, verified full APK fallback. */
    @PluginMethod
    public void downloadSmartAndInstall(PluginCall call) {
        if (pendingDownloadCall != null) {
            call.reject("دانلود دیگری در جریان است.", "BUSY");
            return;
        }
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.reject("اجازهٔ نصب از این برنامه را فعال کن و دوباره امتحان کن.", "INSTALL_PERMISSION_REQUIRED");
            return;
        }

        call.setKeepAlive(true);
        pendingDownloadCall = call;
        new Thread(() -> {
            try {
                UpdateInstaller.Result prepared = UpdateInstaller.prepare(ctx);
                getActivity().runOnUiThread(() -> openInstaller(prepared.apk, true, prepared.method));
            } catch (Exception e) {
                getActivity().runOnUiThread(() ->
                    finish(null, e.getMessage() == null ? "به‌روزرسانی ناموفق بود." : e.getMessage(), "UPDATE_FAILED"));
            }
        }, "MAE-Smart-Update").start();
    }

    private void onDownloadFinished(DownloadManager dm, long id, File apk, String sha256) {
        int status = -1;
        int reason = 0;
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (c != null && c.moveToFirst()) {
                status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
            }
        }
        if (status != DownloadManager.STATUS_SUCCESSFUL) {
            finish(null, "دانلود ناموفق بود (کد " + reason + ").", "DOWNLOAD_FAILED");
            return;
        }
        // Hashing can take a moment for a large APK; keep it off the main thread.
        new Thread(() -> {
            boolean verified = false;
            if (sha256 != null) {
                String actual = sha256Of(apk);
                if (actual == null || !actual.equalsIgnoreCase(sha256)) {
                    //noinspection ResultOfMethodCallIgnored
                    apk.delete();
                    finish(null, "چکیدهٔ فایل دانلودشده با نسخهٔ منتشرشده یکی نیست؛ نصب انجام نشد.", "CHECKSUM_MISMATCH");
                    return;
                }
                verified = true;
            }
            final boolean v = verified;
            getActivity().runOnUiThread(() -> openInstaller(apk, v));
        }).start();
    }

    private void openInstaller(File apk, boolean verified) {
        openInstaller(apk, verified, "full");
    }

    private void openInstaller(File apk, boolean verified, String method) {
        try {
            Context ctx = getContext();
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            JSObject r = new JSObject();
            r.put("status", "installer_opened");
            r.put("verified", verified);
            r.put("method", method);
            finish(r, null, null);
        } catch (Exception e) {
            finish(null, "باز کردن نصب‌کنندهٔ اندروید ممکن نشد.", "INSTALLER");
        }
    }

    private static String sha256Of(File f) {
        try (InputStream in = new FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) != -1) md.update(buf, 0, n);
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private synchronized void finish(JSObject result, String error, String code) {
        PluginCall call = pendingDownloadCall;
        pendingDownloadCall = null;
        activeDownloadId = -1;
        if (downloadReceiver != null) {
            try { getContext().unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
            downloadReceiver = null;
        }
        if (call == null) return;
        if (error != null) call.reject(error, code); else call.resolve(result);
        call.setKeepAlive(false);
        getBridge().releaseCall(call);
    }

    @Override
    protected void handleOnDestroy() {
        if (downloadReceiver != null) {
            try { getContext().unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
            downloadReceiver = null;
        }
    }
}
