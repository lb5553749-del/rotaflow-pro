/**
 * Snackbar de desfazer rápido após marcar entrega/falha.
 * Ação de undo vem via configureUndoSnackbar().
 */

let deps = {
    undoDeliveryStatus: () => {}
};

export function configureUndoSnackbar(opts) {
    deps = { ...deps, ...(opts || {}) };
}

let undoSnackbarTimer = null;
let undoSnackbarTargetId = null;

export function hideUndoSnackbar() {
    clearTimeout(undoSnackbarTimer);
    undoSnackbarTimer = null;
    undoSnackbarTargetId = null;
    const el = document.getElementById('undoSnackbar');
    if (el) el.hidden = true;
}

export function showUndoSnackbar(deliveryId, message) {
    const el = document.getElementById('undoSnackbar');
    const text = document.getElementById('undoSnackbarText');
    if (!el || !text) return;
    undoSnackbarTargetId = deliveryId;
    text.textContent = message;
    el.hidden = false;
    clearTimeout(undoSnackbarTimer);
    undoSnackbarTimer = setTimeout(hideUndoSnackbar, 6000);
}

export function setupUndoSnackbar() {
    document.getElementById('undoSnackbarBtn')?.addEventListener('click', () => {
        if (undoSnackbarTargetId == null) return;
        const id = undoSnackbarTargetId;
        hideUndoSnackbar();
        deps.undoDeliveryStatus(id, { keepPanel: true, keepMinimized: true });
    });
}
