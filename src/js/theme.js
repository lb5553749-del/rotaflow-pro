/**
 * Tema escuro a partir da preferência salva.
 *
 * Módulo separado (eager, ~20 linhas) de propósito: isto precisa rodar **antes do
 * primeiro paint**, senão a tela pisca clara em quem usa o tema escuro. O resto do
 * perfil (modal, preferências, ~10 KB) virou lazy no patch 06.
 */

export function initDarkModeFromStorage() {
    try {
        const pref = localStorage.getItem('rotaflow_dark_theme');
        if (pref === '1') {
            document.documentElement.classList.add('dark-theme');
        } else if (pref === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark-theme');
        }
    } catch (_) {}
}
