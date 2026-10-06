/**
 * Transições de status da entrega: marcar entregue, desfazer e geocode ao editar endereço.
 */
let deps = {
    getDeliveries: () => [],
    getCurrentSelectedDelivery: () => null,
    getGeocoder: () => null,
    showToast: () => {},
    saveStorage: () => {},
    syncTrackingStatus: () => {},
    getMarker: () => null,
    updateMarkerIcon: () => {},
    rebuildMarkers: () => {},
    renderDeliveriesList: () => {},
    releaseInMemoryPhotosExcept: () => {},
    sendDeliveredPush: () => {},
    upsertMarker: () => {},
    updateDeliveryStats: () => {},
    notifyRouteCompositionChanged: () => {},
    playDeliveryFeedback: () => {},
    noteDeliveryCompletedForBackup: () => {},
    countNormalActiveStops: () => 0,
    maybeNotifyVoltarDepois: () => {},
    minimizeDeliveryPanel: () => {},
    goToAdjacentDelivery: () => {},
    openDeliveryPanel: async () => {},
    syncActiveStopNotification: () => {}
};

export function configureDeliveryStatus(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export function geocodeAddressAndUpdate(delivery, newAddress, callback) {
    // Adia 1 frame para não competir com o fecho do modal / gesto.
    if (newAddress === delivery.endereco) { callback?.(true); return; }
    const geocoder = deps.getGeocoder();
    if (!geocoder) {
        deps.showToast('Aguarde o mapa carregar para localizar o endereço', true);
        callback?.(false);
        return;
    }
    deps.showToast("Localizando endereço…");
    const run = () => {
        geocoder.geocode({ address: newAddress }, (res, stat) => {
            if (stat === "OK" && res[0]) {
                delivery.lat = res[0].geometry.location.lat();
                delivery.lng = res[0].geometry.location.lng();
                delivery.endereco = newAddress;
                deps.saveStorage();
                deps.syncTrackingStatus(delivery);
                const marker = deps.getMarker(delivery.sequentialId);
                if (marker) { marker.setPosition({ lat: delivery.lat, lng: delivery.lng }); deps.updateMarkerIcon(marker, delivery); } else { deps.rebuildMarkers(false); }
                deps.renderDeliveriesList();
                deps.showToast("Endereço atualizado");
                callback?.(true);
            } else { deps.showToast("Não foi possível localizar este endereço", true); callback?.(false); }
        });
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 600 });
    else setTimeout(run, 50);
}

export async function markDelivered(id, { advance = false } = {}) {
    try {
        const d = deps.getDeliveries().find(x => x.id === id);
        if (!d || d.status === 'entregue') return;
        const normalsBefore = deps.countNormalActiveStops();
        d.status = 'entregue';
        d.voltarDepois = false;
        delete d.failReason;
        // Libera JPEGs em memória de outras paradas — o backup/auto e o avanço no painel matavam o WebView.
        try { deps.releaseInMemoryPhotosExcept(d.id); } catch (_) {}
        try { deps.saveStorage(); } catch (_) {}
        try { deps.syncTrackingStatus(d); } catch (e) { console.warn('syncTrackingStatus', e); }
        try { deps.sendDeliveredPush(d); } catch (e) { console.warn('sendDeliveredPush', e); }
        try { deps.upsertMarker(d); } catch (e) { console.warn('upsertMarker', e); }
        try { deps.updateDeliveryStats(); } catch (_) {}
        try { deps.renderDeliveriesList(); } catch (_) {}
        try { deps.notifyRouteCompositionChanged({ keepRoute: true }); } catch (_) {}
        try { deps.playDeliveryFeedback(); } catch (_) {}
        try { deps.noteDeliveryCompletedForBackup(); } catch (_) {}
        try { deps.maybeNotifyVoltarDepois(normalsBefore); } catch (_) {}
        if (advance) {
            try { deps.minimizeDeliveryPanel(); } catch (_) {}
            try {
                deps.goToAdjacentDelivery(1, { preferPending: true, keepMinimized: true });
            } catch (e) {
                console.warn('goToAdjacentDelivery', e);
            }
        } else if (deps.getCurrentSelectedDelivery() && deps.getCurrentSelectedDelivery().id === id) {
            const mini = !!document.getElementById('deliveryPanel')?.classList.contains('minimized');
            try { await deps.openDeliveryPanel(d, { keepMinimized: mini }); } catch (_) {}
        } else {
            try { deps.syncActiveStopNotification(deps.getCurrentSelectedDelivery()); } catch (_) {}
        }
    } catch (e) {
        console.error('markDelivered', e);
        try { deps.showToast('Não foi possível concluir a entrega', true); } catch (_) {}
    }
}

export function undoDeliveryStatus(id, { keepPanel = false, keepMinimized = false } = {}) {
    const d = deps.getDeliveries().find(x => x.id === id);
    if (!d) return;
    if (d.status !== 'entregue' && d.status !== 'falhou') return;
    d.status = 'pendente';
    d.voltarDepois = false;
    delete d.failReason;
    delete d.deliveredNotified;
    delete d.absentNotified;
    deps.saveStorage();
    deps.syncTrackingStatus(d);
    deps.upsertMarker(d);
    deps.updateDeliveryStats();
    deps.renderDeliveriesList();
    deps.notifyRouteCompositionChanged({ keepRoute: true });
    deps.showToast(`Entrega ${d.sequentialId} reaberta como pendente`);
    if (keepPanel || (deps.getCurrentSelectedDelivery() && deps.getCurrentSelectedDelivery().id === id)) {
        deps.openDeliveryPanel(d, { keepMinimized });
    }
}
