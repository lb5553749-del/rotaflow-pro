/**
 * Firebase JS SDK (compat) sob demanda — nada é baixado no boot.
 * Só rastreio (Firestore), auth anônima e backup na nuvem chamam isto.
 * Crashlytics é plugin nativo (native/bridge.js) e não depende deste SDK.
 */
const FIREBASE_SDK_BASE = 'https://www.gstatic.com/firebasejs/11.6.0/';
/** Após falha de rede, espera antes de tentar baixar o SDK de novo (evita martelar offline). */
const FIREBASE_RETRY_MS = 20 * 1000;

const scriptPromises = new Map();
let lastFailAt = 0;

function loadScriptOnce(src) {
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const p = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => {
            el.remove();
            scriptPromises.delete(src);
            reject(new Error('firebase-sdk-load'));
        };
        document.head.appendChild(el);
    });
    scriptPromises.set(src, p);
    return p;
}

/**
 * @param {Array<'auth'|'firestore'|'storage'>} modules
 * @returns {Promise<any>} o global `firebase` já inicializado
 */
export async function loadFirebaseSdk(modules = []) {
    if (!window.ROTAFLOW_FIREBASE) throw new Error('firebase-missing');
    const ready = () => typeof firebase !== 'undefined'
        && modules.every((m) => typeof firebase[m] === 'function');
    if (!ready()) {
        if (lastFailAt && Date.now() - lastFailAt < FIREBASE_RETRY_MS) throw new Error('firebase-offline');
        try {
            await loadScriptOnce(FIREBASE_SDK_BASE + 'firebase-app-compat.js');
            await Promise.all(modules.map((m) => loadScriptOnce(`${FIREBASE_SDK_BASE}firebase-${m}-compat.js`)));
        } catch (err) {
            lastFailAt = Date.now();
            throw err;
        }
        if (typeof firebase === 'undefined') throw new Error('firebase-missing');
    }
    if (!firebase.apps.length) firebase.initializeApp(window.ROTAFLOW_FIREBASE);
    return firebase;
}
