package app.mande.chat;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.pm.PackageInfoCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import org.json.JSONObject;

/** Background manifest check. Never prompts for permissions; silently skips if notifications are off. */
public class UpdateCheckWorker extends Worker {
    public UpdateCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        try {
            JSONObject manifest = fetchManifest();
            if (manifest == null) return Result.retry();
            long remoteCode = manifest.optLong("versionCode", -1);
            String type = manifest.optString("updateType", "apk");
            String apkUrl = manifest.optString("apkUrl", "");
            if (remoteCode <= 0 || !"apk".equals(type) || !UpdateConfig.isAllowedApkUrl(apkUrl)) return Result.success();

            long installed = installedVersionCode(ctx);
            if (remoteCode <= installed) return Result.success();

            SharedPreferences prefs = ctx.getSharedPreferences(UpdateConfig.PREFS, Context.MODE_PRIVATE);
            if (prefs.getLong(UpdateConfig.PREF_LAST_NOTIFIED, -1) >= remoteCode) return Result.success();

            if (notify(ctx, manifest.optString("versionName", String.valueOf(remoteCode)))) {
                prefs.edit().putLong(UpdateConfig.PREF_LAST_NOTIFIED, remoteCode).apply();
            }
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    static long installedVersionCode(Context ctx) throws PackageManager.NameNotFoundException {
        PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
        return PackageInfoCompat.getLongVersionCode(info);
    }

    private JSONObject fetchManifest() throws Exception {
        byte[] manifestBytes = fetchSmallFile(UpdateConfig.MANIFEST_URL, 64 * 1024);
        byte[] signatureBytes = fetchSmallFile(UpdateConfig.MANIFEST_SIGNATURE_URL, 4096);
        if (manifestBytes == null || signatureBytes == null) return null;

        byte[] keyBytes = android.util.Base64.decode(UpdateConfig.UPDATE_PUBLIC_KEY, android.util.Base64.DEFAULT);
        PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(keyBytes));
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(key);
        verifier.update(manifestBytes);
        String signatureText = new String(signatureBytes, StandardCharsets.UTF_8).trim();
        if (!verifier.verify(android.util.Base64.decode(signatureText, android.util.Base64.DEFAULT))) return null;
        return new JSONObject(new String(manifestBytes, StandardCharsets.UTF_8));
    }

    private byte[] fetchSmallFile(String address, int maxBytes) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(address + "?t=" + System.currentTimeMillis()).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setUseCaches(false);
        conn.setInstanceFollowRedirects(false);
        try {
            if (conn.getResponseCode() != 200) return null;
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) != -1) {
                    if (out.size() + n > maxBytes) return null;
                    out.write(buf, 0, n);
                }
                return out.toByteArray();
            }
        } finally {
            conn.disconnect();
        }
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                UpdateConfig.CHANNEL_ID, "به‌روزرسانی برنامه", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("اطلاع از نسخهٔ جدید M AND E");
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private boolean notify(Context ctx, String versionName) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManagerCompat nmc = NotificationManagerCompat.from(ctx);
        if (!nmc.areNotificationsEnabled()) return false;
        ensureChannel(ctx);

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(UpdateConfig.DEEP_LINK), ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, UpdateConfig.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("نسخهٔ جدید M AND E")
            .setContentText("نسخهٔ " + versionName + " آماده است. برای نصب بزن.")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pi)
            .setAutoCancel(true);
        try {
            nmc.notify(UpdateConfig.NOTIFICATION_ID, b.build());
            return true;
        } catch (SecurityException e) {
            return false;
        }
    }
}
