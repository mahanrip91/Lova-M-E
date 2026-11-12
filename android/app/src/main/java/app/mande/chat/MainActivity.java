package app.mande.chat;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

import java.io.File;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MAE-UPDATE";

    /** Remove the retired web-bundle override and its private files without touching app data. */
    private static void clearLegacyWebUpdater(Context context) {
        SharedPreferences webPrefs =
            context.getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE);
        boolean pathCleared = webPrefs.edit().remove("serverBasePath").commit();
        if (!pathCleared) {
            Log.e(TAG, "Could not clear legacy WebView serverBasePath override");
        }

        SharedPreferences oldState =
            context.getSharedPreferences("mae_ota_state", Context.MODE_PRIVATE);
        if (!oldState.edit().clear().commit()) {
            Log.w(TAG, "Could not clear legacy web updater state");
        }

        deleteTree(new File(context.getFilesDir(), "mae-ota"));
    }

    private static void deleteTree(File file) {
        if (!file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteTree(child);
            }
        }
        if (!file.delete() && file.exists()) {
            Log.w(TAG, "Could not delete retired updater file: " + file.getName());
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before BridgeActivity reads Capacitor's persisted web asset path.
        clearLegacyWebUpdater(getApplicationContext());
        registerPlugin(NativeToolsPlugin.class);
        super.onCreate(savedInstanceState);
        UpdateScheduler.schedule(getApplicationContext());
    }
}
