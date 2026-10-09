/**
 * Resource hints inteligentes: preload/prefetch dinâmico baseado em interação.
 * Carrega recursos antes que o usuário precise deles.
 */

import { prefetchOnInteraction } from './lazy-loader.js';

const preloadedResources = new Set();

/**
 * Adiciona um resource hint dinamicamente.
 * @param {string} href - URL do recurso
 * @param {string} as - Tipo do recurso (script, style, font, image)
 * @param {Object} options - Opções adicionais
 */
function addResourceHint(href, as, options = {}) {
    if (preloadedResources.has(href)) return;

    const link = document.createElement('link');
    link.rel = options.preload ? 'preload' : 'prefetch';
    link.href = href;
    link.as = as;

    if (options.crossorigin) {
        link.crossOrigin = options.crossorigin;
    }

    if (options.type) {
        link.type = options.type;
    }

    document.head.appendChild(link);
    preloadedResources.add(href);
}

/**
 * Configura prefetch baseado em interação do usuário.
 */
export function setupInteractivePrefetch() {
    // Prefetch do módulo de backup quando usuário passa o mouse no botão
    const backupBtn = document.getElementById('backupBtn');
    const backupReminderBtn = document.getElementById('backupReminderNowBtn');

    [backupBtn, backupReminderBtn].forEach(btn => {
        if (btn) {
            prefetchOnInteraction(
                btn,
                'backup-ui',
                () => import('./backup-ui.js')
            );
        }
    });

    // Prefetch do módulo de histórico quando usuário clica na aba
    const historyTab = document.querySelector('[data-tab="historico"]');
    if (historyTab) {
        prefetchOnInteraction(
            historyTab,
            'history',
            () => import('./history.js')
        );
    }

    // Prefetch de edit-modals quando usuário interage com uma entrega
    const deliveriesList = document.getElementById('deliveriesList');
    if (deliveriesList) {
        let prefetched = false;
        deliveriesList.addEventListener('mouseenter', () => {
            if (!prefetched) {
                prefetched = true;
                import('./edit-modals.js').catch(() => {});
            }
        }, { once: true, passive: true });
    }
}

/**
 * Prefetch de recursos com base no estado do app.
 */
export function prefetchByAppState() {
    // Se há entregas na rota, prefetch do módulo de rastreamento
    const deliveryCount = document.getElementById('deliveryCountBadge')?.textContent;
    if (deliveryCount && parseInt(deliveryCount) > 0) {
        setTimeout(() => {
            import('./tracking.js').catch(() => {});
        }, 3000);
    }

    // Se há itens na agenda, prefetch do módulo agenda-route
    const agendaCount = document.getElementById('agendaCountBadge')?.textContent;
    if (agendaCount && parseInt(agendaCount) > 0) {
        setTimeout(() => {
            import('./agenda-route.js').catch(() => {});
        }, 5000);
    }
}

/**
 * Prefetch de recursos quando o browser está ocioso.
 */
export function prefetchOnIdle() {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
            // Prefetch de módulos pesados em background
            const modules = [
                () => import('./backup-ui.js'),
                () => import('./history.js'),
                () => import('./edit-modals.js')
            ];

            modules.forEach((loader, index) => {
                setTimeout(() => {
                    loader().catch(() => {});
                }, index * 2000); // Espaça os carregamentos
            });
        }, { timeout: 5000 });
    }
}

/**
 * Prefetch de imagens críticas que estão fora da viewport.
 */
export function prefetchCriticalImages() {
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            observer.unobserve(img);
                        }
                    }
                });
            },
            {
                rootMargin: '50px' // Carrega imagens 50px antes de entrar na viewport
            }
        );

        // Observa imagens com lazy loading
        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }
}

/**
 * Inicializa todos os resource hints inteligentes.
 */
export function initResourceHints() {
    // Aguarda o app estar pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupInteractivePrefetch();
            prefetchByAppState();
            prefetchOnIdle();
            prefetchCriticalImages();
        });
    } else {
        setupInteractivePrefetch();
        prefetchByAppState();
        prefetchOnIdle();
        prefetchCriticalImages();
    }
}
