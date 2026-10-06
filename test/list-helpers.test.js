'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FAIL_REASON_LABELS,
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
  joinVirtualListHtml,
  DELIVERY_LIST_FULL_RENDER_MAX
} = require('../lib/list-helpers.js');

describe('deliveryListStatusDisplay', () => {
  it('maps status and voltarDepois / failReason', () => {
    assert.equal(deliveryListStatusDisplay({ status: 'pendente' }).statusText, 'Pendente');
    assert.equal(
      deliveryListStatusDisplay({ status: 'pendente', voltarDepois: true }).statusClass,
      'status-voltar-depois'
    );
    assert.equal(
      deliveryListStatusDisplay({ status: 'falhou', failReason: 'ausente' }).statusText,
      FAIL_REASON_LABELS.ausente
    );
  });
});

describe('filterItemsByTextQuery', () => {
  const items = [
    { nome: 'Ana', endereco: 'Rua A' },
    { nome: 'Bruno', endereco: 'Av Central' }
  ];
  it('filters by name or address', () => {
    assert.equal(filterItemsByTextQuery(items, 'ana').length, 1);
    assert.equal(filterItemsByTextQuery(items, 'central').length, 1);
    assert.equal(filterItemsByTextQuery(items, '').length, 2);
  });
});

describe('itemListPhotoCount / phones / address', () => {
  it('prefers photoIds', () => {
    assert.equal(itemListPhotoCount({ photoIds: ['a', 'b'], photos: ['x'] }), 2);
    assert.equal(itemListPhotoCount({ photos: ['x'] }), 1);
  });

  it('formats phones and normalizes address', () => {
    assert.match(formatPhonesDisplayLine([{ numero: '69999999999', label: 'Casa' }]), /Casa:/);
    assert.equal(normalizeAddress('  Rua  Um  '), 'rua um');
  });

  it('finds active delivery by address', () => {
    const list = [
      { endereco: 'Rua X', status: 'entregue', sequentialId: 'A1' },
      { endereco: 'Rua X', status: 'pendente', sequentialId: 'A2' }
    ];
    assert.equal(findActiveDeliveryByAddress(list, 'rua x').sequentialId, 'A2');
    assert.equal(findActiveDeliveryByAddress(list, 'outra'), null);
  });
});

describe('virtualScrollRange / empty / join', () => {
  it('returns full range under threshold', () => {
    const r = virtualScrollRange({ total: 10, fullRenderMax: DELIVERY_LIST_FULL_RENDER_MAX });
    assert.deepEqual(r, { start: 0, end: 10, full: true });
  });

  it('windows large lists', () => {
    const r = virtualScrollRange({
      total: 100,
      scrollTop: 1680,
      viewH: 600,
      rowEst: 168,
      buffer: 2,
      fullRenderMax: 40
    });
    assert.equal(r.full, false);
    assert.ok(r.start < r.end);
  });

  it('builds empty states and joins virtual html', () => {
    assert.match(emptyListStateHtml('deliveries', false), /Rota vazia/);
    assert.match(emptyListStateHtml('agenda', true), /Nada encontrado/);
    const rows = ['<div>a</div>', '<div>b</div>', '<div>c</div>'];
    assert.equal(joinVirtualListHtml(rows, { start: 0, end: 3, full: true }), rows.join(''));
    assert.match(
      joinVirtualListHtml(rows, { start: 1, end: 2, full: false }, 10),
      /delivery-list-spacer/
    );
  });
});

describe('build list item html', () => {
  it('includes delivery id and escape-safe name', () => {
    const html = buildDeliveryListItemHtml({
      id: 1,
      sequentialId: 'A1',
      nome: '<x>',
      endereco: 'Rua 1',
      status: 'pendente',
      telefones: [],
      photoIds: []
    });
    assert.match(html, /data-id="1"/);
    assert.match(html, /&lt;x&gt;/);
    assert.match(html, /data-action="track"/);
    assert.doesNotMatch(html, /data-action="whatsapp"/);
  });

  it('shows risk badge and overflow actions', () => {
    const html = buildDeliveryListItemHtml({
      id: 2,
      sequentialId: 'B2',
      nome: 'Cli',
      endereco: 'Rua Perigo',
      status: 'pendente',
      telefones: []
    }, { riskLevel: 'vermelho' });
    assert.match(html, /risk-vermelho/);
    assert.match(html, /Risco alto/);
    assert.match(html, /data-action="risk-amarelo"/);
    assert.match(html, /data-action="risk-clear"/);
  });

  it('marks agenda item already on route', () => {
    const html = buildAgendaListItemHtml(
      { agendaId: 9, nome: 'Cli', endereco: 'Rua', pacotes: 2, telefones: [] },
      { onRoute: { sequentialId: 'B3' } }
    );
    assert.match(html, /Na rota · B3/);
    assert.match(html, /disabled/);
  });
});
