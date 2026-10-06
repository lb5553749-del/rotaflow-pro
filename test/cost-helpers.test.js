'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePositiveNumber,
  metersToKm,
  resolveRouteMeters,
  calcFuelCost,
  sumDeliveryRevenue,
  calcRouteEconomics,
  formatRouteEconomicsMessage,
  applyFuelProfileValues,
  formatBrl
} = require('../lib/cost-helpers.js');

describe('parsePositiveNumber / metersToKm', () => {
  it('parses BR decimal and rejects negatives', () => {
    assert.equal(parsePositiveNumber('6,49'), 6.49);
    assert.equal(parsePositiveNumber(-1), null);
    assert.equal(metersToKm(52000), 52);
  });
});

describe('calcFuelCost / revenue', () => {
  it('computes fuel from km, km/l and price', () => {
    // 52 km / 10 km/l * 3.807… ≈ 19.80
    const cost = calcFuelCost(52, 10, 3.807692307);
    assert.ok(Math.abs(cost - 19.8) < 0.01);
    assert.equal(calcFuelCost(52, 0, 6), 0);
  });

  it('sums delivered valores with profile fallback', () => {
    const total = sumDeliveryRevenue(
      [
        { status: 'entregue', valor: 100 },
        { status: 'entregue' },
        { status: 'falhou', valor: 50 },
        { status: 'pendente', valor: 30 }
      ],
      { valorPadraoEntrega: 20 }
    );
    assert.equal(total, 120);
  });
});

describe('calcRouteEconomics / message', () => {
  it('builds the driver-facing profit summary', () => {
    const eco = calcRouteEconomics({
      meters: 52000,
      deliveries: [
        { status: 'entregue', valor: 110 },
        { status: 'entregue', valor: 110 }
      ],
      profile: { consumoKmL: 10, precoCombustivel: 3.807692307 },
      onlyDelivered: true
    });
    assert.equal(eco.km, 52);
    assert.ok(Math.abs(eco.fuelCost - 19.8) < 0.01);
    assert.equal(eco.revenue, 220);
    assert.ok(Math.abs(eco.netProfit - 200.2) < 0.01);
    const msg = formatRouteEconomicsMessage(eco);
    assert.match(msg, /Você rodou 52 km/);
    assert.match(msg, /combustível/);
    assert.match(msg, /Lucro líquido/);
    assert.match(formatBrl(19.8), /R\$/);
  });

  it('prefers sum of legMeters over routeMetrics', () => {
    const meters = resolveRouteMeters(
      [{ legMeters: 1000 }, { legMeters: 500 }],
      { meters: 99999 }
    );
    assert.equal(meters, 1500);
  });

  it('applies or clears fuel prefs on profile', () => {
    const p = {};
    applyFuelProfileValues(p, { consumoKmL: '12', precoCombustivel: '6.5', valorPadraoEntrega: '15' });
    assert.equal(p.consumoKmL, 12);
    assert.equal(p.precoCombustivel, 6.5);
    assert.equal(p.valorPadraoEntrega, 15);
    applyFuelProfileValues(p, { consumoKmL: '', precoCombustivel: '', valorPadraoEntrega: '' });
    assert.equal(p.consumoKmL, undefined);
  });
});
