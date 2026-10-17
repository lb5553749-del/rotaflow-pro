'use strict';

/**
 * Pure helpers for delivery/agenda list rendering (status, filter, HTML rows,
 * virtual scroll window). No DOM.
 */

const { escapeHtml } = require('./html.js');
const { formatPhoneShort } = require('./phone-helpers.js');
const { formatKm, formatDuration } = require('./track-schema.js');

const FAIL_REASON_LABELS = {
  ausente: 'Ausente',
  'endereco-errado': 'Endereço errado',
  recusou: 'Recusou',
  'voltar-depois': 'Voltar depois'
};

const FAIL_REASON_OPTIONS = [
  { id: 'ausente', label: 'Ausente', icon: 'fas fa-house-user', iconColor: '#ea580c' },
  { id: 'endereco-errado', label: 'Endereço errado', icon: 'fas fa-map-location-dot', iconColor: '#ea580c' },
  { id: 'recusou', label: 'Recusou', icon: 'fas fa-hand', iconColor: '#ea580c' },
  { id: 'voltar-depois', label: 'Voltar depois', icon: 'fas fa-clock', iconColor: '#b45309' }
];

const DELIVERY_STATUS_LABELS = {
  pendente: 'Pendente',
  'em-rota': 'Em rota',
  entregue: 'Entregue',
  falhou: 'Falhou'
};

const DELIVERY_LIST_FULL_RENDER_MAX = 40;
const DELIVERY_LIST_ROW_EST = 168;
const DELIVERY_LIST_BUFFER = 6;

/**
 * @param {object|null|undefined} del
 * @param {Record<string, string>} [failLabels]
 * @returns {{ statusClass: string, statusText: string }}
 */
function deliveryListStatusDisplay(del, failLabels = FAIL_REASON_LABELS) {
  if (!del) return { statusClass: 'status-pendente', statusText: 'Pendente' };
  const statusLabel = DELIVERY_STATUS_LABELS[del.status] || del.status;
  let statusClass = `status-${del.status}`;
  let statusText = statusLabel;
  if (del.voltarDepois && del.status !== 'entregue' && del.status !== 'falhou') {
    statusText = 'Voltar depois';
    statusClass = 'status-voltar-depois';
  } else if (del.status === 'falhou' && del.failReason) {
    statusText = failLabels[del.failReason] || 'Falhou';
  }
  return { statusClass, statusText };
}

/**
 * @param {Array<{ nome?: string, endereco?: string }>} items
 * @param {string} query already lowercased
 */
function filterItemsByTextQuery(items, query) {
  const list = Array.isArray(items) ? items : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list.slice();
  return list.filter((d) =>
    (d.nome || '').toLowerCase().includes(q)
    || (d.endereco || '').toLowerCase().includes(q)
  );
}

/** @param {object|null|undefined} item */
function itemListPhotoCount(item) {
  if (!item) return 0;
  if (Array.isArray(item.photoIds) && item.photoIds.length) return item.photoIds.length;
  if (Array.isArray(item.photos) && item.photos.length) return item.photos.length;
  return 0;
}

/**
 * @param {Array<{ label?: string, numero?: string }>|null|undefined} telefones
 * @returns {string}
 */
function formatPhonesDisplayLine(telefones) {
  if (!telefones || !telefones.length) return '';
  return telefones
    .map((p) => (p.label ? `${p.label}: ` : '') + formatPhoneShort(p.numero))
    .join(', ');
}

function normalizeAddress(addr) {
  return String(addr || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Active (non-finished) delivery on the same address.
 * @template {{ endereco?: string, status?: string }} T
 * @param {T[]} deliveries
 * @param {string} endereco
 * @returns {T|null}
 */
function findActiveDeliveryByAddress(deliveries, endereco) {
  const key = normalizeAddress(endereco);
  return (deliveries || []).find((d) =>
    normalizeAddress(d.endereco) === key
    && d.status !== 'entregue'
    && d.status !== 'falhou'
  ) || null;
}

/**
 * Virtual window for list rendering.
 * @returns {{ start: number, end: number, full: boolean }}
 */
function virtualScrollRange(opts) {
  const total = Math.max(0, Number(opts && opts.total) || 0);
  const fullMax = opts && opts.fullRenderMax != null
    ? opts.fullRenderMax
    : DELIVERY_LIST_FULL_RENDER_MAX;
  if (total <= fullMax) {
    return { start: 0, end: total, full: true };
  }
  const rowEst = opts.rowEst != null ? opts.rowEst : DELIVERY_LIST_ROW_EST;
  const buffer = opts.buffer != null ? opts.buffer : DELIVERY_LIST_BUFFER;
  const scrollTop = opts.scrollTop || 0;
  const viewH = opts.viewH || 600;
  const start = Math.max(0, Math.floor(scrollTop / rowEst) - buffer);
  let end = Math.min(total, Math.ceil((scrollTop + viewH) / rowEst) + buffer);
  if (end <= start) end = Math.min(total, start + 1);
  return { start, end, full: false };
}

/**
 * @param {'deliveries'|'agenda'} kind
 * @param {boolean} isFilter
 */
function emptyListStateHtml(kind, isFilter) {
  if (isFilter) {
    const msg = kind === 'agenda'
      ? 'Nenhuma parada corresponde à busca.'
      : 'Nenhuma entrega corresponde à busca.';
    return `<div class="empty-state">
                <span class="empty-state-mark" aria-hidden="true"></span>
                <span class="empty-state-title">Nada encontrado</span>
                <span class="empty-state-msg">${msg}</span>
            </div>`;
  }
  if (kind === 'agenda') {
    return `<div class="empty-state">
                <span class="empty-state-mark" aria-hidden="true"></span>
                <span class="empty-state-title">Agenda vazia</span>
                <span class="empty-state-msg">Salve clientes frequentes para reutilizar depois.</span>
                <button type="button" class="empty-state-cta" data-empty-cta="nova"><i class="fas fa-plus"></i> Nova entrega</button>
            </div>`;
  }
  return `<div class="empty-state">
                <span class="empty-state-mark" aria-hidden="true"></span>
                <span class="empty-state-title">Rota vazia</span>
                <span class="empty-state-msg">Adicione a primeira entrega para montar o dia.</span>
                <button type="button" class="empty-state-cta" data-empty-cta="nova"><i class="fas fa-plus"></i> Nova entrega</button>
            </div>`;
}

/**
 * @param {object} del
 * @param {{ failLabels?: Record<string, string>, riskLevel?: 'amarelo'|'vermelho'|null }} [opts]
 */
function buildDeliveryListItemHtml(del, opts = {}) {
  const { statusClass, statusText } = deliveryListStatusDisplay(del, opts.failLabels || FAIL_REASON_LABELS);
  const phonesLine = formatPhonesDisplayLine(del.telefones);
  const phonesDisplay = phonesLine
    ? `<div class="delivery-body-line"><i class="fas fa-phone-alt"></i>${escapeHtml(phonesLine)}</div>`
    : '';
  const hasPhone = !!(del.telefones && del.telefones.length);
  const photoCount = itemListPhotoCount(del);
  const riskLevel = opts.riskLevel || null;
  const metaParts = [];
  if (del.routeOrder && del.status !== 'entregue' && del.status !== 'falhou') {
    metaParts.push(`<span class="route-order" title="Ordem na rota">${del.routeOrder}º</span>`);
  }
  if (del.janelaFim || del.janelaInicio) {
    const win = [del.janelaInicio, del.janelaFim].filter(Boolean).join('–');
    metaParts.push(`<span title="Janela de recebimento"><i class="fas fa-clock"></i>${escapeHtml(win)}</span>`);
  }
  if (riskLevel === 'vermelho') {
    metaParts.push('<span class="risk-badge risk-vermelho" title="Área de risco alto — priorize diurno"><i class="fas fa-exclamation-triangle"></i> Risco alto</span>');
  } else if (riskLevel === 'amarelo') {
    metaParts.push('<span class="risk-badge risk-amarelo" title="Área de atenção"><i class="fas fa-exclamation-triangle"></i> Atenção</span>');
  }
  if (photoCount) metaParts.push(`<span title="Fotos"><i class="fas fa-camera"></i>${photoCount}</span>`);
  if (del.savedToAgenda) metaParts.push(`<span title="Na agenda"><i class="fas fa-book"></i></span>`);
  const metaHtml = metaParts.length ? `<div class="delivery-meta">${metaParts.join('')}</div>` : '';
  const legHtml = (del.legMeters === undefined || del.status === 'entregue' || del.status === 'falhou')
    ? ''
    : `<div class="leg-info"><i class="fas fa-car"></i> ${formatKm(del.legMeters)} · ${formatDuration(del.legSeconds)}</div>`;
  const riskClass = riskLevel ? ` risk-${riskLevel}` : '';

  return `<div class="delivery-item${riskClass}" data-id="${escapeHtml(del.id)}"${riskLevel ? ` data-risk="${escapeHtml(riskLevel)}"` : ''}>
                    <div class="delivery-header">
                        <div class="delivery-title-row">
                            <span class="delivery-id">${escapeHtml(del.sequentialId)}</span>
                            <button type="button" class="fav-btn ${del.favorito ? 'active' : ''}" data-action="fav" data-id="${escapeHtml(del.id)}" title="Favorito" aria-label="Favorito"><i class="fas fa-star"></i></button>
                            <strong>${escapeHtml(del.nome)}</strong>
                        </div>
                        <span class="status-badge ${escapeHtml(statusClass)}">${escapeHtml(statusText)}</span>
                    </div>
                    ${metaHtml}
                    <div class="delivery-body-line"><i class="fas fa-location-dot"></i>${escapeHtml(del.endereco)}</div>
                    ${legHtml}
                    ${phonesDisplay}
                    <div class="delivery-links"><button type="button" class="camera-quick" data-action="camera" data-id="${escapeHtml(del.id)}" title="Tirar foto desta entrega" aria-label="Tirar foto desta entrega"><i class="fas fa-camera"></i> Foto</button>${hasPhone ? '<a href="#" class="whatsapp-link" data-action="whatsapp" title="Abrir WhatsApp com link de rastreio"><i class="fab fa-whatsapp"></i> WhatsApp</a>' : ''}<a href="#" class="track-link" data-action="track"><i class="fas fa-map-location-dot"></i> Rastreio</a></div>
                    ${del.notes ? `<div class="delivery-body-line"><i class="fas fa-pen"></i>${escapeHtml(del.notes)}</div>` : ''}
                    <div class="delivery-actions">
                        <select class="select-status" data-action="status" data-id="${escapeHtml(del.id)}" aria-label="Status da entrega">
                            <option value="pendente" ${del.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                            <option value="em-rota" ${del.status === 'em-rota' ? 'selected' : ''}>Em rota</option>
                            <option value="entregue" ${del.status === 'entregue' ? 'selected' : ''}>Entregue</option>
                            <option value="falhou" ${del.status === 'falhou' ? 'selected' : ''}>Falhou</option>
                        </select>
                        <div class="overflow-wrap">
                            <button type="button" class="icon-btn overflow-trigger" data-action="menu" aria-label="Mais ações" title="Mais ações">⋯</button>
                            <div class="overflow-panel" role="menu">
                                <button type="button" data-action="edit" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-edit"></i> Editar</button>
                                <button type="button" data-action="up" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-arrow-up"></i> Subir</button>
                                <button type="button" data-action="down" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-arrow-down"></i> Descer</button>
                                <button type="button" data-action="risk-amarelo" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-exclamation-triangle"></i> Área amarela</button>
                                <button type="button" data-action="risk-vermelho" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-exclamation-triangle"></i> Área vermelha</button>
                                <button type="button" data-action="risk-clear" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-times"></i> Limpar alerta</button>
                                <button type="button" data-action="agenda" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-bookmark"></i> Salvar na agenda</button>
                                <button type="button" class="danger" data-action="remove" data-id="${escapeHtml(del.id)}" role="menuitem"><i class="fas fa-trash-can"></i> Remover</button>
                            </div>
                        </div>
                    </div>
                </div>`;
}

/**
 * @param {object} item
 * @param {{ onRoute?: { sequentialId?: string }|null }} [opts]
 */
function buildAgendaListItemHtml(item, opts = {}) {
  const phonesDisplay = formatPhonesDisplayLine(item.telefones);
  const photoCount = itemListPhotoCount(item);
  const thumbSrc = (item.photos && item.photos[0]) || '';
  const onRoute = opts.onRoute || null;
  const addBtn = onRoute
    ? `<button type="button" class="action-btn ghost" disabled title="Já está na rota">Na rota · ${escapeHtml(onRoute.sequentialId)}</button>`
    : `<button type="button" class="action-btn route add-agenda" data-id="${item.agendaId}"><i class="fas fa-plus"></i> Adicionar à rota</button>`;
  const metaParts = [];
  metaParts.push(`<span title="Pacotes"><i class="fas fa-box"></i>${item.pacotes || 1}</span>`);
  if (photoCount) metaParts.push(`<span title="Fotos"><i class="fas fa-camera"></i>${photoCount}</span>`);
  if (onRoute) {
    metaParts.push(`<span class="agenda-badge" title="Já na rota de hoje"><i class="fas fa-route"></i>${escapeHtml(onRoute.sequentialId)}</span>`);
  }
  return `<div class="agenda-item" data-id="${item.agendaId}">
                    <div class="agenda-header">
                        <div class="delivery-title-row">
                            ${item.favorito ? '<span class="fav-btn active" aria-hidden="true"><i class="fas fa-star"></i></span>' : ''}
                            <strong>${escapeHtml(item.nome)}</strong>
                        </div>
                        <div class="overflow-wrap">
                            <button type="button" class="icon-btn overflow-trigger" aria-label="Mais ações" title="Mais ações">⋯</button>
                            <div class="overflow-panel" role="menu">
                                <button type="button" class="edit-agenda" data-id="${item.agendaId}" role="menuitem"><i class="fas fa-edit"></i> Editar</button>
                                <button type="button" class="remove-agenda danger" data-id="${item.agendaId}" role="menuitem"><i class="fas fa-trash-can"></i> Remover</button>
                            </div>
                        </div>
                    </div>
                    <div class="delivery-meta">${metaParts.join('')}</div>
                    <div class="delivery-body-line"><i class="fas fa-location-dot"></i>${escapeHtml(item.endereco)}</div>
                    ${phonesDisplay ? `<div class="delivery-body-line"><i class="fas fa-phone-alt"></i>${escapeHtml(phonesDisplay)}</div>` : ''}
                    ${item.notes ? `<div class="delivery-body-line"><i class="fas fa-pen"></i>${escapeHtml(item.notes)}</div>` : ''}
                    <div class="agenda-photo-row">
                        ${thumbSrc ? `<img src="${thumbSrc}" class="agenda-photo" data-agenda-id="${item.agendaId}" alt="Foto do cliente">` : ''}
                        <button type="button" class="photo-btn agenda-take-photo" data-id="${item.agendaId}" title="Tirar foto"><i class="fas fa-camera"></i> Tirar foto</button>
                        <button type="button" class="photo-btn agenda-pick-photo" data-id="${item.agendaId}" title="Escolher da galeria"><i class="fas fa-images"></i> Galeria</button>
                    </div>
                    <div class="agenda-actions">${addBtn}</div>
                </div>`;
}

/**
 * Paint virtual/full list HTML from prebuilt row HTML strings.
 * @param {string[]} rowHtmls
 * @param {{ start: number, end: number, full: boolean }} range
 * @param {number} [rowEst]
 */
function joinVirtualListHtml(rowHtmls, range, rowEst = DELIVERY_LIST_ROW_EST) {
  const total = rowHtmls.length;
  if (!total) return '';
  if (range.full) return rowHtmls.join('');
  const { start, end } = range;
  const topPad = start * rowEst;
  const bottomPad = Math.max(0, (total - end) * rowEst);
  const parts = new Array(end - start + 2);
  parts[0] = `<div class="delivery-list-spacer" style="height:${topPad}px" aria-hidden="true"></div>`;
  for (let i = start; i < end; i++) {
    parts[i - start + 1] = rowHtmls[i];
  }
  parts[end - start + 1] = `<div class="delivery-list-spacer" style="height:${bottomPad}px" aria-hidden="true"></div>`;
  return parts.join('');
}

module.exports = {
  FAIL_REASON_LABELS,
  FAIL_REASON_OPTIONS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_LIST_FULL_RENDER_MAX,
  DELIVERY_LIST_ROW_EST,
  DELIVERY_LIST_BUFFER,
  deliveryListStatusDisplay,
  filterItemsByTextQuery,
  itemListPhotoCount,
  formatPhonesDisplayLine,
  normalizeAddress,
  findActiveDeliveryByAddress,
  virtualScrollRange,
  emptyListStateHtml,
  buildDeliveryListItemHtml,
  buildAgendaListItemHtml,
  joinVirtualListHtml
};
