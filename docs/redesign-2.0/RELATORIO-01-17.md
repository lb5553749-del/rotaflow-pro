# Relatório — patch 17 (redesign 2.0, parte 3)

Data: 20/10/2026 · repo `lb5553749-del/rotaflow-pro` · `main` @ `849f6fd`
`npm run verify` → **423/423 testes**, lint e typecheck limpos.

## Medição antes/depois (Playwright, 412×915, 6 entregas)

| Métrica | 01–16 | 01–17 | Δ |
|---|---|---|---|
| Moldura até a 1ª parada | 360 px | **258 px** | −28% |
| Altura do item | 192 px | **120 px** | −38% |
| Itens na dobra (padrão 64%) | 2 | **3** (2 inteiros + o 3º em 83%) | +1 |
| Itens na dobra (alça expandida) | 3 | **4 inteiros + o 5º** | +1 |
| Estouro horizontal | 0 | 0 | = |
| Erros de console | 0 | 0 | = |

## Onde estavam os 192 px do item

| Parte | Antes | Depois |
|---|---|---|
| Cabeçalho (nº + favorito + nome + status) | 22 | 22 |
| Meta (ordem, janela, risco, fotos, tempo) | 13 | 13 |
| Endereço | 16 | 15 |
| Telefone | 16 | 13 |
| Links (Foto/WhatsApp/Rastreio) + ações (status/⋯) em **duas** linhas | 32 + 47 | **26 em uma linha** |
| Margens e respiro | ~46 | ~18 |

## Moldura: o que saiu

- Filtros (50 px) agora é um botão quadrado (34 px) ao lado da busca → **−50 px**.
- Rótulo "Rota atual" oculto no celular (a aba já diz) → −15 px.
- Alça 22 → 16 px, abas 40 → 34 px, resumo do dia 41 → 23 px, ferramentas 48 → 36 px.
- Bug corrigido: `patch 16` tinha deixado `.day-progress { height: 4px }` no contêiner inteiro, então o cabeçalho do progresso vazava sobre o resumo do dia (barra em y=441, resumo em y=432).

## Arquivos tocados

- `lib/list-helpers.js` — rodapé único do item (`.delivery-foot`), classes `.delivery-address` / `.delivery-phone`, rótulos em `<span class="lbl">`.
- `index.html` — `.search-row` envolvendo busca + filtros.
- `src/styles/app.css` — blocos "PATCH 17" A/B/C/D.
- `test/bottom-sheet.test.js` — 7 testes novos (rodapé único, classes, ícones preservados, busca+filtros, progresso, altura do item).

## Verificações de interação (Playwright)

- ⋯ da parada abre com as 8 ações (`Editar … Remover`).
- Trocar o status no seletor atualiza o selo (`Pendente → Entregue`) sem erro.
- Atalhos do rodapé clicáveis, 26×26, e o desenho de cada ícone preservado.
- Tema escuro idêntico em layout; desktop (1280 px) sem regressão visual.

## Pendente

1. Medição pós-R8 (precisa do seu PC ROTAFLO).
2. Zip da raiz (`android/app/src/main/res/`, `AndroidManifest.xml`, `MainActivity.java`).
3. Revogar os dois tokens antigos no GitHub.
