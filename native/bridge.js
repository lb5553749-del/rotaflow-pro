import { Capacitor, registerPlugin } from '@capacitor/core';
import { GoogleMap, LatLngBounds } from '@capacitor/google-maps';
import { Geolocation } from '@capacitor/geolocation';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';

const ScreenEvents = registerPlugin('ScreenEvents');
const BackgroundGps = registerPlugin('BackgroundGps');
const MultiCamera = registerPlugin('MultiCamera');

/**
 * Single-shot / gallery — keep modest for IDB + WebView memory.
 * Smaller = faster Uri→JPEG in WebView (felt delay after shutter).
 */
const PHOTO_CAPTURE_MAX = 960;
const PHOTO_CAPTURE_QUALITY = 62;
/** Final JPEG edge for storage / thumbs — lower = less canvas + IDB work. */
const PHOTO_JS_MAX_SIDE = 800;
const PHOTO_JS_QUALITY = 0.58;
/**
 * MultiCamera (CameraX) — balance usable quality vs snappy encode after Concluir.
 * Native stills are already ~1920; keep WebView canvas modest.
 */
const PHOTO_MULTICAM_MAX_SIDE = 1600;
const PHOTO_MULTICAM_QUALITY = 0.72;

function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function canvasToJpegDataUrl(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality);
}

async function compressBlobWithBitmap(blob, maxSide, quality) {
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    // Prefer decoder resize when downscaling (cheaper than full-res canvas).
    if (scale < 1) {
      try {
        const resized = await createImageBitmap(bitmap, {
          resizeWidth: w,
          resizeHeight: h,
          resizeQuality: 'medium'
        });
        bitmap.close();
        bitmap = resized;
      } catch (_) {}
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    bitmap = null;
    await yieldToUi();
    return canvasToJpegDataUrl(canvas, quality);
  } catch (_) {
    if (bitmap) {
      try { bitmap.close(); } catch (__) {}
    }
    return null;
  }
}

function compressBlobWithImage(blob, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = async () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        await yieldToUi();
        resolve(canvasToJpegDataUrl(canvas, quality));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}

async function compressBlobToJpegDataUrl(blob, maxSide = PHOTO_JS_MAX_SIDE, quality = PHOTO_JS_QUALITY) {
  const viaBitmap = await compressBlobWithBitmap(blob, maxSide, quality);
  if (viaBitmap) return viaBitmap;
  return compressBlobWithImage(blob, maxSide, quality);
}

async function webPathToCompressedDataUrl(webPath, maxSide = PHOTO_JS_MAX_SIDE, quality = PHOTO_JS_QUALITY) {
  if (!webPath) return null;
  const res = await fetch(webPath);
  if (!res.ok) throw new Error('photo-fetch');
  const blob = await res.blob();
  return compressBlobToJpegDataUrl(blob, maxSide, quality);
}

/**
 * Normalize Capacitor Camera photo / restored result into a JPEG data URL.
 * Prefer Uri/webPath — never ask the native layer for full-size Base64/DataUrl.
 * @param {object} photo
 * @param {{ maxSide?: number, quality?: number }} [opts]
 */
async function photoResultToDataUrl(photo, opts = {}) {
  if (!photo) return null;
  const maxSide = opts.maxSide != null ? opts.maxSide : PHOTO_JS_MAX_SIDE;
  const quality = opts.quality != null ? opts.quality : PHOTO_JS_QUALITY;
  if (photo.webPath) {
    return webPathToCompressedDataUrl(photo.webPath, maxSide, quality);
  }
  if (photo.path && typeof photo.path === 'string' && !photo.path.startsWith('data:')) {
    // Rare fallback: file URI without webPath
    try {
      const file = await Filesystem.readFile({ path: photo.path });
      if (file?.data) {
        const dataUrl = String(file.data).startsWith('data:')
          ? file.data
          : `data:image/jpeg;base64,${file.data}`;
        const res = await fetch(dataUrl);
        return compressBlobToJpegDataUrl(await res.blob(), maxSide, quality);
      }
    } catch (_) {}
  }
  if (photo.dataUrl) {
    const res = await fetch(photo.dataUrl);
    return compressBlobToJpegDataUrl(await res.blob(), maxSide, quality);
  }
  if (photo.base64String) {
    const res = await fetch(`data:image/jpeg;base64,${photo.base64String}`);
    return compressBlobToJpegDataUrl(await res.blob(), maxSide, quality);
  }
  return null;
}

async function capturePhotoResult(source = 'camera') {
  return Camera.getPhoto({
    quality: PHOTO_CAPTURE_QUALITY,
    width: PHOTO_CAPTURE_MAX,
    height: PHOTO_CAPTURE_MAX,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: source === 'photos' ? CameraSource.Photos : CameraSource.Camera,
    correctOrientation: true,
    saveToGallery: false
  });
}

/** Exposed as window.RotaFlowCap; bundled first into build/app.js (src/js/main.js imports it). */
window.RotaFlowCap = {
  Capacitor,
  GoogleMap,
  LatLngBounds,
  Geolocation,
  StatusBar,
  Style,
  App,
  AppLauncher,
  Filesystem,
  Directory,
  Encoding,
  Share,
  LocalNotifications,
  ScreenEvents,
  BackgroundGps,
  MultiCamera,
  Camera,
  CameraResultType,
  CameraSource,
  Crashlytics: FirebaseCrashlytics,
  /** Android nativo usa a chave restrita por pacote+SHA-1; web/track usam a chave de referrer. */
  get MAPS_API_KEY() {
    if (this.isNative()) return window.ROTAFLOW_MAPS_ANDROID_KEY || window.ROTAFLOW_MAPS_KEY || '';
    return window.ROTAFLOW_MAPS_KEY || '';
  },
  isNative() {
    try {
      return Capacitor.isNativePlatform();
    } catch (_) {
      return false;
    }
  },
  async reportNonFatal(message, detail) {
    try {
      if (!Capacitor.isNativePlatform()) return;
      const msg = String(message || 'error').slice(0, 200);
      await FirebaseCrashlytics.log({ message: msg });
      if (detail) {
        await FirebaseCrashlytics.setCustomKey({
          key: 'detail',
          value: String(detail).slice(0, 500),
          type: 'string'
        });
      }
      await FirebaseCrashlytics.recordException({ message: msg });
    } catch (_) {}
  },
  async setCrashlyticsUser(userId) {
    try {
      if (!Capacitor.isNativePlatform() || !userId) return;
      await FirebaseCrashlytics.setUserId({ userId: String(userId).slice(0, 128) });
    } catch (_) {}
  },
  async openUrl(url) {
    if (!url) return false;
    try {
      await AppLauncher.openUrl({ url });
      return true;
    } catch (_) {
      return false;
    }
  },
  async saveAndShareTextFile(filename, text, title) {
    const result = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    });
    const uri = result?.uri;
    if (!uri) throw new Error('no-uri');
    try {
      // Quando 'text' é enviado junto com 'url', o Android envia texto simples para o WhatsApp
      // Usando 'files: [uri]' ou apenas 'url: uri' sem 'text', o WhatsApp anexa o arquivo real (.rfpro)
      await Share.share({
        title: title || filename,
        files: [uri],
        dialogTitle: title || 'Compartilhar rota'
      });
    } catch (e) {
      // Usuário cancelou o share — arquivo já está no cache
      if (e && (e.message || '').toLowerCase().includes('cancel')) return { uri, shared: false };
      throw e;
    }
    return { uri, shared: true };
  },
  photoResultToDataUrl,
  /**
   * Câmera multi-foto nativa (Activity CameraX separada — não toca no Google Maps).
   * @param {{ maxPhotos?: number }} opts
   * @returns {Promise<string[]>} data URLs JPEG comprimidos (vazio se cancelar)
   */
  async openMultiCamera(opts = {}) {
    const maxPhotos = Math.max(1, Math.min(30, Number(opts.maxPhotos) || 30));
    const onPhoto = typeof opts.onPhoto === 'function' ? opts.onPhoto : null;
    let res;
    try {
      res = await MultiCamera.open({ maxPhotos });
    } catch (e) {
      const msg = String((e && e.message) || e || '').toLowerCase();
      if (msg.includes('cancel') || msg.includes('user denied')) return [];
      throw e;
    }
    if (!res || res.cancelled) return [];
    const list = Array.isArray(res.photos) ? res.photos : [];
    if (!list.length) return [];
    const out = [];
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      const photo = list[i];
      try {
        // Uri/file → JPEG here (once). Yield between shots so UI stays responsive.
        const dataUrl = await photoResultToDataUrl(photo, {
          maxSide: PHOTO_MULTICAM_MAX_SIDE,
          quality: PHOTO_MULTICAM_QUALITY
        });
        if (dataUrl) {
          out.push(dataUrl);
          if (onPhoto) {
            try { await onPhoto(dataUrl, out.length, list.length); } catch (_) {}
          }
        } else {
          failed += 1;
        }
      } catch (e) {
        failed += 1;
        console.warn('multi-cam compress', e);
      }
      await yieldToUi();
    }
    if (failed && !out.length) {
      throw new Error('multi-cam-compress-failed');
    }
    return out;
  },
  /**
   * Abre a câmera/galeria e devolve só o resultado Uri (sem comprimir).
   * Permite UI otimista enquanto o JPEG é gerado no WebView.
   * @param {'camera'|'photos'} source
   */
  async getPhotoCapture(source = 'camera') {
    return capturePhotoResult(source);
  },
  /**
   * Captura ou escolhe foto nativa.
   * Usa Uri (não DataUrl) para evitar base64 gigante no bridge — causa clássica de OOM/reinício no Android.
   * @param {'camera'|'photos'} source
   * @returns {Promise<string|null>} data URL JPEG comprimido ou null se cancelado
   */
  async getPhotoDataUrl(source = 'camera') {
    const photo = await capturePhotoResult(source);
    return photoResultToDataUrl(photo);
  }
};
