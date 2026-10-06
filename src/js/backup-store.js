/**
 * Backup: metadados (lembrete/auto), cópia silenciosa no aparelho (Filesystem nativo ou IndexedDB)
 * e upload opcional para a nuvem (Firebase Storage, atrás de CLOUD_BACKUP_ENABLED).
 * Montar o JSON e a UI ficam em main.js; aqui não há estado de rota/agenda.
 */
import { loadFirebaseSdk, ensureAnonUser } from './firebase-loader.js';

let deps = {
    getUid: () => 'guest',
    storageKey: (base) => `rotaflow_${base}_guest`,
    isNativeApp: () => false
};

/** main.js injeta usuário atual, chave do localStorage e detecção de app nativo no boot. */
export function configureBackupStore(opts) {
    deps = { ...deps, ...(opts || {}) };
}

function currentUid() {
    return deps.getUid();
}
function storageKey(base) {
    return deps.storageKey(base);
}
function isNativeApp() {
    return deps.isNativeApp();
}

export const BACKUP_REMIND_DAYS = 7;
export const BACKUP_DISMISS_DAYS = 5;
export const BACKUP_AUTO_DELIVERIES = 5;
export const BACKUP_AUTO_IDLE_MS = 12 * 60 * 1000;
export const BACKUP_AUTO_MIN_GAP_MS = 30 * 60 * 1000;
const AUTO_BACKUP_PATH = 'rotaflow/backups/auto_latest.json';
// Flag única (firebase-config.js): Storage exige Blaze. Com false, nada sobe para a nuvem
// (sem upload, sem meta no Firestore, sem toasts de "nuvem"); só backup local/JSON.
export const CLOUD_BACKUP_ENABLED = window.ROTAFLOW_CLOUD_BACKUP_ENABLED === true;

export function readBackupMeta() {
    try {
        const raw = localStorage.getItem(storageKey('backup_meta'));
        if (!raw) {
            return {
                lastBackupAt: 0,
                lastDismissAt: 0,
                lastAutoAt: 0,
                lastCloudAt: 0,
                lastCloudOk: false,
                lastCloudError: '',
                dayKey: '',
                deliveriesSinceBackup: 0
            };
        }
        const parsed = JSON.parse(raw);
        return {
            lastBackupAt: Number(parsed.lastBackupAt) || 0,
            lastDismissAt: Number(parsed.lastDismissAt) || 0,
            lastAutoAt: Number(parsed.lastAutoAt) || 0,
            lastCloudAt: Number(parsed.lastCloudAt) || 0,
            lastCloudOk: !!parsed.lastCloudOk,
            lastCloudError: String(parsed.lastCloudError || ''),
            dayKey: String(parsed.dayKey || ''),
            deliveriesSinceBackup: Number(parsed.deliveriesSinceBackup) || 0
        };
    } catch (_) {
        return {
            lastBackupAt: 0,
            lastDismissAt: 0,
            lastAutoAt: 0,
            lastCloudAt: 0,
            lastCloudOk: false,
            lastCloudError: '',
            dayKey: '',
            deliveriesSinceBackup: 0
        };
    }
}

export function writeBackupMeta(patch) {
    const cur = readBackupMeta();
    const next = { ...cur, ...patch };
    try {
        localStorage.setItem(storageKey('backup_meta'), JSON.stringify(next));
    } catch (e) {
        console.warn('backup meta', e);
    }
    return next;
}

export function daysSince(ts) {
    if (!ts) return Infinity;
    return (Date.now() - ts) / (1000 * 60 * 60 * 24);
}

export function todayBackupDayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

let backupIdbPromise = null;
function openBackupDb() {
    if (backupIdbPromise) return backupIdbPromise;
    backupIdbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('rotaflow_backups_v1', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('auto')) db.createObjectStore('auto');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
            backupIdbPromise = null;
            reject(req.error);
        };
    });
    return backupIdbPromise;
}

async function idbPutAutoBackup(json) {
    const db = await openBackupDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('auto', 'readwrite');
        tx.objectStore('auto').put({
            json,
            updatedAt: Date.now(),
            uid: currentUid()
        }, currentUid());
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

export async function writeSilentLocalBackup(json) {
    const text = typeof json === 'string' ? json : JSON.stringify(json);
    // Native: pasta de dados do app (sem diálogo de partilha).
    try {
        if (isNativeApp() && window.RotaFlowCap && window.RotaFlowCap.Filesystem) {
            const FS = window.RotaFlowCap.Filesystem;
            const Dir = window.RotaFlowCap.Directory;
            const Enc = window.RotaFlowCap.Encoding;
            await FS.writeFile({
                path: AUTO_BACKUP_PATH,
                data: text,
                directory: Dir.Data,
                encoding: Enc.UTF8,
                recursive: true
            });
            await idbPutAutoBackup(text).catch(() => {});
            return { ok: true, where: 'device' };
        }
    } catch (e) {
        console.warn('auto backup filesystem', e);
    }
    // Web / fallback: IndexedDB
    try {
        await idbPutAutoBackup(text);
        return { ok: true, where: 'idb' };
    } catch (e) {
        console.warn('auto backup idb', e);
        return { ok: false, where: 'none' };
    }
}

export function ensureFirebaseAnonAuth() {
    return ensureAnonUser();
}

export async function uploadCloudBackup(json) {
    if (!CLOUD_BACKUP_ENABLED) return { ok: false, error: 'disabled' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return { ok: false, error: 'offline' };
    }
    let fb;
    try {
        fb = await loadFirebaseSdk(['auth', 'storage', 'firestore']);
    } catch (_) {
        return { ok: false, error: 'storage-missing' };
    }
    if (!fb.storage) return { ok: false, error: 'storage-missing' };
    try {
        const user = await ensureFirebaseAnonAuth();
        const text = typeof json === 'string' ? json : JSON.stringify(json);
        const ref = fb.storage().ref('users/' + user.uid + '/backups/latest.json');
        await ref.putString(text, 'raw', { contentType: 'application/json' });
        try {
            const db = fb.firestore();
            await db.collection('users').doc(user.uid).collection('meta').doc('backup').set({
                updatedAt: Date.now(),
                localUid: currentUid(),
                bytes: text.length,
                source: 'rotaflow'
            }, { merge: true });
        } catch (_) {}
        return { ok: true, uid: user.uid };
    } catch (err) {
        const msg = String((err && err.message) || err || 'cloud-fail');
        console.warn('cloud backup', err);
        return { ok: false, error: msg.slice(0, 120) };
    }
}
