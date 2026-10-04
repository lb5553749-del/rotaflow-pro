#!/usr/bin/env node
'use strict';

/**
 * Patches @capacitor/google-maps Android:
 * 1) data:image/png;base64 icons (ID labels on pins)
 * 2) rotate/tilt/compass gestures like Google Maps
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.join(
  root,
  'node_modules/@capacitor/google-maps/android/src/main/java/com/capacitorjs/plugins/googlemaps/CapacitorGoogleMap.kt'
);

if (!fs.existsSync(target)) {
  console.warn('patch-google-maps-android: CapacitorGoogleMap.kt not found, skip');
  process.exit(0);
}

let src = fs.readFileSync(target, 'utf8');
let changed = false;

if (!src.includes('ROTAFLOW_DATA_URL_ICON')) {
  if (!src.includes('import java.io.InputStream')) {
    console.error('patch-google-maps-android: unexpected file, abort');
    process.exit(1);
  }

  if (!src.includes('import java.io.ByteArrayInputStream')) {
    src = src.replace(
      'import java.io.InputStream\nimport java.net.URL',
      'import java.io.ByteArrayInputStream\nimport java.io.InputStream\nimport java.net.URL\nimport android.util.Base64'
    );
  }

  const start = src.indexOf(
    '                try {\n                    var stream: InputStream? = null\n                    if (marker.iconUrl!!.startsWith("https:"))'
  );
  const end = start >= 0 ? src.indexOf('                } catch (e: Exception) {', start) : -1;
  if (start < 0 || end < 0) {
    console.error('patch-google-maps-android: icon load block not found, abort');
    process.exit(1);
  }

  const replacementOk =
    '                try {\n' +
    '                    // ROTAFLOW_DATA_URL_ICON\n' +
    '                    var stream: InputStream? = null\n' +
    '                    val iconUrl = marker.iconUrl!!\n' +
    '                    if (iconUrl.startsWith("data:")) {\n' +
    '                        val b64 = iconUrl.substringAfter("base64,", "")\n' +
    '                        val bytes = Base64.decode(b64, Base64.DEFAULT)\n' +
    '                        stream = ByteArrayInputStream(bytes)\n' +
    '                    } else if (iconUrl.startsWith("https:")) {\n' +
    '                        stream = URL(iconUrl).openConnection().getInputStream()\n' +
    '                    } else {\n' +
    '                        stream = this.delegate.context.assets.open("public/${iconUrl}")\n' +
    '                    }\n' +
    '                    var bitmap = BitmapFactory.decodeStream(stream)\n' +
    '                    this.markerIcons[iconUrl] = bitmap\n' +
    '                    markerOptions.icon(getResizedIcon(bitmap, marker))\n' +
    '                ';

  src = src.slice(0, start) + replacementOk + src.slice(end);
  changed = true;
  console.log('patch-google-maps-android: applied data URL icon support');
}

if (!src.includes('ROTAFLOW_ROTATE_GESTURES')) {
  const needle =
    '                if (config.styles != null) {\n' +
    '                    googleMap?.setMapStyle(MapStyleOptions(config.styles!!))\n' +
    '                }\n\n' +
    '                if (config.maxZoom != null) {';
  const insert =
    '                if (config.styles != null) {\n' +
    '                    googleMap?.setMapStyle(MapStyleOptions(config.styles!!))\n' +
    '                }\n\n' +
    '                // ROTAFLOW_ROTATE_GESTURES — rotação/inclinação 360° como no Google Maps\n' +
    '                googleMap?.uiSettings?.isRotateGesturesEnabled = true\n' +
    '                googleMap?.uiSettings?.isTiltGesturesEnabled = true\n' +
    '                googleMap?.uiSettings?.isCompassEnabled = true\n' +
    '                googleMap?.uiSettings?.isScrollGesturesEnabled = true\n' +
    '                googleMap?.uiSettings?.isZoomGesturesEnabled = true\n\n' +
    '                if (config.maxZoom != null) {';
  if (!src.includes(needle)) {
    console.warn('patch-google-maps-android: rotate insert point not found');
  } else {
    src = src.replace(needle, insert);
    changed = true;
    console.log('patch-google-maps-android: applied rotate/tilt gestures');
  }
}

if (changed) {
  fs.writeFileSync(target, src);
} else {
  console.log('patch-google-maps-android: already applied');
}
