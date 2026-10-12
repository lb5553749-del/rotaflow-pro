package com.rotaflow.pro;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Mantém o GPS ativo com o app em segundo plano ou a tela bloqueada,
 * para o aviso de proximidade e o rastreio continuarem.
 */
public class BackgroundGpsService extends Service implements LocationListener {
    private static final String CHANNEL_ID = "rotaflow_gps_bg";
    private static final String PREFS = "rf_bg_gps";
    private static final String TAG = "RotaFlowGps";
    private static final int NOTIF_ID = 71010;
    private static final Object LOCK = new Object();
    /** Paradas à frente que recebem posição a cada fix; as outras só no "chegando". */
    private static final int PUBLISH_HEAD = 3;

    private static String title = "RotaFlow rastreando";
    private static String text = "GPS ativo para avisar o cliente";
    private static long intervalMs = 4000;
    private static float minDistanceM = 12f;
    private static float nearMeters = 100f;
    private static String projectId = "rotaflow-83610";
    private static String apiKey = "";
    private static String trackHost = "https://rotaflow-83610.web.app";
    /** Usuário anônimo do app (mesmo do Firebase JS): rules exigem auth.uid == ownerUid. */
    private static String authUid = "";
    private static String refreshToken = "";
    /** Retenção ativa (LGPD) — igual a TRACK_RETENTION_ACTIVE_MS em lib/track-schema.js. */
    private static final long RETENTION_ACTIVE_MS = 48L * 60 * 60 * 1000;
    private static final List<Target> targets = new ArrayList<>();
    private static Context appCtx;

    private LocationManager locationManager;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private long lastPublishAt = 0;
    private double lastPubLat = 0;
    private double lastPubLng = 0;
    /** Só acessados na thread `io`. */
    private String idToken = "";
    private long idTokenExpAt = 0;

    static class Target {
        String token;
        double lat;
        double lng;
        /** Posição na rota (1 = próxima). Integer.MAX_VALUE se a rota não foi otimizada. */
        int routeOrder = Integer.MAX_VALUE;
        boolean nearNotified;
        /** nearNotified já gravado no doc pai (dispara o push na Cloud Function). */
        boolean nearSynced;
    }

    static void setAuth(String uid, String token) {
        synchronized (LOCK) {
            authUid = uid != null ? uid : "";
            refreshToken = token != null ? token : "";
        }
        persistLocked();
    }

    static void configure(com.getcapacitor.PluginCall call) {
        synchronized (LOCK) {
            if (call.getString("notificationTitle") != null) title = call.getString("notificationTitle");
            if (call.getString("notificationText") != null) text = call.getString("notificationText");
            if (call.getInt("intervalMs") != null) intervalMs = call.getInt("intervalMs");
            if (call.getFloat("minDistanceM") != null) minDistanceM = call.getFloat("minDistanceM");
            if (call.getFloat("nearMeters") != null) nearMeters = call.getFloat("nearMeters");
            if (call.getString("projectId") != null) projectId = call.getString("projectId");
            if (call.getString("apiKey") != null) apiKey = call.getString("apiKey");
            // VAPID private NUNCA no APK — push via Cloud Functions (onTrackNotify).
            if (call.getString("trackHost") != null) trackHost = call.getString("trackHost");
            setTargets(call.getArray("targets"));
        }
        persistLocked();
    }

    static void setTargets(JSArray array) {
        synchronized (LOCK) {
            targets.clear();
            if (array == null) return;
            for (int i = 0; i < array.length(); i++) {
                try {
                    JSONObject raw = array.getJSONObject(i);
                    Target t = new Target();
                    t.token = raw.optString("token", "");
                    if (t.token.isEmpty() || !raw.has("lat") || !raw.has("lng")) continue;
                    t.lat = raw.getDouble("lat");
                    t.lng = raw.getDouble("lng");
                    t.routeOrder = raw.optInt("routeOrder", Integer.MAX_VALUE);
                    t.nearNotified = raw.optBoolean("nearNotified", false);
                    // O JS grava o nearNotified que ele mesmo detectou.
                    t.nearSynced = t.nearNotified;
                    targets.add(t);
                } catch (Exception ignored) {}
            }
        }
        persistLocked();
    }

    static void start(Context context) {
        appCtx = context.getApplicationContext();
        persistLocked();
        Intent intent = new Intent(context, BackgroundGpsService.class);
        ContextCompat.startForegroundService(context, intent);
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, BackgroundGpsService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        appCtx = getApplicationContext();
        restore();
        ensureChannel();
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIF_ID, notification);
        }
        startUpdates();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopUpdates();
        io.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void startUpdates() {
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        if (locationManager == null) return;
        long minTime;
        float minDist;
        synchronized (LOCK) {
            minTime = intervalMs;
            minDist = minDistanceM;
        }
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, minTime, minDist, this, Looper.getMainLooper());
            }
        } catch (SecurityException ignored) {}
        try {
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, Math.max(minTime, 8000), Math.max(minDist, 20f), this, Looper.getMainLooper());
            }
        } catch (SecurityException ignored) {}
    }

    private void stopUpdates() {
        if (locationManager != null) {
            try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
        }
    }

    @Override
    public void onLocationChanged(@NonNull Location location) {
        double lat = location.getLatitude();
        double lng = location.getLongitude();
        float acc = location.hasAccuracy() ? location.getAccuracy() : 0f;
        BackgroundGpsPlugin plugin = BackgroundGpsPlugin.instance;
        if (plugin != null) plugin.emitLocation(lat, lng, acc);
        handleNearAndPublish(lat, lng, acc);
    }

    private void handleNearAndPublish(double lat, double lng, float acc) {
        List<Target> snapshot;
        float near;
        String pid;
        String key;
        String uid;
        String refresh;
        synchronized (LOCK) {
            snapshot = new ArrayList<>(targets);
            near = nearMeters;
            pid = projectId;
            key = apiKey;
            uid = authUid;
            refresh = refreshToken;
        }
        boolean shouldPublish = snapshot.isEmpty() ? false : shouldPublish(lat, lng);
        // Só as próximas PUBLISH_HEAD paradas recebem posição a cada fix; as outras
        // recebem só quando o motorista chega perto. Sem isso, cada fix vira uma
        // escrita no Firestore por parada ativa — e um cliente 8 paradas atrás vê o
        // carro se movendo desde o início da rota.
        Set<String> headTokens = new HashSet<>();
        if (shouldPublish) {
            List<Target> ordered = new ArrayList<>(snapshot);
            Collections.sort(ordered, (a, b) -> Integer.compare(a.routeOrder, b.routeOrder));
            for (int i = 0; i < Math.min(PUBLISH_HEAD, ordered.size()); i++) {
                headTokens.add(ordered.get(i).token);
            }
        }
        for (Target t : snapshot) {
            float[] out = new float[1];
            Location.distanceBetween(lat, lng, t.lat, t.lng, out);
            boolean becameNear = !t.nearNotified && out[0] <= near;
            if (becameNear) {
                t.nearNotified = true;
                BackgroundGpsPlugin plugin = BackgroundGpsPlugin.instance;
                if (plugin != null) plugin.emitNear(t.token, lat, lng);
                // Push near: Cloud Function ao ver nearNotified no Firestore (publishTrack).
            }
            if (becameNear || (shouldPublish && headTokens.contains(t.token))) {
                publishTrack(pid, key, uid, refresh, t, lat, lng, acc);
            }
        }
        persistLocked();
    }

    private boolean shouldPublish(double lat, double lng) {
        long now = System.currentTimeMillis();
        if (lastPublishAt == 0) {
            lastPublishAt = now;
            lastPubLat = lat;
            lastPubLng = lng;
            return true;
        }
        float[] moved = new float[1];
        Location.distanceBetween(lastPubLat, lastPubLng, lat, lng, moved);
        if (now - lastPublishAt >= 4000 || moved[0] >= 20f) {
            lastPublishAt = now;
            lastPubLat = lat;
            lastPubLng = lng;
            return true;
        }
        return false;
    }

    private static String readAll(InputStream is) throws Exception {
        if (is == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        return sb.toString();
    }

    private static void persistLocked() {
        Context ctx = appCtx;
        if (ctx == null) return;
        try {
            JSONObject cfg = new JSONObject();
            synchronized (LOCK) {
                cfg.put("title", title);
                cfg.put("text", text);
                cfg.put("intervalMs", intervalMs);
                cfg.put("minDistanceM", minDistanceM);
                cfg.put("nearMeters", nearMeters);
                cfg.put("projectId", projectId);
                cfg.put("apiKey", apiKey);
                cfg.put("trackHost", trackHost);
                cfg.put("authUid", authUid);
                cfg.put("refreshToken", refreshToken);
                JSONArray arr = new JSONArray();
                for (Target t : targets) {
                    JSONObject o = new JSONObject();
                    o.put("token", t.token);
                    o.put("lat", t.lat);
                    o.put("lng", t.lng);
                    o.put("routeOrder", t.routeOrder);
                    o.put("nearNotified", t.nearNotified);
                    o.put("nearSynced", t.nearSynced);
                    arr.put(o);
                }
                cfg.put("targets", arr);
            }
            ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("cfg", cfg.toString()).apply();
        } catch (Exception ignored) {}
    }

    private void restore() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            String raw = prefs.getString("cfg", "");
            if (raw == null || raw.isEmpty()) return;
            JSONObject cfg = new JSONObject(raw);
            synchronized (LOCK) {
                title = cfg.optString("title", title);
                text = cfg.optString("text", text);
                intervalMs = cfg.optLong("intervalMs", intervalMs);
                minDistanceM = (float) cfg.optDouble("minDistanceM", minDistanceM);
                nearMeters = (float) cfg.optDouble("nearMeters", nearMeters);
                projectId = cfg.optString("projectId", projectId);
                apiKey = cfg.optString("apiKey", apiKey);
                trackHost = cfg.optString("trackHost", trackHost);
                authUid = cfg.optString("authUid", authUid);
                refreshToken = cfg.optString("refreshToken", refreshToken);
                // Descarta vapidPrivate legado em SharedPreferences (nunca mais no APK).
                JSONArray arr = cfg.optJSONArray("targets");
                if (arr != null && targets.isEmpty()) {
                    for (int i = 0; i < arr.length(); i++) {
                        JSONObject rawT = arr.getJSONObject(i);
                        Target t = new Target();
                        t.token = rawT.optString("token", "");
                        t.lat = rawT.optDouble("lat", Double.NaN);
                        t.lng = rawT.optDouble("lng", Double.NaN);
                        t.routeOrder = rawT.optInt("routeOrder", Integer.MAX_VALUE);
                        t.nearNotified = rawT.optBoolean("nearNotified", false);
                        t.nearSynced = rawT.optBoolean("nearSynced", t.nearNotified);
                        if (!t.token.isEmpty() && !Double.isNaN(t.lat) && !Double.isNaN(t.lng)) {
                            targets.add(t);
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Posição → tracks/{token}/live/pos (não dispara Cloud Function).
     * nearNotified → doc pai, até a gravação dar certo (é ele que dispara o push "chegando").
     */
    private void publishTrack(String pid, String key, String uid, String refresh, Target t,
                              double lat, double lng, float acc) {
        if (pid == null || pid.isEmpty() || t.token == null || t.token.isEmpty()) return;
        if (uid == null || uid.isEmpty() || refresh == null || refresh.isEmpty()) return;
        final String token = t.token;
        final boolean sendNear = t.nearNotified && !t.nearSynced;
        io.execute(() -> {
            try {
                String bearer = idToken(key, refresh);
                if (bearer.isEmpty()) return;
                long now = System.currentTimeMillis();
                String expiresAt = rfc3339(now + RETENTION_ACTIVE_MS);
                String base = "https://firestore.googleapis.com/v1/projects/" + pid
                    + "/databases/(default)/documents/tracks/" + token;

                if (sendNear) {
                    JSONObject ev = new JSONObject();
                    ev.put("nearNotified", new JSONObject().put("booleanValue", true));
                    ev.put("updatedAt", new JSONObject().put("integerValue", String.valueOf(now)));
                    ev.put("expiresAt", new JSONObject().put("timestampValue", expiresAt));
                    int code = patch(base + "?updateMask.fieldPaths=nearNotified"
                        + "&updateMask.fieldPaths=updatedAt"
                        + "&updateMask.fieldPaths=expiresAt", bearer, ev);
                    if (code >= 200 && code < 300) {
                        synchronized (LOCK) { t.nearSynced = true; }
                        persistLocked();
                    }
                }

                JSONObject live = new JSONObject();
                live.put("driverLat", new JSONObject().put("doubleValue", lat));
                live.put("driverLng", new JSONObject().put("doubleValue", lng));
                live.put("accuracy", new JSONObject().put("doubleValue", acc));
                live.put("updatedAt", new JSONObject().put("integerValue", String.valueOf(now)));
                live.put("ownerUid", new JSONObject().put("stringValue", uid));
                live.put("expiresAt", new JSONObject().put("timestampValue", expiresAt));
                patch(base + "/live/pos?updateMask.fieldPaths=driverLat"
                    + "&updateMask.fieldPaths=driverLng"
                    + "&updateMask.fieldPaths=accuracy"
                    + "&updateMask.fieldPaths=updatedAt"
                    + "&updateMask.fieldPaths=ownerUid"
                    + "&updateMask.fieldPaths=expiresAt", bearer, live);
            } catch (Exception e) {
                Log.w(TAG, "publishTrack", e);
            }
        });
    }

    /** ID token do Firebase Auth a partir do refresh token (válido ~1h; renovado com folga). Thread `io`. */
    private String idToken(String key, String refresh) {
        long now = System.currentTimeMillis();
        if (!idToken.isEmpty() && now < idTokenExpAt - 120_000) return idToken;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL("https://securetoken.googleapis.com/v1/token?key="
                + URLEncoder.encode(key == null ? "" : key, "UTF-8")).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            byte[] bytes = ("grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8"))
                .getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            OutputStream os = conn.getOutputStream();
            os.write(bytes);
            os.close();
            if (conn.getResponseCode() != 200) {
                idToken = "";
                return "";
            }
            JSONObject res = new JSONObject(readAll(conn.getInputStream()));
            idToken = res.optString("id_token", "");
            idTokenExpAt = now + res.optLong("expires_in", 3600) * 1000L;
            String rotated = res.optString("refresh_token", "");
            if (!rotated.isEmpty() && !rotated.equals(refresh)) {
                synchronized (LOCK) { refreshToken = rotated; }
                persistLocked();
            }
            return idToken;
        } catch (Exception e) {
            Log.w(TAG, "idToken", e);
            return "";
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private int patch(String url, String bearer, JSONObject fields) throws Exception {
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject().put("fields", fields);
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("PATCH");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + bearer);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            OutputStream os = conn.getOutputStream();
            os.write(bytes);
            os.close();
            int code = conn.getResponseCode();
            if (code == 401) idToken = "";
            return code;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String rfc3339(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(ms));
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "GPS em segundo plano",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Mantém o rastreio e os avisos ao cliente com o app fechado");
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(
            this,
            0,
            launch != null ? launch : new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String nTitle;
        String nText;
        synchronized (LOCK) {
            nTitle = title;
            nText = text;
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(nTitle)
            .setContentText(nText)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(pi)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    @Override public void onProviderEnabled(@NonNull String provider) {}
    @Override public void onProviderDisabled(@NonNull String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
}
