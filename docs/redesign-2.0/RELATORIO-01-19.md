# Relatório — patch 19 (redesign 2.0, parte 5)

Data: 20/10/2026 · repo `lb5553749-del/rotaflow-pro` · `main` @ `d7bc843`
`npm run verify` → **431/431 testes**, lint e typecheck limpos.

## Medição (412×915, 6 entregas)

| Momento | Moldura até a 1ª parada | Paradas inteiras | Na dobra |
|---|---|---|---|
| Topo (01–18) | 229 px | 3 | 4 |
| **Topo (01–19)** | **205 px** | 3 | 4 |
| Rolado 140 px (01–18) | 120 px | 4 | 5 |
| **Rolado 140 px (01–19)** | **56 px** | **4** | **5** |
| Alça expandida (90%) | 205 px | **5** | 6 |
| Desktop 1280×900 | 469 px | 2 | 3 |

## Achado importante

A moldura **já rolava junto com a lista** antes deste patch: o rolador é `.sidebar-panel` e `.list-scroll` está com `overflow: visible`. O que faltava era o topo da folha — e o progresso sumir ao rolar. Então o patch 19 atacou os dois pontos reais:

1. **Selo de backup no cabeçalho.** `#backupReminder` saiu de dentro do painel e foi para `.sidebar-header`, dividindo a linha com o status de sincronização. No celular vira `⚠ Fazer agora ✕` (18 px de altura, texto completo no `title`); no desktop continua em linha própria, agora acima das abas.
2. **Progresso grudado.** `#dayProgress` ganhou `position: sticky` e, a partir de 24 px de rolagem, recebe `.is-scrolled` (JS em `app-boot.js`, listener passivo + reavaliação no clique das abas): os chips do resumo somem e sobra "1 de 6 entregas · 17%" com a barra de 4 px.

3. **"Agora não" preservado.** No celular o dispensar virou ✕ (16×16) em vez de desaparecer — o aviso continua dispensável pelo dedo.

## Bugs corrigidos de passagem

- O selo herdava `flex-direction: column` de `.backup-reminder-actions`, o que fazia o cabeçalho crescer para 42 px; agora é linha única (18 px).
- `flex-wrap: wrap` herdado do breakpoint de 768 px jogava o selo para uma segunda linha; anulado no breakpoint de 780 px.

## Verificações

- 0 erros de console; 0 estouro horizontal; claro, escuro, expandido e desktop.
- Dispensar funciona (`is-visible` some após o clique) e o estado persiste.
- 4 testes novos: aviso dentro do cabeçalho, selo de uma linha, `position: sticky` + `.is-scrolled`, e o boot ligando o observador → 431 no total.

## Pendente

1. Medição pós-R8 (precisa do seu PC ROTAFLO).
2. Zip da raiz (`android/app/src/main/res/`, `AndroidManifest.xml`, `MainActivity.java`).
3. Revogar os dois tokens antigos no GitHub.
