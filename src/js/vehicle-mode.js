/**
 * Modo suporte veicular — preferência + classe no documentElement.
 */
import {
    readVehicleModePref,
    writeVehicleModePref,
    buildNavigationUrls
} from '../../lib/vehicle-mode-helpers.js';

let deps = {
    getStorage: () => (typeof localStorage !== 'undefined' ? localStorage : null),
    showToast: () => {}
};

let vehicleModeEnabled = false;

export function configureVehicleMode(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function isVehicleModeEnabled() {
    return !!vehicleModeEnabled;
}

export function applyVehicleModeClass(enabled) {
    try {
        document.documentElement.classList.toggle('vehicle-support', !!enabled);
        document.body?.classList.toggle('vehicle-support', !!enabled);
    } catch (_) {}
}

export function loadVehicleMode() {
    vehicleModeEnabled = readVehicleModePref(deps.getStorage());
    applyVehicleModeClass(vehicleModeEnabled);
    return vehicleModeEnabled;
}

export function setVehicleModeEnabled(enabled) {
    vehicleModeEnabled = !!enabled;
    writeVehicleModePref(deps.getStorage(), vehicleModeEnabled);
    applyVehicleModeClass(vehicleModeEnabled);
    return vehicleModeEnabled;
}

export { buildNavigationUrls, readVehicleModePref, writeVehicleModePref };
