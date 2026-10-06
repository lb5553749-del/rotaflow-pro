package com.rotaflow.pro;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Mostra a entrega atual só com a tela bloqueada.
 * A notificação é publicada no nativo em SCREEN_OFF (a WebView pausada
 * não consegue agendar a tempo).
 */
@CapacitorPlugin(
    name = "ScreenEvents",
    permissions = {
        @Permission(alias = "display", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class ScreenEventsPlugin extends Plugin {
    private static final String CHANNEL_ID = "rotaflow_lock_native_v1";
    private static final int NOTIF_ID = 71001;

    private BroadcastReceiver receiver;
    private boolean registered = false;
    private String activeTitle = null;
    private String activeBody = null;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        super.load();
        ensureChannel();
        ensureRegistered();
    }

    private Context appContext() {
        return getContext().getApplicationContext();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) appContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Entrega (tela bloqueada)",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Mostra o ID da entrega na tela de bloqueio");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.enableLights(false);
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(channel);
    }

    private boolean canPostNotifications() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return ContextCompat.checkSelfPermission(appContext(), Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void ensureRegistered() {
        if (registered) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null || intent.getAction() == null) return;
                String action = intent.getAction();
                if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                    // Publica no nativo — não depende da WebView
                    mainHandler.post(() -> showLockNotification());
                    notifyListeners("screenOff", new JSObject());
                } else if (Intent.ACTION_USER_PRESENT.equals(action)) {
                    mainHandler.post(() -> hideLockNotification());
                    notifyListeners("userPresent", new JSObject());
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        Context ctx = appContext();
        if (Build.VERSION.SDK_INT >= 33) {
            ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            ctx.registerReceiver(receiver, filter);
        }
        registered = true;
    }

    private Intent launchIntent() {
        Context ctx = appContext();
        Intent intent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (intent == null) {
            intent = new Intent(ctx, MainActivity.class);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return intent;
    }

    private void showLockNotification() {
        if (activeTitle == null || activeTitle.trim().isEmpty()) {
            hideLockNotification();
            return;
        }
        if (!canPostNotifications()) return;
        ensureChannel();

        PendingIntent pi = PendingIntent.getActivity(
            appContext(),
            0,
            launchIntent(),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String body = activeBody != null ? activeBody : "";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(appContext(), CHANNEL_ID)
            .setContentTitle(activeTitle)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(appContext().getApplicationInfo().icon)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setSound(null)
            .setVibrate(null)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(pi);

        try {
            NotificationManagerCompat.from(appContext()).notify(NOTIF_ID, builder.build());
        } catch (SecurityException ignored) {
            // Sem permissão POST_NOTIFICATIONS
        }
    }

    private void hideLockNotification() {
        try {
            NotificationManagerCompat.from(appContext()).cancel(NOTIF_ID);
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void ping(PluginCall call) {
        ensureRegistered();
        ensureChannel();
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("hasActive", activeTitle != null);
        ret.put("canPost", canPostNotifications());
        call.resolve(ret);
    }

    /** Memoriza o texto da entrega atual (sem publicar agora). */
    @PluginMethod
    public void setActiveStop(PluginCall call) {
        ensureRegistered();
        String title = call.getString("title", "");
        String body = call.getString("body", "");
        if (title == null || title.trim().isEmpty()) {
            activeTitle = null;
            activeBody = null;
            hideLockNotification();
            call.resolve();
            return;
        }
        activeTitle = title.trim();
        activeBody = body != null ? body.trim() : "";
        call.resolve();
    }

    /** Limpa a entrega e remove a notificação. */
    @PluginMethod
    public void clearActiveStop(PluginCall call) {
        activeTitle = null;
        activeBody = null;
        hideLockNotification();
        call.resolve();
    }

    /** Força mostrar agora (útil para teste). */
    @PluginMethod
    public void showNow(PluginCall call) {
        ensureRegistered();
        showLockNotification();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        // Mantém o receiver no application context — não desregistra no destroy
        // da Activity (senão some ao rotacionar / recriar).
        super.handleOnDestroy();
    }
}
