package app.mande.chat;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom plugins must be registered before super.onCreate builds the bridge.
        registerPlugin(NativeToolsPlugin.class);
        super.onCreate(savedInstanceState);
        // Idempotent: unique periodic work with KEEP policy.
        UpdateScheduler.schedule(getApplicationContext());
    }
}
