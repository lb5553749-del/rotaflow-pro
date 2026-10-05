/**
 * Orquestração de captura multi-foto (nativo CameraX vs getUserMedia web)
 * e fallback single-shot / file input. Persistência IDB fica em photo-store + main.
 */
import {
    isPhotoPickCancelled,
    clampMaxPhotos,
    canUseNativeMultiCamera as canUseNativeMultiCameraOf,
    canUseGetUserMediaMulti as canUseGetUserMediaMultiOf,
    canUseInAppMultiCamera as canUseInAppMultiCameraOf,
    isCameraPermissionGranted,
    multicamFrameSize,
    filePickLimit
} from '../../lib/camera-helpers.js';
import {
    PHOTO_MULTICAM_MAX_SIDE,
    PHOTO_MULTICAM_JPEG_QUALITY,
    PHOTO_MAX_PER_ITEM,
    enqueuePhotoOp,
    setPendingPhotoTarget,
    clearPendingPhotoTarget,
    yieldToUiFrame,
    compressImageFile,
    compressDataUrl
} from './photo-store.js';

let deps = {
    isNativeApp: () => false,
    persistStorageNow: () => false,
    recoverUiAfterResume: () => {},
    showToast: () => {}
};

export function configureCamera(opts) {
    deps = { ...deps, ...(opts || {}) };
}

function cameraCapabilityCtx() {
    try {
        return {
            isNative: deps.isNativeApp(),
            hasOpenMultiCamera: !!(window.RotaFlowCap
                && typeof window.RotaFlowCap.openMultiCamera === 'function'),
            hasGetUserMedia: !!(navigator.mediaDevices
                && typeof navigator.mediaDevices.getUserMedia === 'function')
        };
    } catch (_) {
        return { isNative: false, hasOpenMultiCamera: false, hasGetUserMedia: false };
    }
}

export function canUseNativeMultiCamera() {
    return canUseNativeMultiCameraOf(cameraCapabilityCtx());
}

export function canUseGetUserMediaMulti() {
    return canUseGetUserMediaMultiOf(cameraCapabilityCtx());
}

export function canUseInAppMultiCamera() {
    return canUseInAppMultiCameraOf(cameraCapabilityCtx());
}

async function ensureNativeCameraPermission() {
    const Cam = window.RotaFlowCap && window.RotaFlowCap.Camera;
    if (!Cam || typeof Cam.requestPermissions !== 'function') return true;
    try {
        const cur = typeof Cam.checkPermissions === 'function' ? await Cam.checkPermissions() : null;
        if (isCameraPermissionGranted(cur)) return true;
        const next = await Cam.requestPermissions({ permissions: ['camera'] });
        return isCameraPermissionGranted(next);
    } catch (e) {
        console.warn('camera permission', e);
        return false;
    }
}

/**
 * Captura um frame do <video> já no tamanho final (JPEG), sem data URL gigante.
 * @param {HTMLVideoElement} video
 * @returns {Promise<string|null>}
 */
async function captureVideoFrameToJpegDataUrl(video) {
    const size = multicamFrameSize(video.videoWidth, video.videoHeight, PHOTO_MULTICAM_MAX_SIDE);
    if (!size) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.getContext('2d').drawImage(video, 0, 0, size.w, size.h);
    await yieldToUiFrame();
    const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_MULTICAM_JPEG_QUALITY);
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl && dataUrl.startsWith('data:') ? dataUrl : null;
}

/**
 * Multi-foto no Android: Activity CameraX dedicada (não partilha surface com o mapa).
 * @param {{ maxPhotos?: number, onCapture?: function, onPhoto?: function }} opts
 * @returns {Promise<string[]>} fotos (vazio se cancelar)
 */
export async function openNativeMultiCameraCapture(opts = {}) {
    const maxPhotos = clampMaxPhotos(opts.maxPhotos, PHOTO_MAX_PER_ITEM);
    const ok = await ensureNativeCameraPermission();
    if (!ok) {
        deps.showToast('Permissão da câmera necessária', true);
        return [];
    }
    if (!window.RotaFlowCap || typeof window.RotaFlowCap.openMultiCamera !== 'function') {
        return [];
    }
    deps.showToast('Abrindo câmera…');
    // Bridge already compresses multi-cam to PHOTO_MULTICAM_* — do not recompress here.
    // onPhoto: anexar/guardar cada JPEG assim que ficar pronto (não só no buffer final).
    const multi = await window.RotaFlowCap.openMultiCamera({
        maxPhotos,
        onPhoto: typeof opts.onPhoto === 'function' ? opts.onPhoto : null
    });
    try { deps.recoverUiAfterResume(); } catch (_) {}
    const list = Array.isArray(multi) ? multi : [];
    if (list.length && typeof opts.onCapture === 'function') {
        try { opts.onCapture(list[0], list.length); } catch (_) {}
    }
    return list;
}

/**
 * UI fullscreen web: várias fotos via getUserMedia (só PWA/browser — nunca no Android nativo).
 * @param {{ maxPhotos?: number, onCapture?: function }} opts
 * @returns {Promise<string[]|null>} array (incl. vazio se cancelar) ou null se preview indisponível
 */
export function openMultiCameraCapture(opts = {}) {
    const maxPhotos = clampMaxPhotos(opts.maxPhotos, PHOTO_MAX_PER_ITEM);
    return new Promise((resolve) => {
        let settled = false;
        let stream = null;
        const captured = [];
        const thumbUrls = [];

        const root = document.createElement('div');
        root.className = 'rf-multicam';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Câmera');
        root.innerHTML = `
            <div class="rf-multicam-video-wrap">
                <video playsinline muted autoplay></video>
                <div class="rf-multicam-flash" aria-hidden="true"></div>
                <div class="rf-multicam-top">
                    <button type="button" class="rf-multicam-cancel">Cancelar</button>
                    <span class="rf-multicam-count">0 fotos</span>
                </div>
            </div>
            <div class="rf-multicam-bottom">
                <div class="rf-multicam-side">
                    <div class="rf-multicam-thumbs" aria-live="polite"></div>
                </div>
                <button type="button" class="rf-multicam-shutter" aria-label="Disparar"></button>
                <div class="rf-multicam-side right">
                    <button type="button" class="rf-multicam-done" disabled>Concluir</button>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        const video = root.querySelector('video');
        const flash = root.querySelector('.rf-multicam-flash');
        const countEl = root.querySelector('.rf-multicam-count');
        const thumbsEl = root.querySelector('.rf-multicam-thumbs');
        const shutterBtn = root.querySelector('.rf-multicam-shutter');
        const doneBtn = root.querySelector('.rf-multicam-done');
        const cancelBtn = root.querySelector('.rf-multicam-cancel');

        const updateUi = () => {
            const n = captured.length;
            countEl.textContent = n === 1 ? '1 foto' : `${n} fotos`;
            doneBtn.disabled = n < 1;
            shutterBtn.disabled = n >= maxPhotos;
            if (n >= maxPhotos) {
                countEl.textContent = `${n} fotos (máx.)`;
            }
        };

        const cleanup = async () => {
            try {
                if (stream) stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
            } catch (_) {}
            stream = null;
            thumbUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
            thumbUrls.length = 0;
            try { root.remove(); } catch (_) {}
        };

        const finish = async (urls, unavailable) => {
            if (settled) return;
            settled = true;
            await cleanup();
            if (unavailable) resolve(null);
            else resolve(Array.isArray(urls) ? urls : []);
        };

        const appendThumb = async (dataUrl) => {
            try {
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                const tu = URL.createObjectURL(blob);
                thumbUrls.push(tu);
                const img = document.createElement('img');
                img.src = tu;
                img.alt = '';
                thumbsEl.appendChild(img);
                thumbsEl.scrollLeft = thumbsEl.scrollWidth;
            } catch (_) {}
        };

        let lastWebShutterAt = 0;
        let captureChain = Promise.resolve();
        const fireShutter = async () => {
            if (settled || shutterBtn.disabled || shutterBtn.classList.contains('busy')) return;
            const now = Date.now();
            if (now - lastWebShutterAt < 650) return;
            if (!video.videoWidth) {
                deps.showToast('Aguarde a câmera…', true);
                return;
            }
            lastWebShutterAt = now;
            shutterBtn.classList.add('busy');
            shutterBtn.disabled = true;
            doneBtn.disabled = true;
            flash.classList.add('on');
            setTimeout(() => flash.classList.remove('on'), 90);
            const op = (async () => {
                try {
                    const dataUrl = await enqueuePhotoOp(() => captureVideoFrameToJpegDataUrl(video));
                    if (!dataUrl) throw new Error('capture');
                    captured.push(dataUrl);
                    await appendThumb(dataUrl);
                    // Await: senão Concluir pode devolver a lista antes do onPhoto gravar → batch salva de novo.
                    if (typeof opts.onCapture === 'function') {
                        try { await opts.onCapture(dataUrl, captured.length); } catch (_) {}
                    }
                } catch (e) {
                    console.warn('multi cam capture', e);
                    deps.showToast('Não foi possível capturar', true);
                } finally {
                    shutterBtn.classList.remove('busy');
                    updateUi();
                }
            })();
            captureChain = captureChain.then(() => op, () => op);
            await op;
        };
        // Só pointerup dispara; click só engole o evento sintético (evita 2 disparos em alguns WebViews).
        shutterBtn.addEventListener('pointerup', (e) => {
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            fireShutter();
        });
        shutterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        cancelBtn.addEventListener('click', () => { finish([]); });
        doneBtn.addEventListener('click', async () => {
            doneBtn.disabled = true;
            try { await captureChain; } catch (_) {}
            if (settled) return;
            finish(captured.slice());
        });

        void (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1280 },
                        height: { ideal: 960 }
                    }
                });
                video.srcObject = stream;
                try { await video.play(); } catch (_) {}
                updateUi();
            } catch (e) {
                console.warn('multi-cam start', e);
                await finish(null, true);
            }
        })();
    });
}

/**
 * Câmera/galeria: multi-foto in-app (câmera) ou nativa/file (galeria / fallback).
 * @param {'camera'|'gallery'} mode
 * @param {{ multiple?: boolean, fileInput?: HTMLInputElement|null, pendingTarget?: object|null, alreadyCompressed?: boolean, onPreview?: (previewUrl: string)=>void, onPhoto?: (dataUrl: string, n: number, total?: number)=>void|Promise<void>, maxPhotos?: number }} opts
 * @returns {Promise<string[]>} data URLs JPEG
 */
export async function pickPhotoDataUrls(mode, opts = {}) {
    const { fileInput = null, pendingTarget = null, onPreview = null, onPhoto = null } = opts;
    const maxPhotos = clampMaxPhotos(
        opts.maxPhotos != null ? opts.maxPhotos : undefined,
        PHOTO_MAX_PER_ITEM,
        { multipleFallback: opts.multiple ? 12 : PHOTO_MAX_PER_ITEM }
    );
    if (pendingTarget) setPendingPhotoTarget(pendingTarget);
    // Não bloquear a abertura da câmera com flush síncrono do localStorage.
    // O alvo da foto já está em sessionStorage; o flush roda em seguida.
    setTimeout(() => { try { deps.persistStorageNow(); } catch (_) {} }, 0);

    // Preferência multi: Android = Activity CameraX própria (mapa nativo intacto).
    // Web = getUserMedia in-app. Nunca CameraPreview toBack com Google Maps nativo.
    if (mode === 'camera' && canUseInAppMultiCamera() && maxPhotos > 0) {
        try {
            if (canUseNativeMultiCamera()) {
                const multi = await openNativeMultiCameraCapture({
                    maxPhotos,
                    onPhoto,
                    onCapture: (dataUrl, n) => {
                        if (n === 1 && typeof onPreview === 'function') {
                            try { onPreview(dataUrl); } catch (_) {}
                        }
                    }
                });
                clearPendingPhotoTarget();
                return Array.isArray(multi) ? multi : [];
            }
            deps.showToast('Abrindo câmera…');
            const multi = await openMultiCameraCapture({
                maxPhotos,
                onCapture: async (dataUrl, n) => {
                    if (n === 1 && typeof onPreview === 'function') {
                        try { onPreview(dataUrl); } catch (_) {}
                    }
                    if (typeof onPhoto === 'function') {
                        try { await onPhoto(dataUrl, n); } catch (_) {}
                    }
                }
            });
            if (multi === null) {
                deps.showToast('Câmera multi indisponível — 1 foto', true);
                // fallback single-shot abaixo
            } else {
                clearPendingPhotoTarget();
                return multi;
            }
        } catch (e) {
            console.warn('multi camera', e);
            const msg = String(e?.message || e || '');
            if (msg.includes('multi-cam-compress-failed')) {
                deps.showToast('Não foi possível processar as fotos', true);
                clearPendingPhotoTarget();
                return [];
            }
            deps.showToast('Câmera multi indisponível — 1 foto', true);
        }
    }

    if (deps.isNativeApp() && window.RotaFlowCap) {
        try {
            deps.showToast(mode === 'gallery' ? 'Abrindo galeria…' : 'Abrindo câmera…');
            const source = mode === 'gallery' ? 'photos' : 'camera';
            let raw = null;
            // Preferir captura Uri rápida + compressão async (UI otimista via webPath).
            if (typeof window.RotaFlowCap.getPhotoCapture === 'function'
                && typeof window.RotaFlowCap.photoResultToDataUrl === 'function') {
                const photo = await window.RotaFlowCap.getPhotoCapture(source);
                clearPendingPhotoTarget();
                if (!photo) return [];
                if (photo.webPath && typeof onPreview === 'function') {
                    try { onPreview(photo.webPath); } catch (_) {}
                }
                raw = await enqueuePhotoOp(() => window.RotaFlowCap.photoResultToDataUrl(photo));
            } else if (typeof window.RotaFlowCap.getPhotoDataUrl === 'function') {
                raw = await window.RotaFlowCap.getPhotoDataUrl(source);
                clearPendingPhotoTarget();
            } else {
                raw = null;
                clearPendingPhotoTarget();
            }
            if (!raw) return [];
            if (typeof raw === 'string' && raw.startsWith('data:')) return [raw];
            deps.showToast('Otimizando foto…');
            return [await enqueuePhotoOp(() => compressDataUrl(raw))];
        } catch (e) {
            if (isPhotoPickCancelled(e)) {
                clearPendingPhotoTarget();
                return [];
            }
            console.warn('native photo', e);
            if (!fileInput) {
                clearPendingPhotoTarget();
                deps.showToast('Não foi possível abrir a câmera', true);
                return [];
            }
        }
    }
    if (!fileInput) {
        clearPendingPhotoTarget();
        return [];
    }
    return new Promise((resolve) => {
        const onChange = async () => {
            const files = fileInput.files ? Array.from(fileInput.files) : [];
            fileInput.value = '';
            clearPendingPhotoTarget();
            const out = [];
            const limit = filePickLimit(files.length, maxPhotos, !!opts.multiple);
            for (let i = 0; i < limit; i++) {
                const file = files[i];
                if (!file || !file.type.startsWith('image/')) continue;
                try {
                    if (i === 0 && typeof onPreview === 'function') {
                        try { onPreview(URL.createObjectURL(file)); } catch (_) {}
                    }
                    out.push(await enqueuePhotoOp(() => compressImageFile(file)));
                } catch (_) {}
            }
            resolve(out);
        };
        fileInput.addEventListener('change', onChange, { once: true });
        fileInput.click();
    });
}

export { isPhotoPickCancelled };
