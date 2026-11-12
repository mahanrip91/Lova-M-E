import fs from "node:fs";

const pluginPath = "android/app/src/main/java/app/mande/chat/OtaUpdaterPlugin.java";
let p = fs.readFileSync(pluginPath, "utf8");

function once(oldText, newText, label) {
  const count = p.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  p = p.replace(oldText, newText);
}

function range(start, end, replacement, label) {
  const a = p.indexOf(start);
  const b = p.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`${label}: boundary not found`);
  p = p.slice(0, a) + replacement + p.slice(b);
}

once(
  '    private static final String PREVIOUS = "previous_bundle";',
  `    private static final String PREVIOUS = "previous_bundle";
    private static final String PENDING = "pending_confirmation";
    private static final String ATTEMPTS = "launch_attempts";`,
  "OTA state constants"
);

const confirmMethod = `    @PluginMethod
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

`;

once(
  "    @PluginMethod\n    public void getOtaStatus(PluginCall call) {",
  confirmMethod + "    @PluginMethod\n    public void getOtaStatus(PluginCall call) {",
  "confirmation method"
);

range(
  "    @PluginMethod\n    public void activateBundle(PluginCall call) {",
  "    @PluginMethod\n    public void rollbackOta(PluginCall call) {",
`    @PluginMethod
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

`,
  "activateBundle"
);

range(
  "    @PluginMethod\n    public void rollbackOta(PluginCall call) {",
  "    @PluginMethod\n    public void resetToBuiltIn(PluginCall call) {",
`    @PluginMethod
    public void rollbackOta(PluginCall call) {
        String previous = state().getString(PREVIOUS, "");

        try {
            if (previous != null && !previous.isEmpty()) {
                File bundle = bundleDirectory(previous);
                String path = bundle.getCanonicalPath();
                String current = state().getString(ACTIVE, "");

                if (!state().edit()
                    .putString(ACTIVE, previous)
                    .putString(PREVIOUS, current)
                    .putBoolean(PENDING, false)
                    .putInt(ATTEMPTS, 0)
                    .commit()) {
                    throw new IllegalStateException("ذخیره وضعیت بازگشت ناموفق بود.");
                }

                if (!webPrefs().edit().putString(WEB_PATH, path).commit()) {
                    throw new IllegalStateException("ذخیره مسیر بازگشت ناموفق بود.");
                }

                getBridge().setServerBasePath(path);
            } else {
                resetToBuiltIn();
            }

            call.resolve();
        } catch (Exception e) {
            call.reject("بازگشت به نسخه قبلی انجام نشد: " + e.getMessage());
        }
    }

`,
  "rollbackOta"
);

range(
  "    private void resetToBuiltIn() {",
  "    // Downloads, verifies and stages a complete OTA bundle.",
`    private void resetToBuiltIn() {
        webPrefs().edit().remove(WEB_PATH).commit();

        state().edit()
            .remove(ACTIVE)
            .remove(PREVIOUS)
            .putBoolean(PENDING, false)
            .putInt(ATTEMPTS, 0)
            .commit();

        getBridge().setServerAssetPath("public");
    }

`,
  "resetToBuiltIn"
);

fs.writeFileSync(pluginPath, p);

const activityPath = "android/app/src/main/java/app/mande/chat/MainActivity.java";
const activity = `package app.mande.chat;

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
`;
fs.writeFileSync(activityPath, activity);

const rootPath = "src/routes/__root.tsx";
let root = fs.readFileSync(rootPath, "utf8");

const oldImport = 'import { Capacitor } from "@capacitor/core";';
if (!root.includes(oldImport)) throw new Error("Capacitor import not found");
root = root.replace(oldImport, 'import { Capacitor, registerPlugin } from "@capacitor/core";');

const gateMarker = "let gateCache:";
const gateStart = root.indexOf(gateMarker);
if (gateStart < 0) throw new Error("gateCache declaration not found");
const gateEnd = root.indexOf("\n", gateStart);
if (gateEnd < 0) throw new Error("gateCache line end not found");

root = root.slice(0, gateEnd + 1) + `
type OtaReadyPlugin = {
  confirmBundleReady(): Promise<void>;
};

const OtaReady = registerPlugin<OtaReadyPlugin>("OtaUpdater");
` + root.slice(gateEnd + 1);

const viewerMarker = "  const viewer = useViewer();";
if (!root.includes(viewerMarker)) throw new Error("RootComponent viewer marker not found");

const readyEffect = `  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !nativeGateReady) return;

    const timer = window.setTimeout(() => {
      void OtaReady.confirmBundleReady().catch((error) => {
        console.warn("M AND E OTA confirmation failed:", error);
      });
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [nativeGateReady]);

`;

root = root.replace(viewerMarker, readyEffect + viewerMarker);
fs.writeFileSync(rootPath, root);

console.log("OTA rollback guard and startup confirmation added.");
