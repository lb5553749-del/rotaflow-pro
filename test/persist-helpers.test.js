'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  cloneWithoutHeavyPhotos,
  hydrateRoutesFromData,
  buildPersistPayload,
  normalizeRouteRecord,
  migrateLegacyLocalStorageKeys,
  normalizeAgendaItemDefaults,
  parseAgendaStorage,
  migrateWhatsAppTemplate,
  ensureProfileEmpresa
} = require('../lib/persist-helpers.js');

describe('cloneWithoutHeavyPhotos', () => {
  it('strips photos but keeps photoIds', () => {
    const out = cloneWithoutHeavyPhotos([
      { id: 1, photos: ['data:image/jpeg;base64,xxx'], photoIds: ['p_a'], nome: 'A' }
    ]);
    assert.equal(out[0].photos, undefined);
    assert.deepEqual(out[0].photoIds, ['p_a']);
    assert.equal(out[0].nome, 'A');
  });

  it('handles empty / null list', () => {
    assert.deepEqual(cloneWithoutHeavyPhotos(null), []);
    assert.deepEqual(cloneWithoutHeavyPhotos([]), []);
  });
});

describe('hydrateRoutesFromData', () => {
  it('loads multi-route schema', () => {
    const data = {
      activeRouteId: 'r2',
      routes: [
        { id: 'r1', name: 'Rota 1', deliveries: [{ id: 1 }], nextSequenceNumber: 2 },
        { id: 'r2', name: 'Rota 2', deliveries: [{ id: 2 }, { id: 3 }], nextSequenceNumber: 3, routeActive: true }
      ]
    };
    const state = hydrateRoutesFromData(data);
    assert.equal(state.activeRouteId, 'r2');
    assert.equal(state.routes.length, 2);
    assert.equal(state.deliveries.length, 2);
    assert.equal(state.routeActive, true);
    assert.equal(state.nextSequenceNumber, 3);
  });

  it('migrates legacy single deliveries list', () => {
    const migrated = [];
    const state = hydrateRoutesFromData(
      { deliveries: [{ id: 10 }, { id: 11 }], nextSequenceNumber: 12 },
      {
        migrateDeliveryFields: (d) => { migrated.push(d.id); },
        createEmptyRoute: (name) => ({
          id: 'boot',
          name,
          deliveries: [],
          nextSequenceNumber: 1,
          routeActive: false,
          routeMetrics: null,
          createdAt: 1
        })
      }
    );
    assert.deepEqual(migrated, [10, 11]);
    assert.equal(state.activeRouteId, 'boot');
    assert.equal(state.deliveries.length, 2);
    assert.equal(state.nextSequenceNumber, 12);
    assert.equal(state.routeActive, false);
  });

  it('falls back to empty route', () => {
    const state = hydrateRoutesFromData(null, {
      createEmptyRoute: () => ({
        id: 'empty',
        name: 'Rota 1',
        deliveries: [],
        nextSequenceNumber: 1,
        routeActive: false,
        routeMetrics: null,
        createdAt: 1
      })
    });
    assert.equal(state.activeRouteId, 'empty');
    assert.equal(state.deliveries.length, 0);
  });
});

describe('normalizeRouteRecord', () => {
  it('fills defaults', () => {
    const r = normalizeRouteRecord({ deliveries: [{}] }, () => {});
    assert.ok(r.id);
    assert.equal(r.name, 'Rota 1');
    assert.equal(r.nextSequenceNumber, 2);
  });
});

describe('buildPersistPayload', () => {
  const sample = () => ({
    routes: [{
      id: 'r1',
      name: 'Rota 1',
      deliveries: [{ id: 1, photos: ['data:x'], photoIds: ['p1'] }],
      nextSequenceNumber: 2,
      routeActive: false,
      routeMetrics: null,
      createdAt: 1
    }],
    activeRouteId: 'r1',
    nextSequenceNumber: 2,
    agenda: [{ agendaId: 1, photos: ['data:y'], photoIds: ['p2'] }],
    nextAgendaId: 2
  });

  it('never embeds photos arrays', () => {
    const payload = buildPersistPayload(sample());
    assert.equal(payload.data.routes[0].deliveries[0].photos, undefined);
    assert.deepEqual(payload.data.routes[0].deliveries[0].photoIds, ['p1']);
    assert.equal(payload.agenda.agenda[0].photos, undefined);
    assert.deepEqual(payload.agenda.agenda[0].photoIds, ['p2']);
  });

  it('does not write the legacy top-level deliveries mirror', () => {
    const payload = buildPersistPayload({ ...sample(), deliveries: [{ id: 1 }] });
    assert.equal('deliveries' in payload.data, false);
    assert.equal(payload.data.activeRouteId, 'r1');
    assert.equal(payload.data.nextSequenceNumber, 2);
  });

  it('round-trips through hydrateRoutesFromData without the mirror', () => {
    const payload = buildPersistPayload(sample());
    const state = hydrateRoutesFromData(JSON.parse(JSON.stringify(payload.data)));
    assert.equal(state.activeRouteId, 'r1');
    assert.equal(state.routes.length, 1);
    assert.deepEqual(state.deliveries.map((d) => d.id), [1]);
    assert.equal(state.nextSequenceNumber, 2);
  });
});

describe('legacy data compatibility (read side)', () => {
  it('old localStorage data with only deliveries migrates into routes', () => {
    const state = hydrateRoutesFromData({
      deliveries: [{ id: 5, sequentialId: 'A1' }, { id: 6, sequentialId: 'A2' }],
      nextSequenceNumber: 3
    });
    assert.equal(state.routes.length, 1);
    assert.equal(state.routes[0].name, 'Rota 1');
    assert.deepEqual(state.routes[0].deliveries.map((d) => d.id), [5, 6]);
    assert.equal(state.activeRouteId, state.routes[0].id);
    assert.equal(state.deliveries, state.routes[0].deliveries);
    assert.equal(state.nextSequenceNumber, 3);
  });

  it('old JSON backup (version 1, deliveries + agenda, no routes) restores into routes', () => {
    const backup = {
      version: 1,
      exportedAt: 1,
      deliveries: [{ id: 9, status: 'pendente' }],
      agenda: [{ agendaId: 1 }],
      nextSequenceNumber: 2,
      nextAgendaId: 2
    };
    const state = hydrateRoutesFromData(backup);
    assert.equal(state.routes.length, 1);
    assert.deepEqual(state.deliveries.map((d) => d.id), [9]);
  });

  it('prefers routes[] when both routes and a stale mirror exist', () => {
    const state = hydrateRoutesFromData({
      routes: [{ id: 'r1', name: 'Rota 1', deliveries: [{ id: 1 }, { id: 2 }] }],
      activeRouteId: 'r1',
      deliveries: [{ id: 99 }]
    });
    assert.deepEqual(state.deliveries.map((d) => d.id), [1, 2]);
  });
});

describe('migrateLegacyLocalStorageKeys', () => {
  it('copies unscoped keys into uid-scoped keys once', () => {
    const store = new Map([
      ['rotaflow_data', '{"routes":[]}'],
      ['rotaflow_agenda', '{"agenda":[]}'],
      ['rotaflow_profile', '{"motorista":"A"}']
    ]);
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, v); }
    };
    const key = (base) => `rotaflow_${base}_local1`;
    assert.equal(migrateLegacyLocalStorageKeys(storage, key), true);
    assert.equal(store.get('rotaflow_data_local1'), '{"routes":[]}');
    assert.equal(store.get('rotaflow_agenda_local1'), '{"agenda":[]}');
    assert.equal(migrateLegacyLocalStorageKeys(storage, key), false);
  });
});

describe('agenda / profile helpers', () => {
  it('parseAgendaStorage and normalizeAgendaItemDefaults', () => {
    const parsed = parseAgendaStorage({ agenda: [{ nome: 'A' }], nextAgendaId: 4 });
    assert.equal(parsed.nextAgendaId, 4);
    normalizeAgendaItemDefaults(parsed.agenda[0]);
    assert.equal(parsed.agenda[0].pacotes, 1);
    assert.deepEqual(parsed.agenda[0].photoIds, []);
  });

  it('migrateWhatsAppTemplate replaces short/legacy templates', () => {
    const def = 'Olá {nome}\nEstamos chegando em breve!\n{endereco}\n{link}';
    const short = migrateWhatsAppTemplate('Acompanhe sua entrega em tempo real', def);
    assert.equal(short.changed, true);
    assert.equal(short.message, def);

    const eta = migrateWhatsAppTemplate('Sua encomenda (1)\n⏱ Faltam cerca de 5 min\n{km}', def);
    assert.equal(eta.changed, true);
    assert.equal(eta.message, def);

    const correx = migrateWhatsAppTemplate(
      'Estamos chegando em breve!\n{endereco}\n📦 Correx express\n{link}',
      def
    );
    assert.equal(correx.changed, true);
    assert.match(correx.message, /\{empresa\}/);
  });

  it('ensureProfileEmpresa fills blank empresa', () => {
    const out = ensureProfileEmpresa({ motorista: 'X', empresa: '  ' }, 'Correx express');
    assert.equal(out.changed, true);
    assert.equal(out.profile.empresa, 'Correx express');
  });
});
