/**
 * Ligação dos botões de backup/restauração (só os `addEventListener`).
 *
 * O módulo de verdade — `backup-ui.js`, 12,5 KB — só é baixado quando o motorista
 * usa um destes botões (ou no primeiro idle, para o lembrete/auto-backup). Esses
 * `addEventListener` precisam existir no boot, então ficam aqui, num arquivo de
 * ~1 KB, sem importar nada pesado.
 *
 * @param {{ backupData: Function, restoreData: Function, backupAgenda: Function, restoreAgenda: Function, restoreFromJson: Function }} lazy
 *   fachada que carrega `backup-ui.js` na primeira chamada
 */
export function bindBackupButtons(lazy) {
    document.getElementById('backupBtn')?.addEventListener('click', () => lazy.backupData());
    document.getElementById('restoreBtn')?.addEventListener('click', () => document.getElementById('importFileInput')?.click());
    document.getElementById('importFileInput')?.addEventListener('change', (e) => {
        const input = /** @type {HTMLInputElement} */ (e.target);
        if (input.files && input.files.length) {
            lazy.restoreData(input.files[0]);
            input.value = '';
        }
    });
    document.getElementById('backupAgendaBtn')?.addEventListener('click', () => lazy.backupAgenda());
    document.getElementById('restoreAgendaBtn')?.addEventListener('click', () => document.getElementById('restoreAgendaInput')?.click());
    document.getElementById('restoreAgendaInput')?.addEventListener('change', (e) => {
        const input = /** @type {HTMLInputElement} */ (e.target);
        if (input.files && input.files.length) {
            lazy.restoreAgenda(input.files[0]);
            input.value = '';
        }
    });

    // Escuta evento nativo disparado pelo Android ao clicar num arquivo .rfpro
    window.addEventListener('rotaflow:openBackup', (ev) => {
        const e = /** @type {CustomEvent} */ (ev);
        if (e && e.detail) lazy.restoreFromJson(e.detail);
    });
}
