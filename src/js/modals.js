/**
 * Modais do app (confirm / prompt / choice) e toast leve.
 * Sem estado de domínio — só DOM + escapeHtml.
 */
import { escapeHtml } from '../../lib/html.js';

export function showToast(msg, err = false) {
    const t = document.createElement('div');
    t.className = 'toast-message' + (err ? ' err' : '');
    const icon = document.createElement('i');
    icon.className = `fas ${err ? 'fa-exclamation-circle' : 'fa-check'}`;
    t.appendChild(icon);
    t.appendChild(document.createTextNode(' ' + msg));
    document.body.appendChild(t);
    setTimeout(() => t.remove(), Math.min(4500, 2800 + String(msg).length * 18));
}

export function openAppModal({ title, bodyHtml, buttons }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-container" style="max-width:420px;" role="dialog" aria-modal="true">
                <h3 class="modal-title">${title}</h3>
                <div class="modal-body">${bodyHtml || ''}</div>
                <div class="modal-buttons"></div>
            </div>`;
        const btnRow = overlay.querySelector('.modal-buttons');
        const finish = (value) => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            resolve(value);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') finish(null);
        };
        (buttons || []).forEach((btn) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = btn.className || 'modal-cancel';
            el.textContent = btn.label;
            el.addEventListener('click', () => {
                if (btn.getValue) finish(btn.getValue());
                else finish(btn.value);
            });
            btnRow.appendChild(el);
        });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
        const focusEl = overlay.querySelector('textarea, input, .modal-choice-btn, .modal-confirm, .modal-cancel');
        if (focusEl) setTimeout(() => focusEl.focus(), 30);
    });
}

export function showConfirmModal({
    title = 'Confirmar',
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    danger = false
} = {}) {
    return openAppModal({
        title,
        bodyHtml: `<p class="modal-message">${escapeHtml(message || '')}</p>`,
        buttons: [
            { label: confirmText, className: danger ? 'modal-confirm danger' : 'modal-confirm', value: true },
            { label: cancelText, className: 'modal-cancel', value: false }
        ]
    }).then((v) => v === true);
}

export function showPromptModal({
    title = 'Editar',
    message = '',
    defaultValue = '',
    placeholder = '',
    multiline = false
} = {}) {
    const field = multiline
        ? `<textarea id="appModalInput" class="edit-input" rows="4" style="resize:vertical;" placeholder="${escapeHtml(placeholder)}">${escapeHtml(defaultValue)}</textarea>`
        : `<input id="appModalInput" class="edit-input" type="text" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}">`;
    return openAppModal({
        title,
        bodyHtml: `${message ? `<p class="modal-message">${escapeHtml(message)}</p>` : ''}${field}`,
        buttons: [
            {
                label: 'Salvar',
                className: 'modal-confirm',
                getValue: () => {
                    const el = document.getElementById('appModalInput');
                    return el ? el.value : '';
                }
            },
            { label: 'Cancelar', className: 'modal-cancel', value: null }
        ]
    });
}

export function showChoiceModal({ title = 'Escolher', message = '', options = [] } = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const list = options.map((opt, i) => `
            <button type="button" class="modal-choice-btn" data-choice-index="${i}">
                <i class="${escapeHtml(opt.icon || 'fas fa-circle')}" style="color:${escapeHtml(opt.iconColor || '#64748b')}"></i>
                <span>${escapeHtml(opt.label)}</span>
            </button>`).join('');
        overlay.innerHTML = `
            <div class="modal-container" style="max-width:420px;" role="dialog" aria-modal="true">
                <h3 class="modal-title">${title}</h3>
                ${message ? `<p class="modal-message">${escapeHtml(message)}</p>` : ''}
                <div class="modal-choice-list">${list}</div>
                <div class="modal-buttons">
                    <button type="button" class="modal-cancel">Cancelar</button>
                </div>
            </div>`;
        const finish = (value) => {
            overlay.remove();
            document.removeEventListener('keydown', onKey);
            resolve(value);
        };
        const onKey = (e) => { if (e.key === 'Escape') finish(null); };
        overlay.querySelectorAll('.modal-choice-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.choiceIndex, 10);
                finish(options[idx] ? options[idx].value : null);
            });
        });
        overlay.querySelector('.modal-cancel').addEventListener('click', () => finish(null));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);
    });
}
