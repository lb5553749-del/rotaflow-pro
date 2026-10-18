#!/usr/bin/env node
'use strict';

/**
 * Injeta plugins nativos no app Android e registra no MainActivity.
 * Roda após `cap sync` (android/ é gerado/atualizado pelo Capacitor).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const javaDir = path.join(root, 'android/app/src/main/java/com/rotaflow/pro');
const mainActivity = path.join(javaDir, 'MainActivity.java');
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');

if (!fs.existsSync(mainActivity)) {
  console.warn('patch-android-native: MainActivity não encontrado, skip');
  process.exit(0);
}

fs.mkdirSync(javaDir, { recursive: true });

for (const file of [
  'ScreenEventsPlugin.java',
  'BackgroundGpsPlugin.java',
  'BackgroundGpsService.java',
  'MultiCameraPlugin.java',
  'MultiCameraActivity.java'
]) {
  const src = path.join(root, 'native/android', file);
  if (!fs.existsSync(src)) {
    console.warn('patch-android-native: fonte ausente', file);
    continue;
  }
  fs.copyFileSync(src, path.join(javaDir, file));
}

// Removido: assinava VAPID com chave privada no aparelho. Push sai só da Cloud Function.
fs.rmSync(path.join(javaDir, 'WebPushSender.java'), { force: true });

const desiredMain = `package com.rotaflow.pro;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenEventsPlugin.class);
        registerPlugin(BackgroundGpsPlugin.class);
        registerPlugin(MultiCameraPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        handleOpenFileIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleOpenFileIntent(intent);
    }

    private void handleOpenFileIntent(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null) return;

        try {
            InputStream is = getContentResolver().openInputStream(uri);
            if (is == null) return;
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line).append('\\n');
            reader.close();
            is.close();

            final String content = sb.toString().trim();
            if (content.isEmpty()) return;

            dispatchBackupContentToJs(content);
        } catch (Exception e) {
            android.util.Log.w("RotaFlow", "Erro ao ler arquivo: " + e.getMessage());
        }
    }

    private void dispatchBackupContentToJs(String jsonContent) {
        final String escaped = jsonContent
            .replace("\\\\", "\\\\\\\\")
            .replace("\`", "\\\\\`")
            .replace("$", "\\\\$");

        Runnable dispatch = () -> {
            try {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv == null) {
                    getWindow().getDecorView().postDelayed(() -> dispatchBackupContentToJs(jsonContent), 600);
                    return;
                }
                String js = "window.dispatchEvent(new CustomEvent('rotaflow:openBackup', { detail: \`" + escaped + "\` }));";
                wv.evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        };

        runOnUiThread(() -> getWindow().getDecorView().postDelayed(dispatch, 900));
    }

    @Override
    public void onResume() {
        super.onResume();
        restoreWebViewAfterResume();
        getWindow().getDecorView().post(this::restoreWebViewAfterResume);
        getWindow().getDecorView().postDelayed(this::restoreWebViewAfterResume, 120);
        getWindow().getDecorView().postDelayed(this::restoreWebViewAfterResume, 400);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            restoreWebViewAfterResume();
            getWindow().getDecorView().postDelayed(this::restoreWebViewAfterResume, 80);
        }
    }

    private void restoreWebViewAfterResume() {
        try {
            if (getBridge() == null) return;
            WebView wv = getBridge().getWebView();
            if (wv == null) return;
            wv.onResume();
            wv.resumeTimers();
            wv.setVisibility(View.VISIBLE);
            wv.setBackgroundColor(Color.TRANSPARENT);
            wv.setAlpha(1f);
            wv.bringToFront();
            wv.requestLayout();
            wv.invalidate();
        } catch (Exception ignored) {}
    }
}
`;
fs.writeFileSync(mainActivity, desiredMain);

const gradlePath = path.join(root, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  let changed = false;
  const bcprov = /\n\s*implementation 'org\.bouncycastle:bcprov-jdk18on:[^']+'/;
  if (bcprov.test(gradle)) {
    gradle = gradle.replace(bcprov, '');
    changed = true;
  }
  const cameraDeps = [
    "implementation 'androidx.camera:camera-camera2:1.4.2'",
    "implementation 'androidx.camera:camera-lifecycle:1.4.2'",
    "implementation 'androidx.camera:camera-view:1.4.2'"
  ];
  for (const dep of cameraDeps) {
    if (!gradle.includes(dep)) {
      gradle = gradle.replace(/dependencies\s*\{/, `dependencies {\n    ${dep}`);
      changed = true;
    }
  }
  // Crashlytics: só aplica o plugin se google-services.json existir
  const servicesJSON = path.join(root, 'android/app/google-services.json');
  if (fs.existsSync(servicesJSON) && !gradle.includes("com.google.firebase.crashlytics")) {
    if (!gradle.includes("apply plugin: 'com.google.firebase.crashlytics'")) {
      gradle += "\napply plugin: 'com.google.firebase.crashlytics'\n";
      changed = true;
    }
  }
  // Release enxuto: R8 + shrinkResources (idempotente — android/ é regenerável).
  if (/minifyEnabled\s+false/.test(gradle)) {
    gradle = gradle.replace(
      /minifyEnabled\s+false/,
      'minifyEnabled true\n            shrinkResources true'
    );
    changed = true;
  }
  if (changed) fs.writeFileSync(gradlePath, gradle);
}

// Root build.gradle: classpath Crashlytics
const rootGradle = path.join(root, 'android/build.gradle');
if (fs.existsSync(rootGradle)) {
  let g = fs.readFileSync(rootGradle, 'utf8');
  if (!g.includes('firebase-crashlytics-gradle')) {
    g = g.replace(
      /classpath 'com.google.gms:google-services:[^']+'/,
      (m) => `${m}\n        classpath 'com.google.firebase:firebase-crashlytics-gradle:2.9.9'`
    );
    fs.writeFileSync(rootGradle, g);
    console.log('android/build.gradle: Crashlytics classpath adicionado');
  }
}

// Fundo da janela: evita flash/tela preta se MapView atrasar no resume
const stylesPath = path.join(root, 'android/app/src/main/res/values/styles.xml');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  if (!styles.includes('android:windowBackground') && styles.includes('AppTheme.NoActionBar')) {
    styles = styles.replace(
      /(<style name="AppTheme\.NoActionBar"[^>]*>[\s\S]*?<item name="windowNoTitle">true<\/item>\s*)/,
      '$1        <item name="android:windowBackground">#e2e8f0</item>\n'
    );
    fs.writeFileSync(stylesPath, styles);
  }
}

if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  if (!manifest.includes('xmlns:tools=')) {
    manifest = manifest.replace(
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    xmlns:tools="http://schemas.android.com/tools">'
    );
  }
  // Foto-only: tira RECORD_AUDIO / MODIFY_AUDIO_SETTINGS que o plugin Camera costuma mergear.
  const stripAudio = [
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS'
  ];
  for (const perm of stripAudio) {
    const removeTag = `<uses-permission android:name="${perm}" tools:node="remove" />`;
    const plain = new RegExp(
      `\\s*<uses-permission\\s+android:name="${perm.replace(/\./g, '\\.')}"\\s*/>\\s*`,
      'g'
    );
    manifest = manifest.replace(plain, '\n');
    if (!manifest.includes(removeTag) && manifest.includes('</manifest>')) {
      manifest = manifest.replace('</manifest>', `    ${removeTag}\n</manifest>`);
    }
  }
  const perms = [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
    'android.permission.WAKE_LOCK',
    'android.permission.POST_NOTIFICATIONS'
  ];
  for (const perm of perms) {
    const tag = `<uses-permission android:name="${perm}" />`;
    if (!manifest.includes(`android:name="${perm}"`) && manifest.includes('</manifest>')) {
      manifest = manifest.replace('</manifest>', `    ${tag}\n</manifest>`);
    }
  }
  if (!manifest.includes('BackgroundGpsService')) {
    manifest = manifest.replace(
      '</application>',
      `        <service
            android:name=".BackgroundGpsService"
            android:exported="false"
            android:foregroundServiceType="location"
            android:stopWithTask="false" />\n    </application>`
    );
  }
  if (!manifest.includes('MultiCameraActivity')) {
    manifest = manifest.replace(
      '</application>',
      `        <activity
            android:name=".MultiCameraActivity"
            android:exported="false"
            android:screenOrientation="portrait"
            android:theme="@style/AppTheme.NoActionBar"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|uiMode" />\n    </application>`
    );
  }
  if (!manifest.includes('android:pathPattern=".*\\\\.rfpro"')) {
    const rfproFilters = `            <intent-filter android:label="Abrir rota no RotaFlow Pro">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:host="*" />
                <data android:pathPattern=".*\\\\.rfpro" />
            </intent-filter>
            <intent-filter android:label="Abrir rota no RotaFlow Pro">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="file" />
                <data android:host="*" />
                <data android:pathPattern=".*\\\\.rfpro" />
            </intent-filter>
            <intent-filter android:label="Abrir rota no RotaFlow Pro">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:mimeType="*/*" />
                <data android:pathPattern=".*\\\\.rfpro" />
            </intent-filter>
            <intent-filter android:label="Abrir rota no RotaFlow Pro">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:mimeType="application/octet-stream" />
            </intent-filter>
            <intent-filter android:label="Abrir rota no RotaFlow Pro">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:mimeType="application/json" />
            </intent-filter>`;
    manifest = manifest.replace(
      /(<category android:name="android\.intent\.category\.LAUNCHER" \/>\s*<\/intent-filter>)/,
      `$1\n\n${rfproFilters}`
    );
  }
  // Sem MLKit: meta-data órfão de plugin já removido.
  manifest = manifest.replace(
    /\s*<meta-data\s+android:name="com\.google\.mlkit\.vision\.DEPENDENCIES"[\s\S]*?\/>\n?/,
    '\n'
  );
  // Dados de rota não vão para backups automáticos de terceiros.
  manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false"');
  // Maps SDK nativo usa a chave restrita a com.rotaflow.pro + SHA-1 de release (S3).
  manifest = manifest.replace(
    /(android:name="com\.google\.android\.geo\.API_KEY"\s+android:value=")[^"]*(")/,
    '$1AIzaSyCKOJs51TAPJm2gIOcFplxb8HxzN4knfTg$2'
  );
  fs.writeFileSync(manifestPath, manifest);
}

console.log('patch-android-native: plugins GPS/tela/câmera multi registrados');
