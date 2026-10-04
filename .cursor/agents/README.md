# Subagentes do RotaFlow Pro

Cada arquivo `.md` desta pasta define um subagente do Cursor com escopo próprio. Eles rodam em contexto isolado, com um system prompt especializado, e já conhecem os caminhos, os comandos e as armadilhas deste repositório. Todos foram escritos a partir da leitura direta do código e de `docs/AUDITORIA-TECNICA.md`, então citam arquivo e linha em vez de dar conselho genérico.

Para acionar um deles, peça pelo nome no chat:

```
Use o subagente <nome> para <tarefa>
```

O Cursor também pode delegar sozinho quando a tarefa casa com a descrição do subagente.

São oito, e os escopos não se sobrepõem. Quando dois são vizinhos, a seção de cada um diz onde fica a fronteira.

## `firebase-rules-auditor`

**Quando usar.** Sempre que `firestore.rules`, `storage.rules`, `database.rules.json`, `firebase.json`, `functions/index.js`, `track.html` ou qualquer código que escreva em `tracks/{token}` mudar, e antes de rodar `npm run deploy:rules`.

**O que ele entrega.** Uma auditoria de quem consegue ler e escrever o quê, reconstruída contra os padrões de acesso reais do código, não contra a teoria. Ele compara campo a campo o payload de `buildTrackPayload` com o `isValidTrack()` e com a lista de `affectedKeys().hasOnly(...)`, simula o atacante anônimo com e sem token, e devolve a regra corrigida pronta para colar, organizada em Crítico, Risco, Sugestão e Verificado e OK. É ele também que propõe e escreve os testes de regra contra o Firebase Local Emulator Suite.

```
Use o subagente firebase-rules-auditor para revisar as regras antes de eu rodar npm run deploy:rules
```

## `firebase-maps-cost-guard`

**Quando usar.** Ao mexer em rastreio, publicação de GPS, otimização de rota, listeners do Firestore ou qualquer laço que chame uma API externa.

**O que ele entrega.** O volume em operações por dia e por mês, antes e depois da mudança, com o cenário declarado, separado por classe de cobrança: escrita, leitura, invocação de função e requisição Directions. Ele já parte dos números medidos na auditoria, como as cerca de 216 mil escritas por dia por motorista que `publishDriverGpsFromWatch` gera em `src/js/main.js:1156`.

**Fronteira.** Ele quantifica a fatura. Quem decide quem tem permissão de escrever é o `firebase-rules-auditor`; quem muda o algoritmo de rota é o `routing-geolocation-engineer`.

```
Use o subagente firebase-maps-cost-guard para avaliar quanto a nova tela de rastreio vai custar por mês
```

## `routing-geolocation-engineer`

**Quando usar.** Ao mexer na seção de rota otimizada de `src/js/main.js` (aproximadamente entre as linhas 6386 e 7070), em `watchPosition`, no `BackgroundGpsService` ou em qualquer cálculo de distância, ETA e ordenação de paradas.

**O que ele entrega.** Mudanças de algoritmo e de filtro que continuam funcionando sem rede e sem cota, sempre com o trade-off declarado em precisão e em atualidade da posição. Ele sabe que `optimizeWaypoints: true` em `src/js/main.js:6796` coloca a chamada no tier mais caro da Directions, que `refreshRouteKeepOrder` recalcula a rota inteira a cada entrega concluída sem nenhum cache, e que o mesmo corte feito no lado web precisa ser repetido em `native/android/BackgroundGpsService.java`.

**Fronteira.** Ele cuida da correção do cálculo e da qualidade da posição, e informa o volume que a mudança gera. A conta em reais é do `firebase-maps-cost-guard`.

```
Use o subagente routing-geolocation-engineer para publicar GPS só para as três próximas paradas
```

## `main-js-module-extractor`

**Quando usar.** Quando o pedido for extrair, mover ou isolar um bloco de `src/js/main.js`, criar um helper testável, ou quando uma alteração estiver difícil porque a função mora no meio das 7.859 linhas do arquivo.

**O que ele entrega.** A extração feita sem mudar nenhum comportamento observável, com o inventário das fronteiras levantado antes de mover qualquer linha: que estado compartilhado a função lê e escreve, quem a chama e quem ela chama. Ele sabe a diferença entre os dois destinos — `lib/` é helper puro em CommonJS, que o `node --test` carrega, e `src/js/` é módulo ESM que toca o navegador, com dependências injetadas por uma função `configure*` como em `photo-store.js` e `backup-store.js`. Termina rodando `npm test` e `npm run build`, com o delta de tamanho do bundle.

```
Use o subagente main-js-module-extractor para tirar a seção de histórico de dias do main.js
```

## `node-test-author`

**Quando usar.** Depois de extrair um helper para `lib/`, ao corrigir um bug de persistência, migração de dado ou cálculo de rota, e sempre que uma regressão escapar para produção.

**O que ele entrega.** Testes em `test/` no formato exato dos dois arquivos que já existem, usando só `node --test` e `node:assert/strict`, sem nenhuma dependência nova. Ele prioriza o que mais machuca em produção: migração de dado legado, round-trip de persistência e a garantia de que foto nunca vai parar no `localStorage`.

**Fronteira.** Ele cobre lógica pura que roda em processo Node. Teste de regra contra o emulador do Firestore é do `firebase-rules-auditor`, porque precisa de emulador e de uma dependência de desenvolvimento que esta suíte não aceita. Se a lógica ainda estiver dentro de `main.js`, a cirurgia é do `main-js-module-extractor`.

```
Use o subagente node-test-author para cobrir o helper que acabei de extrair para lib/
```

## `pwa-release-auditor`

**Quando usar.** Antes de qualquer publicação, e sempre que `sw.js`, `track-sw.js`, `version.json`, `index.html`, `track.html`, `firebase.json` ou os scripts de build e release mudarem.

**O que ele entrega.** Um veredito de uma linha sobre publicar ou não, a lista de bloqueios com arquivo e correção, e o checklist de comandos na ordem certa. Ele existe para evitar o erro clássico do projeto, que não é código quebrado e sim usuário preso numa versão antiga: o `CACHE_NAME` de `sw.js` na raiz não é carimbado por nenhum script e precisa bater com `swCache` de `version.json` manualmente. Ele também confere que `build/app.js` e `build/app.css` estão mesmo na lista publicada, porque já houve um deploy sem eles.

**Fronteira.** Ele cuida de cache, versionamento e da ordem do pipeline até o APK sair. O código Java, os plugins e a assinatura do APK são do `capacitor-android-specialist`.

```
Use o subagente pwa-release-auditor para conferir se dá para publicar a versão de hoje
```

## `capacitor-android-specialist`

**Quando usar.** Ao mexer em `native/android/`, `native/bridge.js`, `scripts/patch-*.js`, `capacitor.config.json`, permissões do manifesto, foreground service de GPS, câmera nativa, keystore ou ciclo de vida do WebView.

**O que ele entrega.** Revisão e código do que só existe dentro do APK, com a sequência exata de `npm run cap:sync` e `npm run android:release` e o teste manual no aparelho. Ele sabe que a pasta `android/` é gerada e nunca deve ser editada à mão, que a senha do keystore de release está em texto claro em `scripts/ensure-release-signing.js:16-18`, que o keystore existe em um único lugar na máquina do Lucas e que perdê-lo trava qualquer atualização futura na Play Store, e que o patch de `scripts/patch-google-maps-android.js` vive dentro de `node_modules` e some em qualquer `npm ci`.

**Fronteira.** Ele cuida do que está abaixo da WebView. Cache, `version.json` e a ordem da publicação são do `pwa-release-auditor`; interface, CSS e texto são do `driver-ux-auditor`.

```
Use o subagente capacitor-android-specialist para investigar por que o serviço de GPS morre com a tela bloqueada
```

## `driver-ux-auditor`

**Quando usar.** Ao criar ou alterar tela, botão, modal, fluxo de entrega ou formulário, em `index.html`, `src/styles/app.css` ou nas seções de interface de `src/js/main.js`.

**O que ele entrega.** A auditoria da interface nas condições reais do entregador — uma mão livre, sol na tela, dados móveis instáveis, bateria acabando — com a contagem de toques do fluxo e correções concretas de CSS, HTML ou texto, nunca recomendações vagas. Ele aplica cinco lentes: alcance do polegar, contraste, comportamento em rede ruim, consumo de bateria e proteção contra erro por pressa.

```
Use o subagente driver-ux-auditor para revisar o fluxo de marcar entrega como não entregue
```

## Como criar mais um

Crie um `.md` nesta pasta com frontmatter YAML contendo apenas `name` e `description`. O `name` precisa ser igual ao nome do arquivo sem a extensão, em minúsculas e com hífens. A `description` é o que faz o Cursor delegar sozinho, então diga nela quando acionar o subagente e, se houver vizinho de escopo, onde fica a fronteira. O corpo em markdown vira o system prompt.

Subagentes definidos aqui, no projeto, têm prioridade sobre os de `~/.cursor/agents/`, que valem para todos os seus projetos.
