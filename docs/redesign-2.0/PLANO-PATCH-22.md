# Plano e mapa da implementação — patch 22 (ficha da parada)

Resposta ao pedido de "sistema profissional de gerenciamento de rotas". Antes de
codificar, o que já existia no app foi mapeado, item por item, para não substituir
o que funciona.

## 1. Tecnologia e arquitetura (inspeção)

| Camada | O que o projeto usa |
|---|---|
| App | Capacitor 6 + WebView (Android), HTML/CSS/JS **sem framework** |
| UI | `index.html` + `src/styles/app.css` (blocos marcados `PATCH n`) + módulos em `src/js/` |
| Estado | `src/js/main.js` (orquestrador) injeta dependências nos módulos (`configureX({ ... })`) |
| Regras puras | `lib/*.js` em CommonJS, testadas com `node:test` (sem DOM) |
| Persistência | localStorage por usuário (`rotaflow_data_<uid>`) + cópia no Firestore (`persist.js`) |
| Mapa | `map-layer.js`: Google Maps **nativo** via `capacitor-google-map` e fallback para o JS Maps |
| Rotas | `routing.js` (DirectionsService), otimização aproximada para 3+ paradas |
| Câmera/voz | `camera.js` (fotos), `not-delivered.js`; voz: `webkitSpeechRecognition` |

## 2. O que já estava pronto (não foi refeito)

| Pedido | Onde já existe |
|---|---|
| Mapa com paradas, zoom, resumo | `map-layer.js`, `map-markers.js`, `route-ui.js` |
| Abrir navegação até a parada | `delivery-panel.js` → `openMapsNavigation` |
| Pesquisa com sugestões | `address-suggestions.js` (patch 20/21) + `name-suggestions.js` |
| Evitar duplicidade | `checkAddressDuplicate` + aviso "endereço já está na rota" |
| Pacotes +/− sem negativo | painel e modais (`parsePacotesInput`) |
| Otimização Primeira/Automática/Última | `routing.js` + `optimizeRoute` |
| Aplicar/descartar rota otimizada | `applyOptimizedRoute` / `discardOptimizedRoute` |
| Reordenar (subir/descer) | menu ⋯ da lista |
| Excluir com confirmação | `showConfirmModal` antes de remover |
| Histórico e agenda | `history.js`, `agenda-list.js` |
| Backup/restauração offline | `backup-store.js`, `persist.js` |

## 3. O que foi implementado agora (lacunas reais)

1. **Ficha da parada** (`edit-modals.js`) ganhou: tipo de operação (Entrega/Coleta),
   nº do pedido, complemento, ponto de referência, tempo estimado na parada e
   ordem (Primeira / Automática / Última) que move a parada na hora.
2. **Duplicar parada** (menu ⋯): cria uma nova parada pendente, sem fotos,
   sem cronômetro e **sem copiar o nº do pedido** (evita código repetido).
3. **Total de pacotes da rota** no resumo do dia (`route-ui.js`), contando 1
   para parada sem quantidade.
4. **Filtro por tipo de operação** no painel de filtros + selos `COLETA` e
   `#pedido` na lista.
5. **Busca** também acha por nº do pedido, complemento e referência.
6. Helpers puros em `lib/delivery-extra-helpers.js` (22 testes novos).

## 4. Provas executadas (Playwright, 412×915)

| Roteiro | Resultado |
|---|---|
| Total de pacotes | 3+2+1 = **6**, depois da duplicata **8** |
| Ficha com os 6 campos novos | todos presentes |
| Salvar coleta + pedido P-4471 + complemento + referência + 7 min | gravado e visível na lista (selos COLETA e P-4471) |
| Ordem "Última" | N1 foi para o fim: `N2, N3, N1` |
| Duplicar | nova parada `A4`, status Pendente, sem pedido |
| Recarregar o app | 4 paradas, selos e total de pacotes continuam |
| Filtro "Coleta" | lista só com a parada de coleta, contador = 1 |
| Erros de console | 0 |

## 5. O que depende de configuração externa (documentado, não inventado)

| Recurso | Situação |
|---|---|
| Leitura de código de barras / QR na câmera | O app não tem biblioteca de leitura hoje. Implementar exige adicionar o plugin `@capacitor-mlkit/barcode-scanning` e **recompilar o Android** (não dá para injetar no APK sem recompilar). O campo `pedido` já guarda o código, então o vínculo está pronto para quando o leitor entrar. |
| Entrada por voz com comandos ("adicionar entrega na Rua X, 2823") | A WebView Android expõe `webkitSpeechRecognition` só quando o Google Play Services e a permissão de microfone estão disponíveis; o parser de comando precisa de uma etapa de confirmação antes de salvar. Proposta no relatório. |
| Mapa | Chave restrita por pacote + SHA-1; com a chave de teste o mapa nativo pode ficar branco (ver patch 21: atalho para o mapa da web). |
| Rotas/estimativas | DirectionsService já em uso; a chave precisa ter *Directions API* e *Places* habilitadas. |
