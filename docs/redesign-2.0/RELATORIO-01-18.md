# Relatório — patch 18 (redesign 2.0, parte 4)

Data: 20/10/2026 · repo `lb5553749-del/rotaflow-pro` · `main` @ `0bdbaae`
`npm run verify` → **427/427 testes**, lint e typecheck limpos.

## Série completa (mesma tela: 412×915, 6 entregas)

| Métrica | 01–16 | 01–17 | 01–18 |
|---|---|---|---|
| Moldura até a 1ª parada | 360 px | 258 px | **229 px** |
| Altura do item | 192 px | 120 px | **105 px** |
| Paradas inteiras na dobra (64%) | 1 | 2 | **3** (+ a 4ª aparecendo) |
| Paradas inteiras com a alça expandida | 3 | 4 | **5** (+ a 6ª) |
| Desperdício vertical até a 1ª parada | 61% | 44% | **39%** |

## O que mudou neste patch

1. **Resumo do dia dentro do progresso.** `.day-summary` passou para dentro de `#dayProgress` (depois da barra, para o desktop não mudar) e no celular vira flex com `order`: linha 1 = "1 de 6 entregas · 17% · 1 entregues · 1 falhas · 12 km", linha 2 = barra de 4 px. Economia: 24 px.
2. **Meta do item ao lado do endereço.** Tempo, janela, risco, fotos e ordem usam `float: right` + BFC no endereço: a linha de 13 px empilhada sumiu. Economia: 13 px por item.
3. **Ajustes finos** de alça (16 → 12), abas, banner de backup (24 px), ferramentas, busca e respiro do item.
4. Corrigido de passagem: "1 de 6 entregas17%" — faltava `gap` entre rótulo e porcentagem depois do flex.

## O que NÃO mudou

- Alvos de toque: botões de ferramenta seguem com `min-height: 36px` (não cortei para ganhar pixel).
- Nenhuma ação saiu do ⋯ da parada; ícones idênticos; temas Claro/Escuro/Sistema iguais.
- Estado vazio: com 0 entregas, progresso e resumo continuam escondidos e o "Rota vazia" aparece (verificado).

## Verificações

- Playwright: 0 erros de console, 0 estouro horizontal, claro/escuro/expandido/desktop.
- 4 testes novos (resumo dentro do progresso, flex+barra, meta à direita, alça baixa com alvo preservado) → 427 no total.

## Pendente

1. Medição pós-R8 (precisa do seu PC ROTAFLO).
2. Zip da raiz (`android/app/src/main/res/`, `AndroidManifest.xml`, `MainActivity.java`).
3. Revogar os dois tokens antigos no GitHub.
