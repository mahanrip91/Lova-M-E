package app.mande.chat;

import android.net.Uri;
import java.util.Locale;

/** Shared update constants and validation (mirrors src/lib/update-manifest.ts). */
final class UpdateConfig {
    static final String MANIFEST_URL =
        "https://raw.githubusercontent.com/mahanrip91/Lova-M-E/main/public/update.json";
    static final String MANIFEST_SIGNATURE_URL = MANIFEST_URL + ".sig";
    static final String UPDATE_PUBLIC_KEY =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAESVeR+iHU6hCpqyngwD9D4wMQVw9m" +
        "nQxYlundyolIxtcxO+K7slqOzS4zuZlEEwRPQb+fr4eTDqx6ivhFz58uZg==";
    static final String CHANNEL_ID = "app_updates";
    static final int NOTIFICATION_ID = 4105;
    static final String DEEP_LINK = "app.mande.chat://settings/updates";
    static final String PREFS = "mande_updates";
    static final String PREF_LAST_NOTIFIED = "last_notified_version_code";

    private UpdateConfig() {}

    static boolean isAllowedApkUrl(String value) {
        if (value == null) return false;
        Uri uri = Uri.parse(value);
        String path = uri.getPath();
        if (!"https".equals(uri.getScheme()) || !"github.com".equals(uri.getHost())) return false;
        if (uri.getPort() != -1 || uri.getUserInfo() != null || path == null || path.contains("..")) return false;
        if (!path.toLowerCase(Locale.ROOT).endsWith(".apk")) return false;
        return path.startsWith("/mahanrip91/Lova-M-E/releases/download/")
            || path.startsWith("/mahanrip91/Lova-M-E/releases/latest/download/");
    }
}
