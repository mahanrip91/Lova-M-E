package app.mande.chat;

import android.content.Context;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

final class UpdateScheduler {
    static final String WORK_NAME = "mande-update-check";

    private UpdateScheduler() {}

    /**
     * Schedules a unique periodic check every 6 hours on a connected network.
     * Android runs periodic work inexactly: Doze, App Standby buckets, OEM battery
     * savers and "restricted" battery settings can delay it for hours or longer.
     * KEEP makes repeated calls (every app launch) a no-op.
     */
    static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(UpdateCheckWorker.class, 6, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
    }
}
