/**
 * Canvas dos pins do mapa (web + URL para marcadores nativos).
 * Tamanho/preferência e contagem ativa vêm via configureMapPins().
 */
import {
    isMutedPin,
    pinTextColorFor,
    markerColorFor,
    nativePinDisplaySize as nativePinDisplaySizeOf
} from '../../lib/map-helpers.js';

let deps = {
    getPinSizePref: () => 'p',
    countActivePins: () => 0
};

export function configureMapPins(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function nativePinDisplaySize() {
    return nativePinDisplaySizeOf(deps.getPinSizePref(), deps.countActivePins());
}

/** Pins quadrados (estilo Spoke): ativos coloridos, entregues cinza claro */
export function buildMapPinIcon(delivery, { highlighted = false } = {}) {
    const muted = isMutedPin(delivery) && !highlighted;
    const label = String(delivery?.sequentialId ?? '');
    const fill = highlighted ? '#174EA6' : markerColorFor(delivery);
    const textColor = pinTextColorFor(delivery, highlighted);
    const display = nativePinDisplaySize();
    const scale = 2;
    const w = Math.round(display * scale);
    const h = w;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const pad = Math.round(w * (muted ? 0.06 : 0.04));
    const rw = w - pad * 2;
    const rh = h - pad * 2;
    const r = Math.max(2, Math.round(rw * (muted ? 0.14 : 0.16)));
    const x = pad;
    const y = pad;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + rw, y, x + rw, y + rh, r);
    ctx.arcTo(x + rw, y + rh, x, y + rh, r);
    ctx.arcTo(x, y + rh, x, y, r);
    ctx.arcTo(x, y, x + rw, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = Math.max(1, w * (muted ? 0.035 : 0.05));
    ctx.strokeStyle = muted ? '#DADCE0' : '#ffffff';
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = label.length > 3 ? w * 0.34 : label.length > 2 ? w * 0.4 : w * 0.46;
    ctx.font = `${muted ? '600' : 'bold'} ${Math.round(fontSize)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(label, w / 2, h / 2 + 1);

    return {
        url: canvas.toDataURL('image/png'),
        size: display,
        width: display,
        height: display,
        anchorX: display / 2,
        anchorY: display / 2,
        muted
    };
}
