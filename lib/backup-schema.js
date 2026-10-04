'use strict';

/**
 * Shape checks for JSON backups before restoreData assigns them.
 */

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeCoord(n) {
  if (n == null || n === '') return undefined;
  const num = Number(n);
  return Number.isFinite(num) ? num : undefined;
}

function sanitizeDeliveryLike(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.id == null && raw.agendaId == null) return null;
  const item = { ...raw };
  if (typeof item.nome !== 'string') item.nome = String(item.nome || '');
  if (typeof item.endereco !== 'string') item.endereco = String(item.endereco || '');
  if (typeof item.sequentialId === 'string') item.sequentialId = item.sequentialId.slice(0, 32);
  else if (item.sequentialId != null) item.sequentialId = String(item.sequentialId).slice(0, 32);
  const allowedStatus = ['pendente', 'em-rota', 'entregue', 'falhou'];
  if (typeof item.status !== 'string' || allowedStatus.indexOf(item.status) === -1) {
    item.status = 'pendente';
  }
  const lat = sanitizeCoord(item.lat);
  const lng = sanitizeCoord(item.lng);
  if (lat != null) item.lat = lat;
  if (lng != null) item.lng = lng;
  if (!Array.isArray(item.telefones)) item.telefones = [];
  if (!Array.isArray(item.photos)) item.photos = [];
  if (!Array.isArray(item.photoIds)) item.photoIds = [];
  if (item.notes == null) item.notes = '';
  else item.notes = String(item.notes);
  if (item.pacotes === undefined) item.pacotes = 1;
  item.favorito = !!item.favorito;
  return item;
}

function sanitizeUserProfile(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    motorista: String(raw.motorista || 'Motorista').slice(0, 80),
    empresa: String(raw.empresa || '').slice(0, 80),
    mensagemPadrao: typeof raw.mensagemPadrao === 'string' ? raw.mensagemPadrao.slice(0, 2000) : undefined
  };
}

/**
 * @param {any} data
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
function parseBackupPayload(data) {
  if (!isPlainObject(data)) return { ok: false, error: 'Formato inválido' };
  if (!Array.isArray(data.agenda)) return { ok: false, error: 'Formato inválido' };
  if (!Array.isArray(data.deliveries) && !Array.isArray(data.routes)) {
    return { ok: false, error: 'Formato inválido' };
  }
  const agenda = data.agenda.map(sanitizeDeliveryLike).filter(Boolean);
  const deliveries = Array.isArray(data.deliveries)
    ? data.deliveries.map(sanitizeDeliveryLike).filter(Boolean)
    : undefined;
  const routes = Array.isArray(data.routes)
    ? data.routes.filter(isPlainObject).map((r) => ({
      ...r,
      id: String(r.id || ''),
      name: String(r.name || 'Rota 1'),
      deliveries: Array.isArray(r.deliveries)
        ? r.deliveries.map(sanitizeDeliveryLike).filter(Boolean)
        : []
    })).filter((r) => r.id)
    : undefined;
  const userProfile = data.userProfile ? sanitizeUserProfile(data.userProfile) : undefined;
  return {
    ok: true,
    data: {
      version: data.version,
      exportedAt: data.exportedAt,
      agenda,
      deliveries,
      routes,
      activeRouteId: data.activeRouteId != null ? String(data.activeRouteId) : undefined,
      nextSequenceNumber: Number(data.nextSequenceNumber) || 1,
      nextAgendaId: Number(data.nextAgendaId) || 1,
      userProfile
    }
  };
}

function parseAgendaBackup(data) {
  if (!isPlainObject(data) || !Array.isArray(data.agenda)) {
    return { ok: false, error: 'Formato inválido' };
  }
  return {
    ok: true,
    data: {
      agenda: data.agenda.map(sanitizeDeliveryLike).filter(Boolean),
      nextAgendaId: Number(data.nextAgendaId) || 1
    }
  };
}

module.exports = {
  sanitizeDeliveryLike,
  sanitizeUserProfile,
  parseBackupPayload,
  parseAgendaBackup
};
