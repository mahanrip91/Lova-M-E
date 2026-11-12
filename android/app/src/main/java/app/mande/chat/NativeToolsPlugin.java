package app.mande.chat;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
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

    @PluginMethod
    public void showTestNotification(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 33 &&
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            call.reject("ابتدا اجازهٔ اعلان را فعال کن.", "NOTIFICATION_PERMISSION");
            return;
        }
        NotificationManagerCompat compat = NotificationManagerCompat.from(ctx);
        if (!compat.areNotificationsEnabled()) {
            call.reject("اعلان‌های برنامه در تنظیمات اندروید خاموش هستند.", "NOTIFICATIONS_DISABLED");
            return;
        }
        final String channelId = "mae_test";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = new NotificationChannel(
                channelId, "اعلان آزمایشی M AND E", NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("اعلان آزمایشی برای بررسی درست‌بودن اعلان‌های برنامه");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
        android.app.Notification notification = new NotificationCompat.Builder(ctx, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("M AND E · اعلان آزمایشی")
            .setContentText("عالی! اعلان‌های برنامه روی این دستگاه نمایش داده می‌شوند. 🔔")
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build();
        compat.notify(140513, notification);
        JSObject result = new JSObject();
        result.put("sent", true);
        call.resolve(result);
    }

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

    // ---------- Signed in-app APK updater ----------
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
                UpdateInstaller.Result prepared = UpdateInstaller.prepare(ctx, (stage, method, downloaded, total) ->
                    emitUpdateProgress(stage, method, downloaded, total));
                getActivity().runOnUiThread(() -> openInstaller(prepared.apk, true, prepared.method, prepared.fallbackReason));
            } catch (Exception e) {
                getActivity().runOnUiThread(() ->
                    finish(null, e.getMessage() == null ? "به‌روزرسانی ناموفق بود." : e.getMessage(), "UPDATE_FAILED"));
            }
        }, "MAE-Smart-Update").start();
    }

    private void emitUpdateProgress(String stage, String method, long downloaded, long total) {
        JSObject event = new JSObject();
        event.put("stage", stage);
        event.put("method", method);
        event.put("downloadedBytes", downloaded);
        event.put("totalBytes", total);
        event.put("percent", total > 0 ? Math.min(100, Math.max(0, (int) ((downloaded * 100L) / total))) : 0);
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> notifyListeners("updateProgress", event));
    }

    private void openInstaller(File apk, boolean verified, String method, String fallbackReason) {
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
            if (fallbackReason != null && !fallbackReason.trim().isEmpty()) {
                r.put("fallbackReason", fallbackReason);
            }
            finish(r, null, null);
        } catch (Exception e) {
            finish(null, "باز کردن نصب‌کنندهٔ اندروید ممکن نشد.", "INSTALLER");
        }
    }

    private synchronized void finish(JSObject result, String error, String code) {
        PluginCall call = pendingDownloadCall;
        pendingDownloadCall = null;
        if (call == null) return;
        if (error != null) call.reject(error, code); else call.resolve(result);
        call.setKeepAlive(false);
        getBridge().releaseCall(call);
    }


}
