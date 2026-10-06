package com.rotaflow.pro;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Bridge;
import com.getcapacitor.FileUtils;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.util.ArrayList;

/**
 * Abre uma Activity fullscreen com CameraX (preview próprio).
 * Não usa surface toBack no WebView — o Google Maps nativo não partilha a camada.
 */
@CapacitorPlugin(
    name = "MultiCamera",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
    }
)
public class MultiCameraPlugin extends Plugin {
    private static final int DEFAULT_MAX = 30;

    @PluginMethod
    public void open(PluginCall call) {
        if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermResult");
            return;
        }
        launchCamera(call);
    }

    @PermissionCallback
    private void cameraPermResult(PluginCall call) {
        if (getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED) {
            launchCamera(call);
        } else {
            call.reject("Permissão da câmera necessária");
        }
    }

    private void launchCamera(PluginCall call) {
        int maxPhotos = call.getInt("maxPhotos", DEFAULT_MAX);
        if (maxPhotos < 1) maxPhotos = 1;
        if (maxPhotos > DEFAULT_MAX) maxPhotos = DEFAULT_MAX;

        Intent intent = new Intent(getContext(), MultiCameraActivity.class);
        intent.putExtra(MultiCameraActivity.EXTRA_MAX_PHOTOS, maxPhotos);
        startActivityForResult(call, intent, "onMultiCameraResult");
    }

    @ActivityCallback
    private void onMultiCameraResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        JSObject ret = new JSObject();
        JSArray photos = new JSArray();

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            ret.put("photos", photos);
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        ArrayList<String> paths = result.getData().getStringArrayListExtra(MultiCameraActivity.EXTRA_PATHS);
        if (paths == null) paths = new ArrayList<>();

        String host = getBridge() != null ? getBridge().getLocalUrl() : "https://localhost";
        for (String absPath : paths) {
            if (absPath == null || absPath.isEmpty()) continue;
            File file = new File(absPath);
            if (!file.exists()) continue;
            JSObject item = new JSObject();
            item.put("path", absPath);
            String webPath = host + Bridge.CAPACITOR_FILE_START + absPath;
            try {
                Uri uri = Uri.fromFile(file);
                String portable = FileUtils.getPortablePath(getContext(), host, uri);
                if (portable != null && !portable.isEmpty()) webPath = portable;
            } catch (Exception ignored) {}
            item.put("webPath", webPath);
            photos.put(item);
        }

        ret.put("photos", photos);
        ret.put("cancelled", false);
        call.resolve(ret);
    }
}
