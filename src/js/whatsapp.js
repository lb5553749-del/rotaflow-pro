/**
 * Abertura do WhatsApp (web/nativo) e envio da mensagem da entrega.
 * Helpers puros em lib/whatsapp-helpers.js; main injeta estado via configureWhatsApp().
 */
import {
    formatPhoneShort,
    getWhatsAppPhoneDigits,
    getWhatsAppLink,
    getWhatsAppAppLink
} from '../../lib/phone-helpers.js';
import {
    companyDisplayName as companyDisplayNamePure,
    buildDeliveryWhatsAppMessage as buildDeliveryWhatsAppMessagePure
} from '../../lib/whatsapp-helpers.js';
import { EMPRESA_PADRAO, MENSAGEM_WHATSAPP_PADRAO } from './auth.js';

let deps = {
    isNativeApp: () => false,
    getUserProfile: () => ({}),
    showToast: () => {},
    showChoiceModal: async () => null,
    prepareTrackingUrl: () => '',
    publishTrackingSession: () => {},
    getGpsEnabled: () => false,
    getStartPoint: () => null
};

export function configureWhatsApp(opts) {
    deps = { ...deps, ...(opts || {}) };
}

export async function openExternalUrl(url) {
    if (!url) return false;
    try {
        if (deps.isNativeApp() && window.RotaFlowCap && typeof window.RotaFlowCap.openUrl === 'function') {
            return !!(await window.RotaFlowCap.openUrl(url));
        }
    } catch (_) {
        if (deps.isNativeApp()) return false;
    }
    try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
    } catch (_) {}
    try {
        window.location.href = url;
        return true;
    } catch (_) {
        return false;
    }
}

export async function openWhatsAppChat(phone, msg) {
    if (!getWhatsAppPhoneDigits(phone)) return false;
    const webLink = getWhatsAppLink(phone, msg);
    if (webLink && await openExternalUrl(webLink)) return true;
    if (deps.isNativeApp()) {
        const appLink = getWhatsAppAppLink(phone, msg);
        if (appLink && await openExternalUrl(appLink)) return true;
    }
    return false;
}

export function companyDisplayName() {
    return companyDisplayNamePure(deps.getUserProfile(), EMPRESA_PADRAO);
}

export function buildDeliveryWhatsAppMessage(delivery, opts = {}) {
    return buildDeliveryWhatsAppMessagePure(delivery, opts, {
        profile: deps.getUserProfile(),
        empresaPadrao: EMPRESA_PADRAO,
        mensagemPadrao: MENSAGEM_WHATSAPP_PADRAO
    });
}

export async function sendWhatsApp(delivery) {
    if (!delivery.telefones || delivery.telefones.length === 0) {
        return deps.showToast("Nenhum telefone cadastrado para esta entrega", true);
    }
    let phoneToUse = delivery.telefones[0];
    if (delivery.telefones.length > 1) {
        const choice = await deps.showChoiceModal({
            title: 'WhatsApp',
            message: 'Selecione o número para enviar a mensagem:',
            options: delivery.telefones.map(p => ({
                label: (p.label ? p.label + ' · ' : '') + formatPhoneShort(p.numero),
                value: p,
                icon: 'fab fa-whatsapp',
                iconColor: '#25D366'
            }))
        });
        if (!choice) return;
        phoneToUse = choice;
    }
    const trackUrl = deps.prepareTrackingUrl(delivery) || '';
    if (trackUrl) deps.publishTrackingSession(delivery);
    const msg = buildDeliveryWhatsAppMessage(delivery, {
        nome: phoneToUse.label || delivery.nome,
        trackUrl
    });
    if (trackUrl && (!deps.getGpsEnabled() || !deps.getStartPoint())) {
        deps.showToast('Link no WhatsApp. Ligue o GPS para o cliente ver você no mapa');
    }
    if (!getWhatsAppPhoneDigits(phoneToUse.numero)) {
        deps.showToast("Número de telefone inválido", true);
        return;
    }
    const opened = await openWhatsAppChat(phoneToUse.numero, msg);
    if (!opened) deps.showToast('Não foi possível abrir o WhatsApp', true);
}
