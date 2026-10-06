'use strict';

/**
 * Pure helpers for route fuel cost / revenue / net profit (local-first).
 */

/**
 * @param {unknown} value
 * @returns {number|null} finite number or null
 */
function parsePositiveNumber(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * @param {unknown} meters
 * @returns {number} km (0 if invalid)
 */
function metersToKm(meters) {
  const m = Number(meters);
  if (!Number.isFinite(m) || m < 0) return 0;
  return m / 1000;
}

/**
 * Prefer sum of per-leg meters; fallback to routeMetrics.meters.
 * @param {Array<{ legMeters?: number }>|null|undefined} deliveries
 * @param {{ meters?: number }|null|undefined} routeMetrics
 * @returns {number} meters
 */
function resolveRouteMeters(deliveries, routeMetrics) {
  let sum = 0;
  let hasLeg = false;
  (deliveries || []).forEach((d) => {
    const leg = Number(d && d.legMeters);
    if (Number.isFinite(leg) && leg >= 0) {
      sum += leg;
      hasLeg = true;
    }
  });
  if (hasLeg) return sum;
  const m = routeMetrics && Number(routeMetrics.meters);
  return Number.isFinite(m) && m >= 0 ? m : 0;
}

/**
 * Fuel cost in BRL.
 * @param {number} km
 * @param {number|null|undefined} kmPerLiter
 * @param {number|null|undefined} pricePerLiter
 * @returns {number}
 */
function calcFuelCost(km, kmPerLiter, pricePerLiter) {
  const dist = Number(km);
  const kml = parsePositiveNumber(kmPerLiter);
  const price = parsePositiveNumber(pricePerLiter);
  if (!Number.isFinite(dist) || dist <= 0 || !kml || kml <= 0 || price == null) return 0;
  return (dist / kml) * price;
}

/**
 * Revenue: sum of delivery.valor for delivered (or all when includeAll).
 * Falls back to profile.valorPadraoEntrega when stop has no valor.
 * @param {Array<{ status?: string, valor?: unknown }>|null|undefined} deliveries
 * @param {{ valorPadraoEntrega?: unknown }|null|undefined} profile
 * @param {{ onlyDelivered?: boolean }} [opts]
 * @returns {number}
 */
function sumDeliveryRevenue(deliveries, profile, opts) {
  const onlyDelivered = !opts || opts.onlyDelivered !== false;
  const fallback = parsePositiveNumber(profile && profile.valorPadraoEntrega);
  let total = 0;
  (deliveries || []).forEach((d) => {
    if (!d) return;
    if (onlyDelivered && d.status !== 'entregue') return;
    const own = parsePositiveNumber(d.valor);
    if (own != null) total += own;
    else if (fallback != null) total += fallback;
  });
  return total;
}

/**
 * @param {{
 *   meters?: number,
 *   deliveries?: object[],
 *   profile?: { consumoKmL?: unknown, precoCombustivel?: unknown, valorPadraoEntrega?: unknown }|null,
 *   routeMetrics?: { meters?: number }|null,
 *   onlyDelivered?: boolean
 * }} input
 * @returns {{ km: number, fuelCost: number, revenue: number, netProfit: number, meters: number }}
 */
function calcRouteEconomics(input) {
  const data = input || {};
  const meters = Number.isFinite(Number(data.meters))
    ? Number(data.meters)
    : resolveRouteMeters(data.deliveries, data.routeMetrics);
  const km = metersToKm(meters);
  const profile = data.profile || {};
  const fuelCost = calcFuelCost(km, profile.consumoKmL, profile.precoCombustivel);
  const revenue = sumDeliveryRevenue(data.deliveries, profile, {
    onlyDelivered: data.onlyDelivered !== false
  });
  return {
    meters,
    km,
    fuelCost,
    revenue,
    netProfit: revenue - fuelCost
  };
}

/**
 * @param {number} value
 * @returns {string} e.g. "R$ 19,80"
 */
function formatBrl(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return safe.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch (_) {
    return `R$ ${safe.toFixed(2).replace('.', ',')}`;
  }
}

/**
 * @param {number} km
 * @returns {string}
 */
function formatKmShort(km) {
  const n = Number(km);
  const safe = Number.isFinite(n) ? n : 0;
  const rounded = Math.round(safe * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace('.', ',');
  return `${text} km`;
}

/**
 * Example: "Você rodou 52 km, gastou R$ 19,80 em combustível e faturou R$ 220,00 (Lucro líquido: R$ 200,20)"
 * @param {{ km: number, fuelCost: number, revenue: number, netProfit: number }} economics
 * @returns {string}
 */
function formatRouteEconomicsMessage(economics) {
  const e = economics || {};
  return (
    `Você rodou ${formatKmShort(e.km)}, ` +
    `gastou ${formatBrl(e.fuelCost)} em combustível ` +
    `e faturou ${formatBrl(e.revenue)} ` +
    `(Lucro líquido: ${formatBrl(e.netProfit)})`
  );
}

/**
 * Normalize fuel/revenue prefs onto profile (mutates).
 * @param {object} profile
 * @param {{ consumoKmL?: unknown, precoCombustivel?: unknown, valorPadraoEntrega?: unknown }} values
 * @returns {object}
 */
function applyFuelProfileValues(profile, values) {
  const p = profile || {};
  const v = values || {};
  const consumo = parsePositiveNumber(v.consumoKmL);
  const preco = parsePositiveNumber(v.precoCombustivel);
  const valor = parsePositiveNumber(v.valorPadraoEntrega);
  if (consumo != null && consumo > 0) p.consumoKmL = consumo;
  else delete p.consumoKmL;
  if (preco != null) p.precoCombustivel = preco;
  else delete p.precoCombustivel;
  if (valor != null) p.valorPadraoEntrega = valor;
  else delete p.valorPadraoEntrega;
  return p;
}

/**
 * @param {unknown} raw
 * @returns {number|undefined}
 */
function normalizeMoneyField(raw) {
  const n = parsePositiveNumber(raw);
  return n == null ? undefined : n;
}

module.exports = {
  parsePositiveNumber,
  metersToKm,
  resolveRouteMeters,
  calcFuelCost,
  sumDeliveryRevenue,
  calcRouteEconomics,
  formatBrl,
  formatKmShort,
  formatRouteEconomicsMessage,
  applyFuelProfileValues,
  normalizeMoneyField
};
