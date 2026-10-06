package com.rotaflow.pro;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BackgroundGps",
    permissions = {
        @Permission(alias = "bgLocation", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
        @Permission(alias = "notify", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class BackgroundGpsPlugin extends Plugin {
    static BackgroundGpsPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void start(PluginCall call) {
        BackgroundGpsService.configure(call);
        BackgroundGpsService.start(getContext());
        call.resolve();
    }

    @PluginMethod
    public void updateTargets(PluginCall call) {
        JSArray targets = call.getArray("targets");
        BackgroundGpsService.setTargets(targets);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        BackgroundGpsService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void requestExtras(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAlias("notify", call, "notifyCb");
            return;
        }
        requestBackground(call);
    }

    @PermissionCallback
    private void notifyCb(PluginCall call) {
        requestBackground(call);
    }

    private void requestBackground(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 29) {
            requestPermissionForAlias("bgLocation", call, "bgCb");
            return;
        }
        call.resolve();
    }

    @PermissionCallback
    private void bgCb(PluginCall call) {
        call.resolve();
    }

    void emitLocation(double lat, double lng, float accuracy) {
        JSObject loc = new JSObject();
        loc.put("latitude", lat);
        loc.put("longitude", lng);
        loc.put("accuracy", accuracy);
        notifyListeners("location", loc, true);
    }

    void emitNear(String token, double lat, double lng) {
        JSObject data = new JSObject();
        data.put("token", token);
        data.put("latitude", lat);
        data.put("longitude", lng);
        notifyListeners("near", data, true);
    }
}
