# Relatório — série perf 01–16 (redesign 2.0)

Data: 20/10/2026 · repo `lb5553749-del/rotaflow-pro` · branch `main` @ `2a8fd22`

## Commits no ar

| commit | conteúdo |
|---|---|
| `e7b1016` | cronômetro por entrega + resumo do dia com tempo |
| `5d5f7c8` | tema em 3 estados (Claro / Escuro / Sistema), folha em 64%, mapa em 36dvh |
| `78800b3` | tempo do dia nos dias arquivados do histórico |
| `2a8fd22` | **patch 16** — corta a moldura antes da lista |

`npm run verify` → **416/416 testes**, lint e tsc limpos.

## Patch 16 — o que saiu da tela

| Item | Antes | Depois |
|---|---|---|
| Marca "RotaFlow" na folha | ~90 px | oculta na folha (só cabeçalho compacto) |
| Banner de backup | 3 linhas, ~1/3 da área útil | 1 linha com ellipsis |
| Ferramentas (Navegar/WhatsApp/Foto/Entregar/Falhou/Desfazer) | grade 2×2 | 1 linha, ícones preservados |
| Nova rota / Limpar rota | na barra, peso igual aos outros | menu ⋯, em vermelho |
| Item da parada | 192 px | compacto |

**Medição Playwright (6 entregas, tela 740×360 lógicos):** moldura acima da lista **570 → 360 px (−37%)**; itens visíveis na primeira dobra **1 → 2**.
O gargalo agora é a **altura do item** (192 px) — o próximo corte é ali.

Screenshots: `/home/user/perf/resultados/visual/redesign2/16-moldura-cortada.png`, `16-menu.png`.

## APK

- `rotaflow-pro-1.5.31-perf-01-16.apk` — 3.867.750 B
- sha256 `294d709e0d281304b92b58440b98c7fc4a39a0376626f390b220bf1fc9255a75`
- assinado v2 apenas, keystore de teste, mesma chave das séries anteriores (Maps OK)
- Drive: https://drive.google.com/file/d/1eCezmzT9Ce9LxopfeED_AKucOaOHA_DA/view

## Pendente

1. Patch 17 — item compacto de verdade (meta: 3–4 paradas na dobra).
2. Zip da raiz (`android/app/src/main/res/`, `AndroidManifest.xml`, `MainActivity.java`).
3. Medição pós-R8 no seu PC ROTAFLO (precisa de acesso à sua máquina).
4. Revogar os dois tokens antigos no GitHub.
