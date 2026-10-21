# Redesign 2.0 — série de patches 14 a 19

Registro do trabalho de aparência e densidade de tela feito entre os patches 14 e 19.
Todo o código está em `src/styles/app.css` (blocos marcados `PATCH 14` … `PATCH 19`),
`lib/list-helpers.js`, `index.html`, `src/js/app-boot.js` e nos testes de
`test/bottom-sheet.test.js`.

## Commits

| commit | patch | o que entregou |
|---|---|---|
| `e7b1016` | 14 | cronômetro por entrega e resumo do dia com tempo |
| `5d5f7c8` | 15 | tema em três estados (Claro / Escuro / Sistema), folha em 64%, mapa em 36dvh |
| `78800b3` | — | tempo do dia nos dias arquivados do histórico |
| `2a8fd22` | 16 | corta a moldura antes da lista (marca oculta, banner em 1 linha, ferramentas em 1 linha, Nova rota/Limpar no menu ⋯) |
| `849f6fd` | 17 | item compacto (192 → 120 px) e busca + filtros na mesma linha |
| `0bdbaae` | 18 | resumo do dia na linha do progresso e meta ao lado do endereço (item 105 px) |
| `2ab0b33` + `d7bc843` | 19 | aviso de backup no cabeçalho e progresso fixo ao rolar |

## Medições (Playwright, 412×915, 6 entregas)

| métrica | 01–16 | 01–17 | 01–18 | 01–19 |
|---|---|---|---|---|
| moldura até a 1ª parada | 360 px | 258 px | 229 px | **205 px** |
| altura do item | 192 px | 120 px | 105 px | 105 px |
| paradas inteiras na dobra (64%) | 1 | 2 | 3 | **3** |
| paradas inteiras rolando 140 px | — | 4 | 4 | **4** (+ a 5ª aparecendo) |
| paradas inteiras com a alça em 90% | 3 | 4 | 5 | **5** |

Testes: `npm run verify` → 431/431 (lint + typecheck + node:test + build).

## APKs publicados

| série | sha256 |
|---|---|
| 01–14 | `f74bdb69c73cbc603a9998f7640bfaf47eda270d33b5e865103cdb3f1073deb7` |
| 01–15 | `3de42d2142e4ca1ec8749091ac1ec563a9f42fd2655d8271122efcfca2411dc3` |
| 01–16 | `294d709e0d281304b92b58440b98c7fc4a39a0376626f390b220bf1fc9255a75` |
| 01–17 | `f188b5d93586608c0286cebc0f49ef00c36f499c5dc5f8fa26e2fa24842bcd17` |
| 01–18 | `f2c6fdf05057d3cb821b211e07ac4e125d7e0f92a027d7365fc1f995daecb910` |
| **01–19** | `0442f72d00215a69153f22347fe6ccb26f474954962dc501cb0db4b7ab305a78` |

Assinatura **v2 apenas** (`apksigner --v1-signing-enabled false --v2-signing-enabled true`)
com `rotaflow-teste.jks` (alias `rotaflow`) — mesma chave em toda a série, então a chave do
Google Maps continua valendo e o APK instala por cima do anterior.

## Arquivos desta pasta

- `INSTALAR-APK-01-19.md` — instruções de instalação do APK mais recente
- `RELATORIO-01-16.md` … `RELATORIO-01-19.md` — relatório de cada patch
- `SHA256.txt` — hashes do APK 01–19 (assinado e unsigned)

## Decisões travadas por teste

- O **desenho de cada ícone** (Navegar, WhatsApp, Foto, Entregar, Falhou, Desfazer e os do
  rodapé da parada) não muda; só o layout pode mudar.
- Alvos de toque continuam com `min-height: 36px` nas ferramentas da rota.
- Nenhuma ação da parada foi removida: as 8 ações seguem no menu ⋯.
