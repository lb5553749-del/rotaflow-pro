/**
 * Camada do mapa: init nativo (Capacitor GoogleMap) vs web (JS API) + shims de marcadores.
 * main.js injeta estado do mapa e boot pós-auth via configureMapLayer().
 */
import {
    hexToTint,
    iconFillColor,
    iconFillOpacity,
    plainLatLng,
    boundsCorners,
    pacotesFromPinColor
} from '../../lib/map-helpers.js';
import { buildMapPinIcon } from './map-pins.js';
import { setDirectionsService } from './routing.js';

export const PORTO_VELHO_CENTER = { lat: -8.7619, lng: -63.9038 };
export const PORTO_VELHO_RADIUS = 50000;

export const mapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#f1f3f4' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#5f6368' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f1f3f4' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e8f0e8' }] },
    { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#dadce0' }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8eaed' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#dadce0' }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#cfd3d8' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dce7f2' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f1f3f4' }] },
    { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#dadce0' }] }
];

let deps = {
    isNativeApp: () => false,
    getMap: () => null,
    setMap: () => {},
    getGeocoder: () => null,
    setGeocoder: () => {},
    getAutocomplete: () => null,
    setAutocomplete: () => {},
    getUseNativeMap: () => false,
    setUseNativeMap: () => {},
    getNativeGoogleMap: () => null,
    setNativeGoogleMap: () => {},
    getNativeMarkerById: () => new Map(),
    setNativeMarkerById: () => {},
    getNativeMapZoom: () => 12,
    setNativeMapZoom: () => {},
    getAuthReady: () => false,
    getStorageLoadedUid: () => null,
    currentUid: () => 'guest',
    refreshMapAfterStorageLoad: () => {},
    loadStorage: () => {},
    showStartMarker: () => {}
};

export function configureMapLayer(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function createNativeMapFacade(gmap) {
    return {
        panTo(pos) {
            const c = plainLatLng(pos);
            if (!c) return;
            gmap.setCamera({ coordinate: c, animate: true });
        },
        setCenter(pos) {
            const c = plainLatLng(pos);
            if (!c) return;
            gmap.setCamera({ coordinate: c });
        },
        setZoom(z) {
            deps.setNativeMapZoom(z);
            gmap.setCamera({ zoom: z });
        },
        getZoom() { return deps.getNativeMapZoom(); },
        fitBounds(bounds, padding) {
            const corners = boundsCorners(bounds);
            if (!corners) return;
            const pad = typeof padding === 'number' ? padding : 64;
            gmap.fitBounds({
                southwest: corners.southwest,
                northeast: corners.northeast,
                center: corners.center
            }, pad);
        }
    };
}

export function createNativeMarkerShim(opts) {
    const color = iconFillColor(opts.icon);
    const opacity = iconFillOpacity(opts.icon);
    const shim = {
        sequentialId: opts.sequentialId,
        _nativeId: null,
        _pos: { lat: opts.position.lat, lng: opts.position.lng },
        _title: opts.title || '',
        _label: opts.label && opts.label.text ? String(opts.label.text) : '',
        _color: color,
        _opacity: opacity,
        _muted: !!opts.muted,
        _highlighted: false,
        _onClick: null,
        _syncing: false,
        _removed: false,
        async _sync() {
            const nativeGoogleMap = deps.getNativeGoogleMap();
            const nativeMarkerById = deps.getNativeMarkerById();
            if (!nativeGoogleMap || this._syncing || this._removed) return;
            this._syncing = true;
            try {
                if (this._nativeId) {
                    nativeMarkerById.delete(this._nativeId);
                    await nativeGoogleMap.removeMarkers([this._nativeId]);
                    this._nativeId = null;
                }
                if (this._removed) return;
                const label = this._label || String(this.sequentialId || '');
                const markerOpts = {
                    coordinate: this._pos,
                    title: label,
                    snippet: this._title,
                    opacity: 1,
                    zIndex: this._highlighted ? 30 : (this._muted ? 1 : 10)
                };
                if (label && this.sequentialId !== '__gps__') {
                    const pin = buildMapPinIcon(
                        {
                            sequentialId: label,
                            status: this._muted ? 'entregue' : 'pendente',
                            pacotes: pacotesFromPinColor(this._color)
                        },
                        { highlighted: this._highlighted }
                    );
                    markerOpts.iconUrl = pin.url;
                    markerOpts.iconSize = { width: pin.width, height: pin.height };
                    markerOpts.iconAnchor = { x: pin.anchorX, y: pin.anchorY };
                } else {
                    markerOpts.tintColor = hexToTint(this._color, Math.round((this._opacity == null ? 1 : this._opacity) * 255));
                }
                const id = await nativeGoogleMap.addMarker(markerOpts);
                if (this._removed) {
                    await nativeGoogleMap.removeMarkers([id]).catch(() => {});
                    return;
                }
                this._nativeId = id;
                nativeMarkerById.set(this._nativeId, this);
            } catch (e) {
                console.warn('native marker', e);
            } finally {
                this._syncing = false;
            }
        },
        setPosition(p) {
            if (this._removed) return;
            const c = plainLatLng(p);
            if (!c) return;
            this._pos = c;
            this._sync();
        },
        setIcon(icon) {
            if (this._removed) return;
            this._color = iconFillColor(icon);
            this._opacity = iconFillOpacity(icon);
            if (icon && typeof icon === 'object' && 'muted' in icon) this._muted = !!icon.muted;
            if (icon && typeof icon === 'object' && 'highlighted' in icon) this._highlighted = !!icon.highlighted;
            this._sync();
        },
        setLabel(label) {
            if (this._removed) return;
            this._label = label && typeof label === 'object' ? String(label.text || '') : String(label || '');
            this._sync();
        },
        setTitle(t) { this._title = t || ''; },
        setMap(m) {
            if (m) return;
            this._removed = true;
            const nativeGoogleMap = deps.getNativeGoogleMap();
            const nativeMarkerById = deps.getNativeMarkerById();
            if (this._nativeId && nativeGoogleMap) {
                nativeMarkerById.delete(this._nativeId);
                nativeGoogleMap.removeMarkers([this._nativeId]).catch(() => {});
                this._nativeId = null;
            }
        },
        addListener(ev, cb) {
            if (ev === 'click') this._onClick = cb;
        }
    };
    shim._sync();
    return shim;
}

export async function ensurePlacesAutocomplete() {
    if (deps.getAutocomplete() || !document.getElementById('address')) return;
    try {
        if (google.maps.importLibrary) {
            await google.maps.importLibrary('places');
        }
        const addressInput = document.getElementById('address');
        const autocomplete = new google.maps.places.Autocomplete(addressInput, {
            componentRestrictions: { country: 'br' },
            fields: ['formatted_address', 'geometry'],
            types: ['address'],
            location: PORTO_VELHO_CENTER,
            radius: PORTO_VELHO_RADIUS,
            strictBounds: false
        });
        deps.setAutocomplete(autocomplete);
        autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (place && place.formatted_address) addressInput.value = place.formatted_address;
        });
    } catch (e) {
        console.warn('Places autocomplete', e);
    }
}

async function initNativeGoogleMap() {
    const cap = window.RotaFlowCap;
    document.documentElement.classList.add('native-map');
    try {
        await cap.StatusBar.setStyle({ style: cap.Style.Dark });
    } catch (_) {}

    const old = document.getElementById('map');
    const el = document.createElement('capacitor-google-map');
    el.id = 'map';
    el.setAttribute('role', 'application');
    el.setAttribute('aria-label', 'Mapa das entregas');
    el.style.display = 'block';
    el.style.width = '100%';
    el.style.height = '100%';
    old.replaceWith(el);

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const nativeGoogleMap = await cap.GoogleMap.create({
        id: 'rotaflow',
        element: el,
        apiKey: cap.MAPS_API_KEY,
        config: {
            center: PORTO_VELHO_CENTER,
            zoom: 12,
            disableDefaultUI: true,
            // Maps SDK nativo: rotação/inclinação com dois dedos (360°) como no Google Maps
            heading: 0,
            styles: mapStyle
        }
    });
    deps.setNativeMapZoom(12);
    deps.setNativeGoogleMap(nativeGoogleMap);
    deps.setMap(createNativeMapFacade(nativeGoogleMap));
    deps.setUseNativeMap(true);

    await nativeGoogleMap.setOnMarkerClickListener((ev) => {
        const m = deps.getNativeMarkerById().get(ev.markerId);
        if (m && typeof m._onClick === 'function') m._onClick();
    });
}

/**
 * CameraPreview toBack foi removido do caminho multi-foto.
 * O mapa nativo já não precisa de suspend/destroy/recreate por causa da câmera.
 */
export async function initMap() {
    deps.setUseNativeMap(false);
    deps.setNativeGoogleMap(null);
    deps.setNativeMarkerById(new Map());

    if (deps.isNativeApp()) {
        try {
            await initNativeGoogleMap();
        } catch (e) {
            console.warn('Native map failed, falling back to JS Maps', e);
            document.documentElement.classList.remove('native-map');
            deps.setUseNativeMap(false);
            if (!document.getElementById('map')) {
                const area = document.querySelector('.map-area');
                const div = document.createElement('div');
                div.id = 'map';
                div.setAttribute('role', 'application');
                area.prepend(div);
            }
        }
    }

    if (!deps.getUseNativeMap()) {
        const mapOpts = {
            center: PORTO_VELHO_CENTER,
            zoom: 12,
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            gestureHandling: 'greedy',
            // Rotação 360° (dois dedos) + bússola para voltar ao norte, como no Google Maps
            rotateControl: true,
            rotateControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM },
            clickableIcons: false,
            keyboardShortcuts: false,
            disableDoubleClickZoom: false,
            styles: mapStyle
        };
        // Mapa vetorial (quando disponível) costuma ser mais fluido no celular
        // e é o que permite girar/inclinar livremente.
        try {
            if (google.maps.RenderingType && google.maps.RenderingType.VECTOR) {
                mapOpts.renderingType = google.maps.RenderingType.VECTOR;
            }
        } catch (e) {}

        deps.setMap(new google.maps.Map(document.getElementById('map'), mapOpts));
    }

    deps.setGeocoder(new google.maps.Geocoder());
    setDirectionsService(new google.maps.DirectionsService());
    const addressInput = document.getElementById('address');
    // Places só quando o usuário for digitar endereço (menos peso no boot).
    addressInput.addEventListener('focus', () => { ensurePlacesAutocomplete(); }, { once: true });

    // Login automático já rodou loadStorage no DOMContentLoaded: não reler/re-renderizar tudo.
    if (deps.getAuthReady()) {
        if (deps.getStorageLoadedUid() === deps.currentUid()) deps.refreshMapAfterStorageLoad();
        else deps.loadStorage();
    }
    deps.showStartMarker();
    document.getElementById('mapLoading')?.classList.add('hidden');
}
