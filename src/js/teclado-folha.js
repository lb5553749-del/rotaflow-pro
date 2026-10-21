/**
 * Patch 20: o teclado do Android encolhe a janela e a folha inferior ficava com
 * o campo focado escondido atrás dele (parecia que o app "travava" ao tocar em
 * qualquer campo). Aqui, ao focar um campo de digitação:
 *   1. a folha sobe para a tela inteira (classe `kb-open` no <html>);
 *   2. o campo é trazido para o meio da área visível;
 * e ao sair do campo tudo volta ao encaixe de 64%.
 */
export function setupTecladoNaFolha() {
    if (document.documentElement.dataset.tecladoFolha === 'on') return;
    document.documentElement.dataset.tecladoFolha = 'on';
    const ehCampo = (el) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const dentroDoPainel = (el) => !!(el && el.closest && el.closest('#sidebar'));

    const trazerParaAVista = (el) => {
        if (!el || !el.scrollIntoView) return;
        try {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (_) {
            el.scrollIntoView();
        }
    };

    document.addEventListener('focusin', (e) => {
        if (!ehCampo(e.target) || !dentroDoPainel(e.target)) return;
        document.documentElement.classList.add('kb-open');
        // espera a animação/teclado antes de centralizar o campo
        setTimeout(() => trazerParaAVista(e.target), 260);
    });

    document.addEventListener('focusout', (e) => {
        if (!ehCampo(e.target)) return;
        // se o foco foi para outro campo, continua aberto
        setTimeout(() => {
            if (!ehCampo(document.activeElement)) {
                document.documentElement.classList.remove('kb-open');
            }
        }, 120);
    });

    // alguns aparelhos só ajustam o visualViewport: reavalia ao encolher
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            const el = document.activeElement;
            if (ehCampo(el) && dentroDoPainel(el) && window.visualViewport.height < window.innerHeight * 0.8) {
                document.documentElement.classList.add('kb-open');
                trazerParaAVista(el);
            }
        });
    }
}
