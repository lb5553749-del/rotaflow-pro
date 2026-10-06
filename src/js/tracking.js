/**
 * Rastreio público do cliente (Firestore tracks/{token} + tracks/{token}/live/pos).
 * main.js injeta estado, persistência e UI via configureTracking().
 */
import { loadFirebaseSdk, ensureAnonUser } from './firebase-loader.js';
import {
    TRACK_NEAR_METERS,
    TRACK_NEAR_KM,
    publicFirstName,
    trackStatusFor,
    stripTrackEtaFields,
    buildTrackPayload as buildTrackPayloadFromSchema,
    isWithinNearKm,
    trackExpiresAtMs,
    splitTrackPayload,
    trackEventSignature,
    TRACK_LIVE_DOC_ID,
    shouldPublishTrack as shouldPublishTrackPure
} from '../../lib/track-schema.js';

let deps = {
    isNativeApp: () => false,
    getDeliveries: () => [],
    getUserProfile: () => ({}),
    getStartPoint: () => null,
    getGpsAccuracyMeters: () => 0,
    getGpsEnabled: () => false,
    getRouteActive: () => false,
    getRouteMetrics: () => null,
    pendingStops: () => [],
    isActiveStop: () => false,
    estimateStopEta: () => null,
    saveStorage: () => {},
    showToast: () => {},
    showChoiceModal: async () => null,
    formatPhoneShort: (p) => p,
    openWhatsAppChat: async () => false,
    buildDeliveryWhatsAppMessage: () => '',
    syncBackgroundGpsTargets: () => {},
    isBgGpsStarted: () => false,
    playNearHaptic: null
};

export function configureTracking(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export {
    TRACK_NEAR_METERS,
    TRACK_NEAR_KM,
    publicFirstName,
    trackStatusFor,
    stripTrackEtaFields,
    isWithinNearKm
};

let trackDb = null;
let trackDbPromise = null;
let trackUid = '';
/** token → { sig, at } do último doc de evento gravado nesta sessão. */
const lastTrackEventWrite = new Map();
/** Renova expiresAt do doc pai em rota longa sem mudança de evento (retenção ativa = 48h). */
const TRACK_EVENT_REFRESH_MS = 6 * 60 * 60 * 1000;
let lastTrackPublishAt = 0;
let lastTrackPublishPos = null;
let lastPublishedTrackRouteSig = '';

function payloadCtx() {
    return {
        motorista: deps.getUserProfile() && deps.getUserProfile().motorista,
        pendingStops: deps.pendingStops(),
        estimateStopEta: deps.estimateStopEta,
        startPoint: deps.getStartPoint(),
        gpsAccuracyMeters: deps.getGpsAccuracyMeters()
    };
}

export function buildTrackPayload(delivery, extras) {
    return buildTrackPayloadFromSchema(delivery, extras, payloadCtx());
}

export function newTrackToken() {
    const bytes = new Uint8Array(16);
    const cryptoObj = window.crypto || window.msCrypto;
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function trackingPublicBase() {
    const hosted = window.ROTAFLOW_TRACK_HOST || 'https://rotaflow-83610.web.app';
    try {
        if (!deps.isNativeApp() && /^https?:$/.test(location.protocol)
            && location.hostname && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            return location.origin;
        }
    } catch (e) {}
    return hosted;
}

export function trackingUrl(token) {
    return `${trackingPublicBase()}/r/${token}`;
}

/** Rules exigem request.auth.uid == ownerUid; sem login anônimo nenhum rastreio é publicado. */
export async function ensureFirebaseTrack() {
    if (trackDb && trackUid) return trackDb;
    if (!trackDbPromise) {
        trackDbPromise = loadFirebaseSdk(['auth', 'firestore'])
            .then(async (fb) => {
                const user = await ensureAnonUser();
                if (!user || !user.uid) throw new Error('track-auth');
                trackUid = user.uid;
                trackDb = fb.firestore();
                trackDbPromise = null;
                return trackDb;
            })
            .catch((err) => {
                trackDbPromise = null;
                throw err;
            });
    }
    return trackDbPromise;
}

export function trackRoutePublishSignature() {
    const pending = deps.pendingStops();
    const routeActive = deps.getRouteActive && deps.getRouteActive();
    const routeMetrics = deps.getRouteMetrics && deps.getRouteMetrics();
    if (routeActive && routeMetrics && routeMetrics.signature) return routeMetrics.signature;
    return 'idle|' + pending.map((d) => d.id).join('>');
}

export async function refreshActiveTrackSessions(opts) {
    const force = !!(opts && opts.force);
    const sig = trackRoutePublishSignature();
    if (!force && sig === lastPublishedTrackRouteSig) {
        deps.syncBackgroundGpsTargets();
        return false;
    }
    deps.syncBackgroundGpsTargets();
    const targets = deps.getDeliveries().filter((d) => d.trackToken && deps.isActiveStop(d));
    if (!targets.length) {
        lastPublishedTrackRouteSig = sig;
        return false;
    }
    try {
        const db = await ensureFirebaseTrack();
        const pos = (opts && opts.pos) || deps.getStartPoint();
        const payloads = targets.map((delivery) => ({
            token: delivery.trackToken,
            payload: buildTrackPayload(delivery, pos ? { pos } : null)
        }));
        const results = await Promise.allSettled(payloads.map(({ token, payload }) => setTrackDoc(db, token, payload)));
        if (!results.some((r) => r.status === 'fulfilled')) throw results[0].reason;
        lastPublishedTrackRouteSig = sig;
        lastTrackPublishAt = Date.now();
        if (pos && typeof pos.lat === 'number') lastTrackPublishPos = pos;
        return true;
    } catch (err) {
        console.warn('track refresh', err);
        return false;
    }
}

function expiresAtFor(status) {
    return firebase.firestore.Timestamp.fromMillis(trackExpiresAtMs(status, Date.now()));
}

/**
 * Cada token é escrito à parte: um track legado (sem ownerUid, imutável nas rules) não derruba os demais.
 * O doc pai só é reescrito quando um campo de evento muda (cada update dispara onTrackNotify) ou para
 * renovar expiresAt; posição/ETA vão sempre para live/pos. O pai vai antes: a rule de create do live
 * confere o ownerUid dele.
 */
async function setTrackDoc(db, token, payload) {
    const { event, live } = splitTrackPayload(payload);
    const ref = db.collection('tracks').doc(token);
    const expiresAt = expiresAtFor(event.status);
    const sig = trackEventSignature(event);
    const now = Date.now();
    const prev = lastTrackEventWrite.get(token);
    if (!prev || prev.sig !== sig || now - prev.at >= TRACK_EVENT_REFRESH_MS) {
        await ref.set({ ...event, ownerUid: trackUid, expiresAt }, { merge: true });
        lastTrackEventWrite.set(token, { sig, at: now });
    }
    await ref.collection('live').doc(TRACK_LIVE_DOC_ID).set({ ...live, ownerUid: trackUid, expiresAt }, { merge: true });
}

export async function writeTrackDoc(token, payload) {
    const db = await ensureFirebaseTrack();
    await setTrackDoc(db, token, payload);
}

/** Tokens de antes do ownerUid ficaram imutáveis nas rules: ao compartilhar de novo, gera outro. */
const TRACK_TOKEN_VERSION = 2;

export function prepareTrackingUrl(delivery) {
    if (!delivery || typeof delivery.lat !== 'number' || typeof delivery.lng !== 'number') return null;
    if (!delivery.trackToken || delivery.trackTokenV !== TRACK_TOKEN_VERSION) {
        delivery.trackToken = newTrackToken();
        delivery.trackTokenV = TRACK_TOKEN_VERSION;
        deps.saveStorage();
        deps.syncBackgroundGpsTargets();
    }
    return trackingUrl(delivery.trackToken);
}

export function publishTrackingSession(delivery) {
    if (!delivery || !delivery.trackToken) return Promise.resolve(false);
    return writeTrackDoc(delivery.trackToken, buildTrackPayload(delivery))
        .then(() => true)
        .catch((err) => {
            console.warn('track publish', err);
            return false;
        });
}

export async function syncTrackingStatus(delivery, statusOverride) {
    if (!delivery || !delivery.trackToken) return;
    try {
        await writeTrackDoc(delivery.trackToken, buildTrackPayload(delivery, { status: statusOverride }));
    } catch (err) {
        console.warn('track sync', err);
    }
}

export async function closeTrackingSession(delivery, status) {
    if (!delivery || !delivery.trackToken) return;
    try {
        await writeTrackDoc(delivery.trackToken, buildTrackPayload(delivery, { status: status || 'encerrado' }));
    } catch (err) {
        console.warn('track close', err);
    }
}

export function maybeMarkNearCustomer(delivery, pos, opts) {
    if (!delivery || delivery.nearNotified || !deps.isActiveStop(delivery)) return false;
    if (!isWithinNearKm(delivery, pos)) return false;
    delivery.nearNotified = true;
    deps.saveStorage();
    deps.showToast(`A ~${TRACK_NEAR_METERS} m de ${delivery.sequentialId} — aviso enviado ao cliente`);
    try {
        if (typeof deps.playNearHaptic === 'function') deps.playNearHaptic();
    } catch (_) {}
    syncTrackingStatus(delivery).catch(() => {});
    if (!(opts && opts.skipPush)) sendNearPush(delivery);
    return true;
}

function trackPushAssets() {
    const host = 'https://rotaflow-83610.web.app';
    return {
        silent: false,
        sound: host + '/track-notify.wav?v=campainha',
        icon: host + '/track-icon-192.png',
        badge: host + '/track-badge-96.png',
        image: host + '/track-notify-banner.png'
    };
}

export async function sendTrackPush(delivery, extra) {
    if (!delivery || !delivery.trackToken) return;
    try {
        if (window.RotaFlowPush && typeof window.RotaFlowPush.send === 'function') {
            await window.RotaFlowPush.send(null, Object.assign({
                url: trackingUrl(delivery.trackToken)
            }, trackPushAssets(), extra || {}));
        }
    } catch (err) {
        console.warn('push track', err);
    }
}

export async function sendNearPush(delivery) {
    return sendTrackPush(delivery, {
        title: 'Sua entrega está chegando',
        body: `O motorista está a cerca de ${TRACK_NEAR_METERS} m.`,
        tag: 'rf-near-' + delivery.trackToken,
        kind: 'near'
    });
}

export function sendDeliveredPush(delivery) {
    if (!delivery || !delivery.trackToken || delivery.deliveredNotified) return;
    delivery.deliveredNotified = true;
    deps.saveStorage();
    syncTrackingStatus(delivery);
    sendTrackPush(delivery, {
        title: 'Sua encomenda foi entregue',
        body: 'O motorista confirmou a entrega.',
        tag: 'rf-delivered-' + delivery.trackToken,
        kind: 'delivered',
        actionTitle: 'Abrir'
    });
}

export function sendAbsentPush(delivery) {
    if (!delivery || !delivery.trackToken || delivery.failReason !== 'ausente' || delivery.absentNotified) return;
    delivery.absentNotified = true;
    deps.saveStorage();
    syncTrackingStatus(delivery);
    sendTrackPush(delivery, {
        title: 'Cliente ausente',
        body: 'O motorista passou no endereço e não havia ninguém para receber.',
        tag: 'rf-absent-' + delivery.trackToken,
        kind: 'absent',
        actionTitle: 'Abrir'
    });
}

export function shouldPublishTrack(pos) {
    return shouldPublishTrackPure(pos, lastTrackPublishPos, lastTrackPublishAt, Date.now());
}

export function publishDriverGpsFromWatch(position) {
    if (!deps.getGpsEnabled || !deps.getGpsEnabled()) return;
    if (!position || !position.coords) return;
    const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
    const targets = deps.getDeliveries().filter((d) => d.trackToken && deps.isActiveStop(d));
    if (!targets.length) return;
    const becomingNear = targets.some((d) => !d.nearNotified && isWithinNearKm(d, pos));
    if (!shouldPublishTrack(pos) && !becomingNear) return;
    lastTrackPublishAt = Date.now();
    lastTrackPublishPos = pos;
    ensureFirebaseTrack().then((db) => Promise.all(targets.map((delivery) => {
        const becameNear = maybeMarkNearCustomer(delivery, pos, { skipPush: deps.isBgGpsStarted() });
        const payload = buildTrackPayload(delivery, { pos });
        if (becameNear) payload.nearNotified = true;
        return setTrackDoc(db, delivery.trackToken, payload)
            .catch((err) => console.warn('track publish', delivery.trackToken.slice(0, 6), err));
    }))).catch((err) => {
        console.warn('track publish', err);
    });
}

export async function pickDeliveryPhone(delivery) {
    if (!delivery || !delivery.telefones || !delivery.telefones.length) return null;
    if (delivery.telefones.length === 1) return delivery.telefones[0];
    return deps.showChoiceModal({
        title: 'WhatsApp',
        message: 'Selecione o número do cliente:',
        options: delivery.telefones.map((p) => ({
            label: (p.label ? p.label + ' · ' : '') + deps.formatPhoneShort(p.numero),
            value: p,
            icon: 'fab fa-whatsapp',
            iconColor: '#25D366'
        }))
    });
}

export async function openWhatsAppToDelivery(delivery, msg) {
    const phone = await pickDeliveryPhone(delivery);
    if (!phone) {
        deps.showToast('Cadastre o telefone do cliente para enviar o rastreio', true);
        return false;
    }
    const opened = await deps.openWhatsAppChat(phone.numero, msg);
    if (!opened) {
        deps.showToast('Não foi possível abrir o WhatsApp', true);
        return false;
    }
    return true;
}

export async function shareTrackingLink(delivery) {
    const url = prepareTrackingUrl(delivery);
    if (!url) {
        deps.showToast('Não foi possível criar o link de rastreio', true);
        return;
    }
    publishTrackingSession(delivery).then((ok) => {
        if (!ok) deps.showToast('Link enviado. Se o mapa do cliente falhar, tente de novo com internet', true);
    });
    if (!deps.getGpsEnabled || !deps.getGpsEnabled() || !deps.getStartPoint()) {
        deps.showToast('Link pronto. Ligue o GPS para o cliente ver você no mapa');
    }
    const nome = publicFirstName(delivery.nome, 'cliente');
    const msg = deps.buildDeliveryWhatsAppMessage(delivery, { nome, trackUrl: url });
    if (delivery.telefones && delivery.telefones.length) {
        await openWhatsAppToDelivery(delivery, msg);
        return;
    }
    try {
        if (deps.isNativeApp() && window.RotaFlowCap && window.RotaFlowCap.Share) {
            await window.RotaFlowCap.Share.share({
                title: 'Rastreio RotaFlow',
                text: msg,
                url,
                dialogTitle: 'Compartilhar rastreio'
            });
            return;
        }
        if (navigator.share) {
            await navigator.share({ title: 'Rastreio RotaFlow', text: msg, url });
            return;
        }
    } catch (err) {
        if (err && (err.name === 'AbortError' || /cancel/i.test(err.message || ''))) return;
    }
    try {
        await navigator.clipboard.writeText(url);
        deps.showToast('Sem telefone salvo — link de rastreio copiado');
    } catch (e) {
        deps.showToast(url);
    }
}
