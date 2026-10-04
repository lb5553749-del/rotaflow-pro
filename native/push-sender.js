/**
 * Cliente NÃO envia Web Push — a chave VAPID privada fica só nas Cloud Functions.
 * Avisos near / entregue / ausente: functions/onTrackNotify (Firestore).
 */
window.RotaFlowPush = {
  vapid: {
    publicKey: (typeof window !== 'undefined' && window.ROTAFLOW_VAPID_PUBLIC) || '',
    subject: 'mailto:rotaflow-83610@web.app'
  },
  async send() {
    // Intencionalmente vazio: push só via Cloud Functions.
    return { skipped: true, via: 'cloud-functions' };
  }
};
