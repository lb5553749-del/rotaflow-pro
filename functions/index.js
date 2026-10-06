'use strict';

/**
 * Web Push via VAPID — chave PRIVADA só no Secret Manager (nunca no APK / no repositório).
 *   firebase functions:secrets:set VAPID_PRIVATE_KEY
 * Emulador: functions/.secret.local com VAPID_PRIVATE_KEY=... (gitignored).
 * Trocar o par: `npx web-push generate-vapid-keys`, secrets:set da private, atualizar
 * VAPID_PUBLIC_KEY aqui + ROTAFLOW_VAPID_PUBLIC em firebase-config.js, redeploy functions+hosting
 * e pedir aos clientes para reativar notificações na página /r/.
 */
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const webpush = require('web-push');

initializeApp();

const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
/** Pública: a mesma de window.ROTAFLOW_VAPID_PUBLIC (firebase-config.js), usada no subscribe de track.html. */
const VAPID_PUBLIC_KEY = 'BIiR1NtrIOJXJmUAfA6H2xeuvPU0jKg583x47AqVAaPqss97NGc8XplQV-mf1uWzMvvTrmMgHtZXbKTxUFzLvWY';
const VAPID_SUBJECT = 'mailto:rotaflow-83610@web.app';

let vapidReady = false;
/** Secret só existe em runtime (dentro do handler), não no carregamento do módulo. */
function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.value());
  vapidReady = true;
}

const HOST = 'https://rotaflow-83610.web.app';

// Só o doc pai (eventos) dispara; a posição ao vivo vai em tracks/{token}/live/pos.
exports.onTrackNotify = onDocumentUpdated({ document: 'tracks/{token}', secrets: [VAPID_PRIVATE_KEY] }, async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  const token = event.params.token;
  const jobs = [];
  if (after.nearNotified === true && before.nearNotified !== true) {
    jobs.push(sendTrackPushes(event, token, {
      title: 'Sua entrega está chegando',
      body: 'O motorista está a cerca de 100 m.',
      tag: 'rf-near-' + token
    }));
  }
  if (after.status === 'entregue' && before.status !== 'entregue') {
    jobs.push(sendTrackPushes(event, token, {
      title: 'Sua encomenda foi entregue',
      body: 'O motorista confirmou a entrega.',
      tag: 'rf-delivered-' + token
    }));
  }
  if (after.failReason === 'ausente' && before.failReason !== 'ausente') {
    jobs.push(sendTrackPushes(event, token, {
      title: 'Cliente ausente',
      body: 'O motorista passou no endereço e não havia ninguém para receber.',
      tag: 'rf-absent-' + token
    }));
  }
  await Promise.all(jobs);
});

/** Tracks sem expiresAt (versões antigas do app) saem após este prazo sem atualização. */
const LEGACY_TRACK_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const CLEANUP_PAGE = 200;
const CLEANUP_MAX_PAGES = 10;

/**
 * LGPD: apaga tracks expirados junto com live/ e subs/ (recursiveDelete).
 * TTL nativo do Firestore não serve aqui: apagaria só o doc pai e deixaria
 * subs/ (endpoint + chaves de push do cliente) órfãs.
 */
exports.cleanupExpiredTracks = onSchedule({ schedule: 'every 6 hours', timeZone: 'America/Porto_Velho' }, async () => {
  const db = getFirestore();
  const now = Date.now();
  let deleted = 0;

  for (let page = 0; page < CLEANUP_MAX_PAGES; page++) {
    const snap = await db.collection('tracks')
      .where('expiresAt', '<=', Timestamp.fromMillis(now))
      .limit(CLEANUP_PAGE)
      .get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      await db.recursiveDelete(doc.ref);
      deleted++;
    }
    if (snap.size < CLEANUP_PAGE) break;
  }

  for (let page = 0; page < CLEANUP_MAX_PAGES; page++) {
    const snap = await db.collection('tracks')
      .where('updatedAt', '<', now - LEGACY_TRACK_MAX_AGE_MS)
      .limit(CLEANUP_PAGE)
      .get();
    if (snap.empty) break;
    let removedHere = 0;
    for (const doc of snap.docs) {
      const exp = doc.get('expiresAt');
      if (exp && exp.toMillis() > now) continue;
      await db.recursiveDelete(doc.ref);
      removedHere++;
      deleted++;
    }
    if (snap.size < CLEANUP_PAGE || removedHere === 0) break;
  }

  console.log('cleanupExpiredTracks', { deleted });
});

async function sendTrackPushes(event, token, extra) {
  const snap = await event.data.after.ref.collection('subs').get();
  if (snap.empty) return;
  ensureVapid();
  const payload = JSON.stringify(Object.assign({
    url: `${HOST}/r/${token}`,
    silent: false,
    sound: `${HOST}/track-notify.wav?v=campainha`,
    icon: `${HOST}/track-icon-192.png`,
    badge: `${HOST}/track-badge-96.png`,
    image: `${HOST}/track-notify-banner.png`
  }, extra));

  await Promise.all(snap.docs.map(async (doc) => {
    const d = doc.data() || {};
    if (!d.endpoint || !d.keys || !d.keys.p256dh || !d.keys.auth) return;
    try {
      await webpush.sendNotification({
        endpoint: d.endpoint,
        keys: { p256dh: d.keys.p256dh, auth: d.keys.auth }
      }, payload);
    } catch (err) {
      const code = err && (err.statusCode || err.status);
      if (code === 404 || code === 410) {
        await doc.ref.delete().catch(() => {});
      }
    }
  }));
}
