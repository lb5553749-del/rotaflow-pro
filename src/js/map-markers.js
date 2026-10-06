/**
 * Marcadores do mapa — CRUD incremental, highlight e fit bounds.
 * Init do mapa permanece em map-layer.js; pins canvas em map-pins.js.
 */
import {
    isMutedPin,
    markerColorFor,
    markerScaleForActiveCount,
    boundsFromPoints,
    pointsForMapFit,
    markerIdsToKeep,
    markerZIndexFor
} from '../../lib/map-helpers.js';
import { hasMapCoords } from '../../lib/routing-helpers.js';
import { buildMapPinIcon } from './map-pins.js';
import { createNativeMarkerShim, PORTO_VELHO_CENTER } from './map-layer.js';

let deps = {
    getMap: () => null,
    getUseNativeMap: () => false,
    getDeliveries: () => [],
    openDeliveryPanel: () => {},
    updateDeliveryStats: () => {},
    getRiskLevelForDelivery: () => null
};

const markersList = [];
const markersBySeq = new Map();
let highlightedMarker = null;

export function configureMapMarkers(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function shouldShowOnMap(delivery) {
    return hasMapCoords(delivery);
}

export function getHighlightedMarker() {
    return highlightedMarker;
}

export function clearHighlightedMarker() {
    if (highlightedMarker) {
        resetMarkerStyle(highlightedMarker);
        highlightedMarker = null;
    }
}

function markerScaleForCount(muted) {
    const n = deps.getDeliveries().filter((d) => shouldShowOnMap(d) && !isMutedPin(d)).length;
    return markerScaleForActiveCount(muted, n);
}

function markerIcon(color, opacity, muted) {
    // Mantido para compat; ícones reais usam buildMapPinIcon (canvas).
    return {
        path: google.maps.SymbolPath.CIRCLE,
        scale: markerScaleForCount(muted),
        fillColor: color,
        fillOpacity: opacity == null ? 1 : opacity,
        strokeWeight: muted ? 1 : 1.25,
        strokeColor: muted ? '#CFD8DC' : 'white',
        muted: !!muted
    };
}

function webMarkerIconFromPin(pin) {
    return {
        url: pin.url,
        scaledSize: new google.maps.Size(pin.width, pin.height),
        anchor: new google.maps.Point(pin.anchorX, pin.anchorY),
        muted: !!pin.muted
    };
}

export function getMarker(sequentialId) {
    return markersBySeq.get(sequentialId) || null;
}

export function applyPinVisual(marker, delivery, { highlighted = false } = {}) {
    if (!marker || !delivery) return;
    const pin = buildMapPinIcon(delivery, { highlighted });
    if (deps.getUseNativeMap()) {
        marker._muted = isMutedPin(delivery);
        marker._highlighted = highlighted;
        const riskLevel = isMutedPin(delivery) ? null : (deps.getRiskLevelForDelivery?.(delivery) || null);
        marker._color = highlighted ? '#1E3A8A' : markerColorFor(delivery, { riskLevel });
        marker._label = String(delivery.sequentialId);
        marker.setTitle(`${delivery.sequentialId} - ${delivery.nome}`);
        marker._sync();
        return;
    }
    marker.setIcon(webMarkerIconFromPin(pin));
    marker.setLabel(null);
    marker.setTitle(`${delivery.sequentialId} - ${delivery.nome}`);
    marker.setZIndex(markerZIndexFor(highlighted, isMutedPin(delivery)));
}

export function createPinMarker(delivery) {
    const map = deps.getMap();
    const opts = {
        sequentialId: delivery.sequentialId,
        position: { lat: delivery.lat, lng: delivery.lng },
        label: { text: String(delivery.sequentialId) },
        icon: markerIcon(markerColorFor(delivery), 1, isMutedPin(delivery)),
        title: `${delivery.sequentialId} - ${delivery.nome}`,
        muted: isMutedPin(delivery)
    };
    let marker;
    if (deps.getUseNativeMap()) {
        marker = createNativeMarkerShim(opts);
        applyPinVisual(marker, delivery);
    } else {
        const pin = buildMapPinIcon(delivery);
        marker = new google.maps.Marker({
            position: opts.position,
            map,
            icon: webMarkerIconFromPin(pin),
            title: opts.title,
            optimized: true,
            zIndex: markerZIndexFor(false, isMutedPin(delivery))
        });
        marker.sequentialId = delivery.sequentialId;
    }
    marker.addListener('click', () => {
        const d = deps.getDeliveries().find((x) => x.sequentialId === marker.sequentialId);
        if (!d) return;
        highlightMarker(marker, d);
        deps.openDeliveryPanel(d, { keepMinimized: true });
    });
    return marker;
}

export function highlightMarker(marker, delivery) {
    if (highlightedMarker && highlightedMarker !== marker) {
        resetMarkerStyle(highlightedMarker);
    }
    highlightedMarker = marker;
    applyPinVisual(marker, delivery, { highlighted: true });
}

export function resetMarkerStyle(marker) {
    const delivery = deps.getDeliveries().find((d) => d.sequentialId === marker.sequentialId);
    if (!delivery) return;
    applyPinVisual(marker, delivery, { highlighted: false });
}

export function updateMarkerIcon(marker, delivery) {
    if (!marker || !delivery) return;
    applyPinVisual(marker, delivery, { highlighted: highlightedMarker === marker });
}

export function upsertMarker(delivery) {
    if (!deps.getMap() || !delivery) return;
    try {
        if (!shouldShowOnMap(delivery)) {
            removeMarkerById(delivery.sequentialId);
            return;
        }
        let marker = getMarker(delivery.sequentialId);
        if (!marker) {
            marker = createPinMarker(delivery);
            if (!marker) return;
            markersList.push(marker);
            markersBySeq.set(delivery.sequentialId, marker);
            return;
        }
        marker.setPosition({ lat: Number(delivery.lat), lng: Number(delivery.lng) });
        updateMarkerIcon(marker, delivery);
    } catch (e) {
        console.warn('upsertMarker', e);
    }
}

export function removeMarkerById(sequentialId) {
    const marker = getMarker(sequentialId);
    if (!marker) return;
    marker.setMap(null);
    markersBySeq.delete(sequentialId);
    const idx = markersList.indexOf(marker);
    if (idx >= 0) markersList.splice(idx, 1);
    if (highlightedMarker && highlightedMarker.sequentialId === sequentialId) highlightedMarker = null;
}

export function rebuildMarkers(centerMap = true) {
    // Sync incremental: evita destruir/recriar dezenas de Markers a cada ação.
    if (!deps.getMap()) return;
    const deliveries = deps.getDeliveries();
    const keep = markerIdsToKeep(deliveries, shouldShowOnMap);
    for (const del of deliveries) {
        if (!shouldShowOnMap(del)) continue;
        upsertMarker(del);
    }
    for (const seq of [...markersBySeq.keys()]) {
        if (!keep.has(seq)) removeMarkerById(seq);
    }
    if (highlightedMarker && !markersBySeq.has(highlightedMarker.sequentialId)) highlightedMarker = null;
    if (centerMap) centerMapOnMarkers();
    deps.updateDeliveryStats();
}

export function centerMapOnMarkers() {
    const map = deps.getMap();
    if (!map) return;
    const pts = pointsForMapFit(deps.getDeliveries(), shouldShowOnMap);
    if (!pts.length) {
        map.setCenter(PORTO_VELHO_CENTER);
        return;
    }
    if (deps.getUseNativeMap()) {
        const b = boundsFromPoints(pts);
        if (b) map.fitBounds(b);
        return;
    }
    const bounds = new google.maps.LatLngBounds();
    pts.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds);
}

export { markerIdsToKeep, markerZIndexFor };
