package app.mande.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import java.io.File;

public class MainActivity extends BridgeActivity {
    private static boolean otaLaunchHandled = false;

    private static final String STATE_PREFS = "mae_ota_state";
    private static final String ACTIVE = "active_bundle";
    private static final String PREVIOUS = "previous_bundle";
    private static final String PENDING = "pending_confirmation";
    private static final String ATTEMPTS = "launch_attempts";

    private static final String WEB_PREFS = "CapWebViewSettings";
    private static final String WEB_PATH = "serverBasePath";

    private static void recoverPendingOta(Context context) {
        SharedPreferences state =
            context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE);

        if (!state.getBoolean(PENDING, false)) return;

        int attempts = state.getInt(ATTEMPTS, 0);

        // Give the candidate one complete cold launch before rolling it back.
        if (attempts < 1) {
            state.edit().putInt(ATTEMPTS, attempts + 1).commit();
            return;
        }

        String previous = state.getString(PREVIOUS, "");
        String safePath = null;

        try {
            if (previous != null && previous.matches("[a-zA-Z0-9._-]{1,80}")) {
                File root = new File(
                    context.getFilesDir(), "mae-ota/bundles"
                ).getCanonicalFile();

                File bundle = new File(root, previous).getCanonicalFile();
                File index = new File(bundle, "index.html").getCanonicalFile();

                if (bundle.getPath().startsWith(root.getPath() + File.separator)
                    && bundle.isDirectory()
                    && index.isFile()
                    && index.getPath().startsWith(bundle.getPath() + File.separator)) {
                    safePath = bundle.getCanonicalPath();
                }
            }
        } catch (Exception ignored) {}

        SharedPreferences webPrefs =
            context.getSharedPreferences(WEB_PREFS, Context.MODE_PRIVATE);

        boolean pathSaved;
        if (safePath != null) {
            pathSaved = webPrefs.edit().putString(WEB_PATH, safePath).commit();
        } else {
            pathSaved = webPrefs.edit().remove(WEB_PATH).commit();
        }

        if (!pathSaved) {
            // Fail closed: use the APK's bundled web assets.
            webPrefs.edit().remove(WEB_PATH).commit();
            safePath = null;
        }

        SharedPreferences.Editor editor = state.edit()
            .putBoolean(PENDING, false)
            .putInt(ATTEMPTS, 0)
            .remove(PREVIOUS);

        if (safePath != null) {
            editor.putString(ACTIVE, previous);
        } else {
            editor.remove(ACTIVE);
        }

        editor.commit();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Recover before Capacitor reads its persisted WebView asset path.
        if (!otaLaunchHandled) {
            otaLaunchHandled = true;
            recoverPendingOta(getApplicationContext());
        }

        registerPlugin(NativeToolsPlugin.class);
        registerPlugin(OtaUpdaterPlugin.class);
        super.onCreate(savedInstanceState);

        UpdateScheduler.schedule(getApplicationContext());
    }
}
