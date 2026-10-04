'use strict';

/**
 * Web Push via VAPID — chave PRIVADA só aqui (nunca no APK / push-sender).
 * Se a private já entrou em APKs antigos: rode `npx web-push generate-vapid-keys`,
 * atualize functions/vapid-private.json + firebase-config.js (só public) + track.html,
 * redeploy functions, e peça aos clientes para reativar notificações na página /r/.
 */
const { initializeApp } = require('firebase-admin/app');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const webpush = require('web-push');
const vapid = require('./vapid-private.json');

initializeApp();
webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

const HOST = 'https://rotaflow-83610.web.app';

exports.onTrackNotify = onDocumentUpdated('tracks/{token}', async (event) => {
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

async function sendTrackPushes(event, token, extra) {
  const snap = await event.data.after.ref.collection('subs').get();
  if (snap.empty) return;
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
