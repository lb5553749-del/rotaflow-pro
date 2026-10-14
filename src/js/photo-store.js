/**
 * Fotos em IndexedDB (Blobs — não data URLs; não entram no localStorage),
 * object URLs vivos, fila de operações de foto e compressão JPEG no WebView.
 * Chaves por usuário: main.js chama configurePhotoStore({ getUid }) no boot.
 * Housekeeping: purgeStalePhotos remove órfãs e fotos de rotas finalizadas fora do TTL.
 */
import {
    DEFAULT_PHOTO_MAX_PER_ITEM,
    DEFAULT_FINISHED_PHOTO_TTL_DAYS,
    normalizeIdbPhotoValue,
    planIdbPhotoKeysToDelete
} from '../../lib/photo-helpers.js';

let getUid = () => 'guest';

export function configurePhotoStore(opts) {
    if (opts && typeof opts.getUid === 'function') getUid = opts.getUid;
}

/** Galeria / single-shot — compressão leve para IDB + WebView. */
export const PHOTO_MAX_SIDE = 800;
export const PHOTO_JPEG_QUALITY = 0.58;
/** Multi-câmera web (getUserMedia). Nativa: bridge PHOTO_MULTICAM_* (sem recompress). */
export const PHOTO_MULTICAM_MAX_SIDE = 1600;
export const PHOTO_MULTICAM_JPEG_QUALITY = 0.72;
const PHOTO_PENDING_KEY = 'rotaflow_photo_pending_v1';
export const PHOTO_MAX_PER_ITEM = DEFAULT_PHOTO_MAX_PER_ITEM;
const PHOTO_DB_NAME = 'rotaflow_photos_v1';
const PHOTO_DB_VERSION = 2;

let photoDbPromise = null;
let photoOpChain = Promise.resolve();
/** object URLs vivos por photoId — revogar ao liberar RAM. */
const photoObjectUrls = new Map();

export function openPhotoDb() {
    if (photoDbPromise) return photoDbPromise;
    photoDbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
            photoDbPromise = null;
            reject(req.error);
        };
        // Sem onblocked a promise nunca settle e TODO o save de foto trava para sempre.
        req.onblocked = () => {
            photoDbPromise = null;
            reject(new Error('photo-db-blocked'));
        };
    });
    photoDbPromise.catch(() => { photoDbPromise = null; });
    return photoDbPromise;
}
export function photoDbKey(photoId) {
    return `${getUid()}::${photoId}`;
}
export function newPhotoId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
export function revokePhotoObjectUrl(photoId) {
    const u = photoObjectUrls.get(photoId);
    if (u) {
        try { URL.revokeObjectURL(u); } catch (_) {}
        photoObjectUrls.delete(photoId);
    }
}
export function revokeDisplayUrl(url) {
    if (url && String(url).startsWith('blob:')) {
        try { URL.revokeObjectURL(url); } catch (_) {}
    }
}
async function dataUrlToBlob(dataUrl) {
    const res = await fetch(dataUrl);
    return res.blob();
}
export async function idbPutPhoto(photoId, blobOrDataUrl) {
    let value = blobOrDataUrl;
    if (typeof blobOrDataUrl === 'string') {
        value = await dataUrlToBlob(blobOrDataUrl);
    }
    if (!(value instanceof Blob)) {
        throw new Error('photo-not-blob');
    }
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite');
        tx.objectStore('photos').put(value, photoDbKey(photoId));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}
/**
 * Lê o Blob/data URL do IndexedDB e devolve data URL para exportação (backup).
 * Não cria object URL de exibição — evita vazamento de RAM no export.
 * @returns {Promise<string|null>}
 */
export async function idbExportPhotoDataUrl(photoId) {
    const db = await openPhotoDb();
    const raw = await new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').get(photoDbKey(photoId));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
    if (raw == null) return null;
    const norm = normalizeIdbPhotoValue(raw);
    if (!norm) return null;
    if (norm.kind === 'dataurl') return norm.value;
    const blob = norm.kind === 'blob'
        ? norm.value
        : new Blob([norm.value], { type: 'image/jpeg' });
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => reject(reader.error || new Error('read'));
        reader.readAsDataURL(blob);
    });
}

/** @returns {Promise<string|null>} URL de exibição (blob: ou data: legado) */
export async function idbGetPhoto(photoId) {
    const db = await openPhotoDb();
    const raw = await new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').get(photoDbKey(photoId));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
    if (raw == null) return null;
    const norm = normalizeIdbPhotoValue(raw);
    if (!norm) return null;
    if (norm.kind === 'blob' || norm.kind === 'buffer') {
        const blob = norm.kind === 'blob' ? norm.value : new Blob([norm.value], { type: 'image/jpeg' });
        revokePhotoObjectUrl(photoId);
        const url = URL.createObjectURL(blob);
        photoObjectUrls.set(photoId, url);
        return url;
    }
    // Legado data URL → migra para Blob em idle (sem bloquear UI)
    if (norm.kind === 'dataurl') {
        const migrate = () => {
            dataUrlToBlob(norm.value).then((blob) => idbPutPhoto(photoId, blob)).catch(() => {});
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(migrate, { timeout: 5000 });
        else setTimeout(migrate, 800);
        return norm.value;
    }
    return null;
}
export async function idbDeletePhoto(photoId) {
    revokePhotoObjectUrl(photoId);
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite');
        tx.objectStore('photos').delete(photoDbKey(photoId));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

export async function idbGetAllPhotoKeys() {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readonly');
        const req = tx.objectStore('photos').getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

export { DEFAULT_FINISHED_PHOTO_TTL_DAYS };

/**
 * Apaga do IndexedDB chaves do uid que não estão em keepPhotoIds
 * (órfãs + fotos de histórico/rota finalizada além do TTL).
 * @param {{ uid: string, keepPhotoIds: Set<string>|string[] }} opts
 * @returns {Promise<number>} quantidade removida
 */
export async function purgeStalePhotos(opts) {
    const uid = opts && opts.uid != null ? String(opts.uid) : '';
    if (!uid) return 0;
    let keys;
    try {
        keys = await idbGetAllPhotoKeys();
    } catch (_) {
        return 0;
    }
    const toDelete = planIdbPhotoKeysToDelete({
        uid,
        allKeys: keys,
        keepPhotoIds: opts.keepPhotoIds || []
    });
    if (!toDelete.length) return 0;
    for (const key of toDelete) {
        const photoId = key.slice(String(uid).length + 2);
        if (photoId) revokePhotoObjectUrl(photoId);
    }
    const db = await openPhotoDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite');
        const store = tx.objectStore('photos');
        for (const key of toDelete) store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }).catch(() => {});
    return toDelete.length;
}

/** Agenda housekeeping em idle para não bloquear o boot. */
export function schedulePhotoHousekeeping(run) {
    const fn = typeof run === 'function' ? run : () => {};
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => { fn(); }, { timeout: 8000 });
    else setTimeout(() => { fn(); }, 2500);
}

/** Serializa captura/salvamento de fotos para evitar corrida e picos de memória. */
export function enqueuePhotoOp(fn) {
    const run = photoOpChain.then(() => fn(), () => fn());
    photoOpChain = run.catch(() => {});
    return run;
}

export function setPendingPhotoTarget(target) {
    try {
        sessionStorage.setItem(PHOTO_PENDING_KEY, JSON.stringify({ ...target, ts: Date.now() }));
    } catch (_) {}
}
export function clearPendingPhotoTarget() {
    try { sessionStorage.removeItem(PHOTO_PENDING_KEY); } catch (_) {}
}
export function getPendingPhotoTarget() {
    try {
        const raw = sessionStorage.getItem(PHOTO_PENDING_KEY);
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (!o || !o.ts || (Date.now() - o.ts) > 20 * 60 * 1000) {
            clearPendingPhotoTarget();
            return null;
        }
        return o;
    } catch (_) {
        return null;
    }
}

export function yieldToUiFrame() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
        else setTimeout(resolve, 0);
    });
}

async function compressBlobToJpegDataUrl(blob, maxSide = PHOTO_MAX_SIDE, quality = PHOTO_JPEG_QUALITY) {
    if (typeof createImageBitmap === 'function') {
        let bitmap = null;
        try {
            bitmap = await createImageBitmap(blob);
            const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
            const w = Math.max(1, Math.round(bitmap.width * scale));
            const h = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
            bitmap.close();
            bitmap = null;
            await yieldToUiFrame();
            return canvas.toDataURL('image/jpeg', quality);
        } catch (_) {
            if (bitmap) { try { bitmap.close(); } catch (__) {} }
        }
    }
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
                await yieldToUiFrame();
                resolve(canvas.toDataURL('image/jpeg', quality));
            } catch (e) {
                URL.revokeObjectURL(url);
                reject(e);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
        img.src = url;
    });
}

export function compressImageFile(file, maxSide = PHOTO_MAX_SIDE, quality = PHOTO_JPEG_QUALITY) {
    return compressBlobToJpegDataUrl(file, maxSide, quality);
}

export function compressDataUrl(dataUrl, maxSide = PHOTO_MAX_SIDE, quality = PHOTO_JPEG_QUALITY) {
    return fetch(dataUrl)
        .then((res) => res.blob())
        .then((blob) => compressBlobToJpegDataUrl(blob, maxSide, quality));
}
