/**
 * Lazy loader: carrega módulos sob demanda para otimizar o tempo de boot.
 * Os módulos pesados (backup, histórico, edit-modals) são carregados apenas quando necessários.
 */

const loadedModules = new Map();
const loadingPromises = new Map();

/**
 * Carrega um módulo dinamicamente e cacheia o resultado.
 * @param {string} moduleName - Nome do módulo a carregar
 * @param {() => Promise<any>} loader - Função que retorna o import dinâmico
 * @returns {Promise<any>} Promise que resolve com o módulo carregado
 */
export async function lazyLoad(moduleName, loader) {
    // Se já foi carregado, retorna do cache
    if (loadedModules.has(moduleName)) {
        return loadedModules.get(moduleName);
    }

    // Se está sendo carregado, retorna a promise existente
    if (loadingPromises.has(moduleName)) {
        return loadingPromises.get(moduleName);
    }

    // Inicia o carregamento
    const loadPromise = loader()
        .then(module => {
            loadedModules.set(moduleName, module);
            loadingPromises.delete(moduleName);
            return module;
        })
        .catch(err => {
            loadingPromises.delete(moduleName);
            console.error(`Erro ao carregar módulo ${moduleName}:`, err);
            throw err;
        });

    loadingPromises.set(moduleName, loadPromise);
    return loadPromise;
}

/**
 * Verifica se um módulo já foi carregado.
 * @param {string} moduleName
 * @returns {boolean}
 */
export function isLoaded(moduleName) {
    return loadedModules.has(moduleName);
}

/**
 * Pré-carrega módulos em background quando o browser está ocioso.
 * @param {Array<{name: string, loader: () => Promise<any>}>} modules
 */
export function prefetchModules(modules) {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
            modules.forEach(({ name, loader }) => {
                if (!isLoaded(name) && !loadingPromises.has(name)) {
                    lazyLoad(name, loader).catch(() => {
                        // Silenciosamente falha no prefetch, será tentado novamente no uso real
                    });
                }
            });
        }, { timeout: 2000 });
    } else {
        // Fallback para browsers sem requestIdleCallback
        setTimeout(() => {
            modules.forEach(({ name, loader }) => {
                if (!isLoaded(name) && !loadingPromises.has(name)) {
                    lazyLoad(name, loader).catch(() => {});
                }
            });
        }, 1000);
    }
}

/**
 * Pré-carrega módulos baseado em interação do usuário (hover, focus).
 * @param {HTMLElement} trigger - Elemento que dispara o prefetch
 * @param {string} moduleName
 * @param {() => Promise<any>} loader
 */
export function prefetchOnInteraction(trigger, moduleName, loader) {
    if (!trigger) return;

    let prefetched = false;
    const prefetch = () => {
        if (!prefetched && !isLoaded(moduleName)) {
            prefetched = true;
            lazyLoad(moduleName, loader).catch(() => {});
        }
    };

    // Prefetch no hover (desktop) ou no touchstart (mobile)
    trigger.addEventListener('mouseenter', prefetch, { once: true, passive: true });
    trigger.addEventListener('focus', prefetch, { once: true, passive: true });
    trigger.addEventListener('touchstart', prefetch, { once: true, passive: true });
}
