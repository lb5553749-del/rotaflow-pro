# Auditoria técnica — RotaFlow Pro v1.5.31

Auditoria de código feita por leitura direta do repositório em `main`. Todos os achados abaixo
têm arquivo e número de linha. Nada aqui é especulação sobre o que o código "provavelmente faz":
cada afirmação foi conferida no fonte.

**Atualização de 2026-10-16/17 (rev. 3):** health check da v1.5.31 executado e corrigido no mesmo
dia. Itens resolvidos desta rodada:

- **S5 resolvido** — a senha do keystore saiu do código: `scripts/ensure-release-signing.js`
  agora lê de `ROTAFLOW_STORE_PASSWORD`/`ROTAFLOW_KEY_PASSWORD` (env/CI) ou de
  `signing/key.properties` (gitignored, chmod 600), e gera senha aleatória forte na primeira
  criação. **Atenção — assinatura nova:** durante a rotação o keystore antigo ficou
  inacessível e foi substituído por um **keystore novo**. O SHA-1 mudou para
  `EC:D9:A8:D3:7E:F8:1B:06:C9:37:38:DB:99:B3:BE:C5:21:8B:D9:63`, e APKs futuros **não
  atualizam** instalações feitas com a chave antiga (é preciso desinstalar e reinstalar no
  aparelho). Registrar o novo SHA-1 no Firebase Console e na restrição da chave Maps, e guardar
  `.jks` + `key.properties` num gerenciador de segredos — o risco de ponto único da S5 segue
  valendo enquanto a chave só existir numa máquina.
- **Vulnerabilidades das Functions** — `npm audit fix` em `functions/` eliminou a crítica
  (`proxy-addr`) e a alta (`@grpc/grpc-js` < 1.14.5). Restam 8 moderadas transitivas de
  `@google-cloud/storage`/`firebase-admin` que só saem com major bump — avaliar junto com o
  upgrade para `firebase-admin` 14 / `firebase-functions` 7.
- **Regras reforçadas** — o `create` de `tracks` e de `tracks/live/pos` agora exige
  `expiresAt > request.time` (não aceita mais documento já expirado); o `update` continua
  permitindo encerramento tardio de track expirado.
- **Cobertura de regras** — `test/rules/` passou de 30 para 42 casos: novos testes cobrem
  `users/{userId}/**` (dono ok, intruso/anônimo negado, subcoleções) e `storage.rules`
  (fotos ≤ 5 MB `image/*`, backups ≤ 4 MB `application/json`, rejeições de validação).
  `npm run test:rules` agora sobe também o emulador de Storage.
- **Typecheck** — erros em `test/` zerados (81 → 0) via melhoria de JSDoc nos `lib/`
  (typedefs e generics, sem mudar comportamento); o total caiu de 556 para 428 — os restantes
  seguem sendo o roadmap B4.
- **APK mais enxuto** — `minifyEnabled`/`shrinkResources` ligados no release
  (`android/app/build.gradle`), APK caiu para ~3,8 MB. Validar no device antes de distribuir;
  se o R8 quebrar algo (mapa, câmera, GPS), reverter apenas este item.
- **Manifest** — `android:allowBackup="false"` e removido o meta-data órfão do MLKit.
- **Push observável** — falhas de web-push não-404/410 agora são logadas
  (`functions/index.js`, `sendTrackPushes`) em vez de sumirem em silêncio.
- **Scripts** — `android-release.sh` detecta o JDK via `/usr/libexec/java_home` antes do
  fallback do JBR local (build reproduzível fora desta máquina); `package.json` realinhado
  para 1.5.31.
- **S3 resolvido** — a chave Maps foi separada em duas. A chave Android nova
  (`ROTAFLOW_MAPS_ANDROID_KEY` em `firebase-config.js`) está restrita no GCP ao pacote
  `com.rotaflow.pro` + SHA-1 de release novo e limitada ao Maps SDK for Android; o
  `native/bridge.js` escolhe a chave conforme a plataforma e o
  `scripts/patch-screen-events-android.js` grava a chave Android no manifest no build. A chave
  antiga (`ROTAFLOW_MAPS_KEY`) ficou só com as 4 APIs web (Maps JavaScript, Directions,
  Geocoding, Places) e restrita por referrer a `rotaflow-83610.web.app/*`,
  `rotaflow-83610.firebaseapp.com/*` e `localhost/*`. **Atenção:** com isso, APKs antigos que
  ainda usam a chave antiga no Android param de abrir o mapa — instalar o APK novo (exige
  desinstalar o antigo, pois a assinatura mudou).

**Atualização de 2026-10-14 (rev. 2):** a estrutura do projeto mudou bastante desde a v1.5.29 —
o `main.js` foi quebrado em 49 módulos ESM (`src/js/`) + 31 módulos puros (`lib/`), o que
invalidou a maior parte da seção 3.3 original e das contagens de linha. Esta revisão reescreve
essas seções e adiciona a **seção 0** com o status do roteiro da v1.5.29 — 7 dos 9 itens da Onda A
e a refatoração da Onda B já foram executados. As seções 2 (segurança), 3.1 (confiabilidade) e
3.2 (custo) permanecem como registro da v1.5.29; onde o achado foi resolvido, a seção 0 aponta.

`npm test` em 2026-10-16: **308 testes, 139 suítes, 308 passando, 0 falhando**; mais **42 testes
de regras** (Firestore + Storage, emuladores) e typecheck zerado em `test/`
(20 testes na auditoria original).

---

## 0. Status do roteiro v1.5.29 → v1.5.30

### Onda A — correções urgentes

| Item | Status | Evidência |
|---|---|---|
| **A1.** Fechar a escrita pública no `tracks` | ✅ Feito | `firestore.rules:11-23` exige `ownerUid == request.auth.uid`; `ensureAnonUser()` (`src/js/firebase-loader.js:60-71`); regras testadas em `test/rules/firestore.rules.test.js` |
| **A2.** Separar a chave do Google Maps em duas | ✅ Feito | Chave Android restrita (pacote+SHA-1, só Maps SDK) e chave web restrita por referrer com 4 APIs |
| **A3.** Inverter a lógica do Hosting numa allowlist | ✅ Feito | `scripts/prepare-hosting.js` publica só `ROOT_FILES` + `build/` renomeado com hash |
| **A4.** TTL e minimização em `tracks` | 🟡 Parcial | `expiresAt`/`trackExpiresAtMs` (`lib/track-schema.js`) + rules; a política de TTL no console do Firestore é ação manual, não verificável no repo |
| **A5.** Publicar só para as próximas paradas | ✅ Feito | `nextActiveTrackTargets` (`lib/gps-helpers.js:205`) com `TRACK_PUBLISH_LIMIT` |
| **A6.** Validar e escapar a restauração de backup | ✅ Feito | `lib/backup-schema.js` (sanitizadores por tipo) + `escapeHtml` em `lib/list-helpers.js` |
| **A7.** Corrigir o cache do service worker | ✅ Feito | `scripts/build-web.js` carimba `CACHE_NAME` do `sw.js` com o hash do bundle; anchors de hostname revisados |
| **A8.** CI mínima | ✅ Feito | `.github/workflows/ci.yml` (roda `npm ci`, testes, lint, build) |
| **A9.** Remover 85 KB de fonte não usada | ✅ Feito | `build/fonts/` hoje tem só `fa-solid-900.subset.woff2` e `fa-brands-400.subset.woff2` |

### Onda B — refatoração estrutural

| Item | Status | Evidência |
|---|---|---|
| **B1.** Quebrar `main.js` em módulos | ✅ Feito | `src/js/main.js` caiu de 7.859 para 1.241 linhas; 49 módulos ESM em `src/js/` (injeção de deps via `configureX`) + 31 módulos puros e testados em `lib/`; code splitting no build |

### O que ainda está em aberto

1. ~~**A2 — chaves do Maps**~~ ✅ Feito na rev. 3 (ver S3), incluindo a restrição por referrer
   da chave web.
2. **Custo do Directions sem cache** (seção 3.2): `refreshRouteKeepOrder` ainda recalcula a rota
   inteira a cada entrega concluída; `track.html` ainda chama Directions no celular de cada cliente.
3. **Backup sem fotos** (seção 3.1): o JSON de backup continua sem as fotos de comprovação —
   `buildFullBackupObject` clona as listas sem elas. Trocar de celular continua significando perder
   o histórico visual.
4. **GPS offline sem fila** (seção 3.1): `BackgroundGpsService.java` continua descartando o resultado
   da escrita em `catch (Exception ignored)`, sem retry nem persistência.

---

## 1. Visão geral: o que o projeto é e como está arquitetado hoje

O RotaFlow Pro é um app de gestão de entregas para um entregador individual. Ele roda em três
superfícies que compartilham o mesmo projeto Firebase:

1. **App do motorista** — `index.html` (288 linhas de markup estático) mais um bundle esbuild com
   **code splitting** (`build/chunks/app.js` + 16 chunks), gerado a partir de `src/js/main.js`
   (1.241 linhas), que orquestra **49 módulos ESM em `src/js/`** sobre **31 módulos puros em `lib/`**
   (CommonJS, 4.726 linhas, testados). Funciona como PWA (`sw.js`) e como app Android empacotado via
   Capacitor 8 (`capacitor.config.json`, `native/bridge.js`, quatro plugins Java próprios em
   `native/android/`).
2. **Página pública de rastreio** — `track.html` (52,7 KB, HTML + CSS + JavaScript tudo inline,
   fora do pipeline de build) servida em `/r/<token>` por uma rewrite do Hosting
   (`firebase.json:70-72`), com `track-sw.js` para push e notificação persistente. O serviço-portal
   de rastreio importa `build/track-shared.js` (IIFE gerada pelo build) — a única ponte de código
   entre o app e a página do cliente.
3. **Backend mínimo** — uma Cloud Function (`functions/index.js`, 75 linhas) que observa a coleção
   `tracks` no Firestore e dispara Web Push para o cliente.

O ponto mais importante da arquitetura atual, e que não fica óbvio à primeira vista: **não existe
autenticação de usuário**. O app fabrica um identificador local (`rotaflow_local_uid`,
`lib/auth-helpers.js`) e segue adiante; as regras `match /users/{userId}` em `firestore.rules` e em
`storage.rules` nunca são exercitadas pelo app, porque nenhum usuário autenticado existe. Toda a
rota, a agenda, o histórico de 30 dias e o perfil moram em `localStorage`; as fotos moram em
IndexedDB (`rotaflow_photos_v1`, Blobs comprimidos, chaves por `uid::photoId`). O backup na nuvem
está desligado por flag (`firebase-config.js`, `ROTAFLOW_CLOUD_BACKUP_ENABLED = false` — exige
plano Blaze).

Consequência prática: **o único dado que sai do aparelho é a coleção `tracks` no Firestore.**
Desde a v1.5.30 a escrita exige autenticação anônima e `ownerUid == request.auth.uid`
(`firestore.rules:11-23`) — o achado S1 original está resolvido; a leitura continua pública por
token.

### Diagrama textual do fluxo de dados

```
                       APARELHO DO MOTORISTA
   ┌───────────────────────────────────────────────────────────────┐
   │  index.html ──► build/app.js (bundle de src/js/main.js)        │
   │                                                                │
   │   estado em memória: deliveries[], agenda[], routes[],         │
   │                      routeMetrics, startPoint, currentUser     │
   │          (≈40 variáveis mutáveis de módulo, main.js:63-74      │
   │           e main.js:380-408)                                   │
   │                      │                                         │
   │        ┌─────────────┼──────────────┐                          │
   │        ▼             ▼              ▼                          │
   │  localStorage    IndexedDB     Google Maps JS API              │
   │  rotaflow_*_uid  (fotos)       (mapa, Geocoder,                │
   │  (rota, agenda,                 Places, Directions)            │
   │   histórico,                            │                      │
   │   perfil)                               │ chave irrestrita     │
   │                                         ▼                      │
   │  Capacitor ──► BackgroundGpsService.java                       │
   │                (GPS cru, 4 s / 12 m, foreground service)       │
   └──────────────────────┬─────────────────┬──────────────────────┘
                          │                 │
            PATCH REST    │                 │  batch.set() via SDK
            sem auth      │                 │  sem auth
                          ▼                 ▼
              ┌─────────────────────────────────────────┐
              │  FIRESTORE  —  coleção  tracks/{token}   │
              │  destLat, destLng, destName, motorista,  │
              │  driverLat, driverLng, accuracy, status, │
              │  etaSeconds, stopsAhead, sequentialId    │
              │  subcoleção subs/{id}: endpoint + keys   │
              │  leitura e escrita abertas a quem tem    │
              │  o token (firestore.rules:14-28)         │
              └──────┬──────────────────────┬────────────┘
                     │ onDocumentUpdated    │ onSnapshot
                     ▼                      ▼
        functions/onTrackNotify      track.html  (/r/<token>)
        (Web Push via VAPID)   ──►   track-sw.js
                                     + Directions API do cliente
                                       │
                                       ▼
                                  CELULAR DO CLIENTE
```

Nenhuma seta nesse diagrama passa por um servidor que valide quem está escrevendo. O Firestore é
usado como banco de escrita direta a partir de dois clientes não confiáveis (o WebView do app e o
serviço Java nativo) e lido por um terceiro cliente não confiável (o navegador do destinatário).

---

## 2. Achados críticos de segurança

| # | Onde | Problema | Impacto |
|---|------|----------|---------|
| S1 | `firestore.rules:14-28` | Quem tem o link de rastreio pode **escrever** no documento | Cliente falsifica status de entrega e posição do motorista |
| S2 | `firestore.rules:16-17` | `allow create` só exige o formato do token | Criação ilimitada de documentos por qualquer pessoa na internet |
| S3 | `firebase-config.js:12-15`, `native/bridge.js:196` | ~~Mesma chave Maps em web e Android~~ **Resolvido na rev. 3** — chaves separadas e ambas restritas (Android: pacote+SHA-1; web: referrer) | Resolvido |
| S4 | `firestore.rules:29` | `allow delete: if false` e nenhuma política de retenção | Dados pessoais do cliente públicos para sempre (LGPD) |
| S5 | `scripts/ensure-release-signing.js:16-18` | Senha do keystore de release em texto claro no repositório | Assinatura de APK falsificável; perda do `.jks` trava a Play Store |
| S6 | `firebase.json:4-27` e `.firebase/hosting..cache` | `estudo-transpetro/index.html` publicado em produção | Conteúdo não relacionado servido no domínio do produto |
| S7 | `native/android/BackgroundGpsService.java:315-351` | Serviço nativo escreve no Firestore por REST com a chave web | Qualquer um que leia o `firebase-config.js` escreve nos mesmos documentos |
| S8 | `src/js/main.js:5818-5859`, `4302`, `4305`, `4309` | Backup JSON restaurado sem validação e campos não escapados | XSS armazenado via arquivo de backup malicioso |
| S9 | `firestore.rules:32-43` | Subcoleção `subs` legível e criável por qualquer um com o token | Endpoints e chaves de push dos clientes expostos |
| S10 | `functions/index.js:19-46` | Function dispara push em qualquer transição de campo | Spam de notificação ao cliente e custo de Functions acionáveis de fora |

### S1 e S2 — as regras do `tracks` tratam o token como senha compartilhada de leitura e escrita

O bloco `match /tracks/{token}` em `firestore.rules:12-44` autoriza leitura, criação e atualização
com base numa única condição: `token.matches('^[a-f0-9]{32}$')`. A geração do token em
`src/js/main.js:860-864` usa `crypto.getRandomValues` sobre 16 bytes, então 128 bits de entropia —
isso está correto e o link não é adivinhável nem enumerável. O problema não é a força do token, é o
que ele autoriza.

A lista de campos permitidos no `update` (`firestore.rules:20-27`) inclui `status`, `driverLat`,
`driverLng`, `destLat`, `destLng`, `destName`, `motorista`, `failReason`, `etaSeconds` e
`stopsAhead`. Ou seja: **o cliente que recebeu o link no WhatsApp pode marcar a própria entrega como
`entregue`, mudar o nome do motorista, mover o pino do motorista para qualquer lugar do mundo e
reescrever as coordenadas do destino.** Como o app do motorista também lê `nearNotified` do Firestore
e a Cloud Function reage a mudanças nesses campos, uma escrita hostil não fica apenas na tela do
cliente: ela dispara notificações reais.

O `allow create` é pior em termos de custo. Qualquer pessoa pode gerar 32 caracteres hexadecimais
aleatórios e criar um documento válido — a função `isValidTrack` (`firestore.rules:48-73`) valida
tipos e faixas, mas não exige nenhuma relação com um motorista existente. Um script trivial cria
milhões de documentos na coleção `tracks` da conta do Lucas, e como `allow delete: if false`
(`firestore.rules:29`) nem o dono consegue apagá-los pelo cliente.

### S3 — a chave do Google Maps é necessariamente irrestrita

> **rev. 3 (2026-10-17): resolvido.** Chaves separadas em duas (ver a nota no topo do documento),
> incluindo a restrição por referrer da chave web. O texto abaixo fica como registro do achado
> original.

A mesma chave `AIzaSyCRcC…` aparece em quatro lugares:

- `index.html:258` — tag `<script>` do Maps JS API no app do motorista;
- `track.html:1078-1082` — carregamento dinâmico do Maps JS API na página do cliente, via
  `window.ROTAFLOW_MAPS_KEY` definido em `firebase-config.js:12`;
- `native/bridge.js:196` — `MAPS_API_KEY` consumida pelo `@capacitor/google-maps`, ou seja, pelo
  **Maps SDK para Android**;
- `src/js/main.js:74` — constante duplicada `MAPS_WEB_KEY`.

No Google Cloud, uma chave de API aceita **um** tipo de restrição de aplicação: ou "referenciadores
HTTP", ou "apps Android (nome do pacote + SHA-1)". São mutuamente exclusivas. Como essa chave precisa
funcionar nas duas superfícies, ela não pode estar restrita por nenhuma das duas. Qualquer pessoa
abre `view-source:` em `https://rotaflow-83610.web.app/` e extrai uma chave utilizável para Maps JS,
Geocoding, Places e Directions faturados na conta do Lucas. A Directions com
`optimizeWaypoints: true` (`src/js/main.js:6796`) é cobrada no tier avançado, o mais caro.

A correção é separar em duas chaves: uma restrita por referenciador HTTP e limitada às APIs web, e
outra restrita ao pacote `com.rotaflow.pro` com o SHA-1 do certificado de release, limitada ao Maps
SDK para Android. Independentemente disso, vale ligar orçamento com alerta e cotas diárias por API
no console do Google Cloud — é a única rede de proteção real contra abuso de chave de cliente.

### S4 — retenção indefinida de dado pessoal

Cada documento `tracks/{token}` carrega o primeiro nome do cliente (`destName`, montado em
`src/js/main.js:921` via `publicFirstName`), a **coordenada exata do endereço de entrega**
(`destLat`/`destLng`, `main.js:919-920`) e o rastro mais recente de localização do motorista. Esses
documentos nunca são apagados: a regra é `allow delete: if false` e não há política de TTL
configurada no Firestore (`firestore.indexes.json` está vazio e não há `ttl` em lugar nenhum do
repositório). O `closeTrackingSession` (`main.js:1055-1062`) apenas muda `status` para `encerrado`.

Em termos de LGPD isso é um problema concreto, não teórico: há tratamento de dado pessoal
(nome parcial, geolocalização residencial) de titulares que não são usuários do app, armazenado por
prazo indeterminado, acessível publicamente por URL, sem política de retenção, sem mecanismo de
eliminação e sem aviso de privacidade no `track.html`. Links de rastreio ficam no histórico do
WhatsApp, em prints e em logs de encurtadores — não é razoável tratá-los como segredo permanente.

A combinação de TTL do Firestore (campo `expiresAt` com política de exclusão automática, por exemplo
7 dias após `updatedAt`) com remoção dos campos de endereço assim que o status vira final resolve a
maior parte. A página pública também precisa de um texto curto de privacidade dizendo qual dado é
mostrado e por quanto tempo.

### S5 — credencial de assinatura do Android no repositório

`scripts/ensure-release-signing.js:16-18` define:

```js
const STORE_PASS = 'rotaflow-release';
const KEY_ALIAS = 'rotaflow';
const KEY_PASS = 'rotaflow-release';
```

O script gera o keystore com essas senhas (`ensure-release-signing.js:30-41`) e as escreve em
`signing/key.properties` (`linhas 43-49`). O diretório `signing/` está no `.gitignore:15`, então o
`.jks` em si não está versionado — mas a senha está, em texto claro, num arquivo que vai para o
repositório. Quem obtiver o arquivo de keystore por qualquer outro caminho (backup do Mac,
compartilhamento de máquina, um `git add -f` acidental) consegue assinar APKs que o Android
aceitará como atualização legítima do RotaFlow Pro.

Há um segundo risco, mais provável de doer antes: o keystore existe em exatamente um lugar
(`signing/rotaflow-release.jks`, 2.748 bytes, na máquina do Lucas). Se ele se perder e o app já
estiver publicado sem Play App Signing, **não há como publicar nenhuma atualização, nunca mais**.
Antes de publicar na Play Store, ativar Play App Signing e guardar a chave de upload num gerenciador
de segredos.

### S6 — conteúdo não relacionado publicado em produção

`firebase.json:3` define `"public": "."` e a lista `ignore` (`firebase.json:4-27`) enumera
diretórios a excluir: `android/`, `www/`, `native/`, `src/`, `lib/`, `test/`, `scripts/`, `dist/`,
`signing/`, `functions/`. **`estudo-transpetro/` não está na lista.** O arquivo
`.firebase/hosting..cache` confirma que o deploy aconteceu: a última linha é
`estudo-transpetro/index.html`. Hoje há um estudo de 46 KB sobre Transpetro servido em
`https://rotaflow-83610.web.app/estudo-transpetro/`.

O padrão aqui é o perigoso, mais do que esse arquivo específico: a configuração é uma *blocklist*,
então qualquer arquivo novo na raiz do repositório vai para produção por padrão. Inverter para uma
allowlist (`public` apontando para um diretório `public/` gerado pelo build) elimina a classe inteira
de erro.

O mesmo `.firebase/hosting..cache` mostra outra coisa interessante: o último deploy registrado
contém 18 arquivos e **nenhum deles é `build/app.js` ou `build/app.css`**, embora `index.html:14` e
`index.html:257` apontem para eles. Ou seja, houve pelo menos um deploy em que o site foi publicado
sem o JavaScript da aplicação. Não existe nenhuma verificação que impeça isso.

### S7 — o serviço nativo escreve no Firestore sem autenticação

`BackgroundGpsService.java:315-351` monta uma URL
`https://firestore.googleapis.com/v1/projects/{pid}/databases/(default)/documents/tracks/{token}?…&key={apiKey}`
e faz um `PATCH` direto. A `apiKey` chega do JavaScript em `src/js/main.js:6572` (`apiKey: fb.apiKey`)
e é persistida em `SharedPreferences` (`BackgroundGpsService.java:264`). É a mesma chave web pública
do `firebase-config.js:3`.

Isso é coerente com as regras atuais (que não exigem auth), mas significa que a superfície de escrita
no `tracks` é exatamente "qualquer pessoa na internet". Não há nada de secreto no APK que precise ser
extraído — a chave já está publicada em `firebase-config.js` e em `track-sw.js:7`.

### S8 — restauração de backup sem validação

`restoreData` (`src/js/main.js:5818-5859`) faz `JSON.parse`, confere apenas se existem as chaves
`agenda` e (`deliveries` ou `routes`) na linha 5823, e então atribui direto: `agenda = data.agenda`
(linha 5831) e `userProfile = data.userProfile` (linha 5833). Nenhuma validação de tipo, de forma ou
de tamanho.

Isso se combina com três interpolações não escapadas em `buildDeliveryListItemHtml`:

```4302:4309:src/js/main.js
    return `<div class="delivery-item" data-id="${del.id}">
                    <div class="delivery-header">
                        <div class="delivery-title-row">
                            <span class="delivery-id">${del.sequentialId}</span>
                            <button type="button" class="fav-btn ${del.favorito ? 'active' : ''}" data-action="fav" data-id="${del.id}" title="Favorito" aria-label="Favorito"><i class="fas fa-star"></i></button>
                            <strong>${escapeHtml(del.nome)}</strong>
                        </div>
                        <span class="status-badge ${statusClass}">${statusText}</span>
```

`del.nome`, `del.endereco` e `del.notes` passam por `escapeHtml` corretamente, mas `del.id`,
`del.sequentialId` e `statusText` não. O `statusText` cai em `del.status` quando o status não está no
mapa conhecido (`main.js:4277`), e `statusClass` é `status-${del.status}` (`main.js:4278`), também
interpolado cru no atributo `class`. Um arquivo de backup com
`"sequentialId": "<img src=x onerror=…>"` executa script no contexto da origem do app — que tem
acesso a todo o `localStorage` com nomes, endereços e telefones dos clientes, e à chave de API.

A probabilidade é baixa porque exige que o motorista importe um arquivo hostil, mas o app incentiva
exatamente esse fluxo (o backup é a única forma de migrar de aparelho, e o botão "Restaurar" está no
menu principal da rota em `index.html:121`). A correção é de uma linha por campo, mais uma função de
validação de schema no `restoreData`.

### S9 e S10 — subcoleção de push e gatilho da Cloud Function

`firestore.rules:32-43` permite `create`, `update` e `read` na subcoleção `subs` para quem tem o
token. A validação de formato é razoável (tamanho do endpoint, chaves obrigatórias), mas `allow read`
expõe o `endpoint` e as chaves `p256dh`/`auth` de todos os inscritos naquele rastreio. Não há limite
de quantos documentos `subs` podem ser criados por `tracks`, então a mesma abertura do S2 vale aqui.

`functions/index.js:19-46` reage a transições de `nearNotified` (linha 24), `status === 'entregue'`
(linha 31) e `failReason === 'ausente'` (linha 38). Como o `update` é livre (S1), basta alternar
`nearNotified` entre `false` e `true` para disparar uma rodada de Web Push a cada ciclo — custo de
invocação de Function, custo de saída de rede e notificações indesejadas no celular do cliente.
A Function também não valida nada do documento antes de montar o payload: `event.params.token` entra
direto na URL (`functions/index.js:52`) e no `tag` (`linhas 28, 34, 41`). O `token` vem do caminho do
documento e é limitado pelas regras ao formato hexadecimal, então não há injeção aqui, mas não existe
nenhum throttle nem verificação de origem.

---

## 3. Dívida técnica por área, ordenada por impacto

### 3.1 Confiabilidade — risco de perda de dados do cliente (impacto máximo)

Este é o problema que mais provavelmente vai causar dor real antes de qualquer outro.

**Não existe cópia dos dados fora do aparelho.** O login é sempre local (`main.js:1389-1409`), o
backup na nuvem está desativado (`firebase-config.js:15`, lido em `backup-store.js:38`), e o backup
automático escreve apenas no Filesystem do app ou no IndexedDB do mesmo aparelho
(`backup-store.js:132-161`). Reinstalar o app, trocar de celular, ou o usuário limpar os dados do
navegador significa perder a rota, a agenda inteira e os 30 dias de histórico.

**Pior: o backup JSON não contém as fotos.** `buildFullBackupObject` (`main.js:5522-5546`) usa
`cloneWithoutHeavyPhotos` em todas as listas (linhas 5533, 5540, 5541), justamente para não estourar
a memória do WebView no Android. A decisão técnica é correta, mas a consequência é que as fotos de
comprovação de entrega existem **apenas** no IndexedDB daquele aparelho e não aparecem em nenhum
backup. Se o motorista precisar provar uma entrega de três semanas atrás depois de trocar de celular,
não há como.

**O app offline funciona muito menos do que parece.** O `initMap` (`main.js:7144`) é o callback do
script do Google Maps (`index.html:258`, `&callback=initMap`). Entre as linhas 7193 e 7292 ele
registra praticamente toda a interatividade do app: galeria de fotos, botão de fechar painel, controle
de pacotes, edição de observação e de telefones, swipe do painel, captura de foto, snackbar de
desfazer, delegação do histórico, menus de overflow, lembrete e agendador de backup, botão de perfil,
backup, restaurar, otimizar rota, arquivar dia, nova rota, limpar rota, abrir/fechar sidebar, copiar
da rota, GPS e atalhos de teclado. Se o Maps não carregar — sem rede, cota estourada, chave bloqueada,
bloqueador de script — o service worker entrega o shell, a lista de entregas renderiza
(`loadStorage` roda no `DOMContentLoaded` via `initAuthUi`), mas **nenhum desses botões responde**. O
único botão ligado fora do `initMap` é "Adicionar entrega" (`main.js:7736`), e ele aborta logo na
linha 7744 porque `geocoder` é `null`.

**O service worker pode servir JavaScript velho indefinidamente.** O handler de `fetch` em
`sw.js:60-74` é cache-first para tudo que não é a raiz nem `/track.html`. `build/app.js` cai nesse
ramo: uma vez cacheado, `caches.match(req)` resolve e o `fetch` em paralelo só atualiza o cache se a
resposta chegar — mas o `return cached || fetchPromise` da linha 72 já devolveu a versão antiga. A
única forma de invalidar é mudar `CACHE_NAME` (`sw.js:2`). O `version.json:4` tem o campo `swCache`
para isso, mas `prepare-www.js:39-43` só carimba a **cópia em `www/`** (destinada ao APK). O `sw.js`
da raiz, que é o que vai para o Hosting (`firebase.json` não o ignora), precisa ser editado à mão.
Esquecer esse passo entrega HTML novo com JavaScript velho para todos os usuários do PWA.

O mesmo handler tem uma verificação de hostname frouxa na linha 65:
`/gstatic|googleapis|firebase|gstatic\.com|cloudflare|jsdelivr|unpkg/.test(url.hostname)`. A regex não
está ancorada, então `googleapis.exemplo-malicioso.com` casa e tem sua resposta armazenada no cache
do app. Também significa que respostas da Maps JS API ficam em cache por tempo indeterminado, o que
além de frágil esbarra nos termos de uso da plataforma Maps sobre armazenamento de conteúdo.

**A posição GPS é perdida quando não há rede.** `BackgroundGpsService.java:346` chama
`conn.getResponseCode()` e descarta o resultado dentro de um `catch (Exception ignored)` (linha 347).
Não há fila, não há retry, não há persistência. Uma viagem por área sem sinal simplesmente não é
publicada, e o cliente vê "sinal atrasado" sem nenhuma recuperação quando a rede volta. O executor é
`Executors.newSingleThreadExecutor()` (linha 62) com fila ilimitada e timeouts de 8 s (linhas
337-338), então ficar offline com 30 destinos ativos enfileira requisições que vão falhar uma a uma.

### 3.2 Custo — padrões que não escalam

**Escrita de GPS no Firestore.** `publishDriverGpsFromWatch` (`main.js:1153-1184`) monta um
`batch.set` com **todos** os destinos ativos que têm token (linha 1156), a cada posição que passa pelo
filtro de `shouldPublishTrack` (`main.js:1145-1151`), que libera a cada 4 segundos ou 20 metros. O
serviço nativo faz o equivalente em `BackgroundGpsService.java:206-220`, mas pior: um `PATCH` HTTP
separado por destino, sem batch.

Com 30 paradas ativas e uma jornada de 8 horas, isso dá da ordem de 30 × 900 = 27.000 escritas por
hora, ou cerca de 216 mil escritas por dia por motorista. Isso é faturado, e a maior parte é
desperdício: a posição do motorista só interessa aos clientes das próximas paradas, não ao destino
que está 40 km à frente na sequência. Publicar apenas para as 2 ou 3 próximas paradas ativas (a
informação já existe — `stopsAheadOf` em `main.js:910-914`) corta mais de 90% dessas escritas sem
nenhuma perda perceptível para o cliente.

**Directions API sem cache.** Há três caminhos que chamam a Directions:

- `optimizeRoute` (`main.js:6976-7026`) usa `orderByDirections` com `optimizeWaypoints: true`
  (`main.js:6796`), que é o tier avançado, o mais caro da API.
- `refreshRouteKeepOrder` (`main.js:7030-7053`) recalcula a rota inteira a cada entrega concluída,
  através de `scheduleRouteRefresh` (`main.js:7055-7060`, debounce de 400 ms) chamado por
  `notifyRouteCompositionChanged` (`main.js:7062-7070`), que por sua vez é chamado em
  `markDelivered` (`main.js:7478`) e em `undoDeliveryStatus` (`main.js:7534`). Num dia de 40 entregas,
  são 40 recálculos completos. Como `chunkPoints` (`main.js:6894-6901`) quebra em blocos de 25 pontos,
  um dia grande vira 80 requisições faturadas, todas recalculando trechos idênticos aos da chamada
  anterior.
- `track.html:596-629`, no celular de **cada cliente**. O gate de `shouldRefreshRoute`
  (`track.html:589-594`) permite uma nova chamada a cada 40 metros de deslocamento do motorista com
  8 segundos de intervalo. Um cliente que deixa a página aberta por 20 minutos com o motorista em
  movimento gera na ordem de 150 requisições Directions. Dez clientes acompanhando ao mesmo tempo
  multiplicam isso por dez — e cada um deles está usando a chave irrestrita do S3.

Nenhum desses caminhos tem cache. Uma camada simples de memoização por assinatura
(origem arredondada + destino + lista de waypoints) eliminaria a maior parte das chamadas repetidas,
e no caso do `track.html` seria melhor não calcular rota dirigida nenhuma: a linha reta já existe
como fallback em `setStraightRoute` (`track.html:583-587`) e é suficiente para a informação que o
cliente precisa.

**Crescimento sem limite da coleção `tracks`.** Documentos nunca são apagados (S4). Cada entrega com
link compartilhado cria um documento permanente. Mil entregas por mês viram doze mil documentos por
ano por motorista, e cada um deles continua sendo um alvo válido de leitura pública.

### 3.3 Arquitetura e manutenibilidade

> **rev. 2 (2026-10-14):** a seção original descrevia o monolito de 7.859 linhas em `main.js`. A
> Onda B (B1) foi executada — o texto abaixo é o estado atual. O original está preservado no
> histórico do git.

**O monolito foi desmembrado.** `src/js/main.js` tem hoje 1.241 linhas e é puramente bootstrap: nem
exporta nada. A lógica vive em **49 módulos ESM em `src/js/`** (12.643 linhas no total) e em **31
módulos puros em `lib/`** (4.726 linhas, CommonJS, testáveis). A injeção de dependência é uniforme —
todos os módulos seguem o padrão `let deps = {...}` + `export function configureX(opts)`, chamado só
por `main.js` no boot:

```js
// src/js/deliveries-list.js
let deps = { getDeliveries: () => [], /* ...mais de 30 no-ops... */ };
export function configureDeliveriesList(opts) { deps = { ...deps, ...opts }; }
```

Isso tornou a maior parte do app testável: regra de domínio nova vai para `lib/` e ganha suite em
`test/`. O custo restante é que `src/js` **não é importável pelo Node** (`"type": "commonjs"` no
`package.json` com sintaxe ESM em arquivos `.js`), então a cobertura dos adapters depende de extrair
a regra para `lib/` — é o que fez a onda de extração de 2026-10-14 (`delivery-status-helpers`,
`advanced-filters-helpers`, `trackingPublicBase`/`trackingUrl`, `extractDistrict` em `map-helpers`).

**Duplicação entre o app do motorista e a página de rastreio.** `track.html` ainda reimplementa
coisas que existem em `src/js`/`lib/`, mas a ponte `build/track-shared.js` (gerada pelo esbuild a
partir de `lib/track-shared.js`) já elimina a triplicação com o service worker:

| Função | App do motorista | Página do cliente | Service worker do rastreio |
|---|---|---|---|
| Haversine | `lib/track-schema.js` | `track.html` (inline) | ✅ via `track-shared.js` |
| Formatar distância/duração | `lib/track-schema.js` | `track.html` (inline) | ✅ via `track-shared.js` |
| Ler/validar token | `lib/track-schema.js` | `track.html` (inline) | ✅ via `track-shared.js` |
| Forma do documento `tracks` | `lib/track-schema.js` | `track.html` (inline) | ✅ via `track-shared.js` |

A página `track.html` em si (52,7 KB, 100% inline) continua sem compartilhar uma linha com `src/` —
o próximo passo natural é fazê-la importar `build/track-shared.js` no browser e eliminar a terceira
cópia.

**`track.html` está fora do pipeline de build.** São ~1.090 linhas de HTML, CSS e JavaScript inline,
sem minificação, sem bundling. É publicado com `Cache-Control: no-cache` (`firebase.json`), então
os KB são baixados a cada acesso.

**O patch em `node_modules`.** `scripts/patch-google-maps-android.js` edita
`node_modules/@capacitor/google-maps/android/src/main/java/.../CapacitorGoogleMap.kt`
(linha 15). Esse patch some em qualquer `npm ci` ou atualização de dependência, e a detecção é por
`indexOf` de strings literais de código Kotlin (`linhas 39-41`, `73-77`), com `process.exit(1)` se a
âncora não for encontrada (`linha 29`, `linha 45`). Uma atualização de patch do plugin quebra o build
do Android. O mesmo vale, em menor grau, para `patch-screen-events-android.js` (324 linhas) e para a
edição do `AndroidManifest.xml` e do `build.gradle` feita por scripts Python inline dentro de
`scripts/android-release.sh`.

**Versão espalhada.** `version.json` (1.5.30 / code 55) é a fonte da verdade e carimba
`firebase-config.js` e o `build.gradle` no release, mas o campo `"version"` do `package.json` ainda
diz **1.5.29** (stale).

### 3.4 Performance

Medidas reais do build atual (2026-10-14, code splitting):

| Artefato | Bruto | Gzip |
|---|---|---|
| `build/chunks/app.js` (bundle crítico) | 275,9 KB | 77,8 KB |
| `build/chunks/chunk-H3PG7VYD.js` (maior chunk lazy) | 38,8 KB | 13,4 KB |
| `build/chunks/edit-modals-AN2UBPGI.js` (lazy) | 20,8 KB | 5,0 KB |
| `build/chunks/web-52L5OOMR.js` (lazy, câmera web) | 32,3 KB | 10,7 KB |
| `build/app.css` | 71,4 KB | 14,1 KB |
| `index.html` | 21,6 KB | 5,1 KB |
| `track.html` | 49 KB | 12 KB |
| `build/fonts/fa-solid-900.subset.woff2` | 3,9 KB | — |
| `build/fonts/fa-brands-400.subset.woff2` | 0,7 KB | — |

O bundle crítico encolheu com code splitting ESM: módulos pesados (backup, edit-modals, câmera web)
são importados sob demanda via `lazy-loader.js`. As fontes `inter-latin-ext.woff2` (85 KB) saíram
(A9); só os subsets do Font Awesome sobreviveram. O `prepare-hosting.js` renomeia os assets de
`build/` com hash sha1 e os serve com cache imutável, resolvendo a invalidação do service worker.

O que ainda pesa é o que vem depois: o Maps JS API, carregado de forma bloqueante no `index.html`, e
o SDK compat do Firebase (`firebase-loader.js`) que o rastreio baixa sob demanda — o pacote
`firebase-firestore-compat.js` sozinho passa de 300 KB.

Pendências de performance que continuam válidas:

- **`track.html` sem minificação e com `no-cache`.** Para uma página que o cliente abre no 4G do
  bairro, é o pior dos dois mundos (e ela não entra no fluxo de assets com hash do `prepare-hosting.js`).
- **Directions sem cache** (seção 3.2).
- **Re-render da lista.** `renderDeliveriesListNow` reconstrói o `innerHTML` do container inteiro a
  cada mudança de estado. Há virtualização (`paintDeliveryListWindow`, `src/js/deliveries-list.js`,
  acima de `DELIVERY_LIST_FULL_RENDER_MAX = 40`), mas abaixo disso marcar uma entrega como concluída
  descarta e recria o DOM de todas as outras.

### 3.5 Qualidade e processo

**Cobertura de testes.** `npm test` roda **308 testes em 139 suítes** (~1,1 s, `node --test` nativo,
zero dependências). A cobertura cobre hoje todos os `lib/` (~96% de statement via
`node --test --experimental-test-coverage`), inclusive as últimas extrações
(`delivery-status-helpers`, `advanced-filters-helpers`, `trackingPublicBase`/`trackingUrl`,
`extractDistrict`), e as regras do Firestore têm suite no emulador
(`test/rules/firestore.rules.test.js`, `npm run test:rules`). `src/js` continua sem teste direto
(bloqueio ESM acima); a estratégia adotada é extrair regra de domínio para `lib/`.

**CI.** `.github/workflows/ci.yml` roda `npm ci`, lint, testes e build a cada push/PR.

**Lint.** ESLint 9 (flat config) cobrindo `lib/`, `test/` e **todo `src/js`**. `npm run verify` =
lint + testes + build; `npm run typecheck` existe mas não roda no verify.

**Versionamento.** `version.json` é a fonte da verdade e carimba `firebase-config.js` e o
`build.gradle` automaticamente no release; o `CACHE_NAME` do `sw.js` é carimbado pelo build com o
hash do bundle. O campo `"version"` do `package.json` _continua_ 1.5.29 (stale) — único ponto de
dessincronização restante.

**Release Android.** `scripts/android-release.sh` empacota APK assinado em `dist/`
(`npm run android:release`): seta `JAVA_HOME`/`ANDROID_HOME`, faz `cap:sync`, carimba
versionCode/versionName, garante `POST_NOTIFICATIONS` no manifest, avisa se
`google-services.json` (Crashlytics) estiver ausente e roda `assembleRelease`. Continua dependendo
da configuração prévia da máquina (JBR, SDK, keystore) — não é reproduzível do zero.

---

## 4. Roteiro de melhorias em três ondas

### Onda A — correções urgentes e de baixo risco

Nada nesta onda exige refatoração. São mudanças pontuais, verificáveis e reversíveis.

**A1. Fechar a escrita pública no `tracks`.**
O problema é o S1: qualquer um com o link escreve no documento. A mudança: trocar o modelo de
"token é senha de leitura e escrita" por "token é senha de leitura; escrita só com credencial".
Concretamente, habilitar Firebase Anonymous Auth no app do motorista, gravar `ownerUid` no documento
no momento do `create`, e condicionar `allow update` a `request.auth.uid == resource.data.ownerUid`.
A leitura continua pública por token. Arquivos afetados: `firestore.rules:14-28` (regras),
`src/js/main.js:894-908` (obter o token de auth antes de escrever) e `916-949` (incluir `ownerUid` no
payload), `src/js/main.js:6565-6576` (passar o ID token ao serviço nativo),
`native/android/BackgroundGpsService.java:315-351` (enviar `Authorization: Bearer` em vez de `?key=`,
com renovação do token). Como validar: emulador do Firestore com um teste que tenta um `update` sem
auth e espera `PERMISSION_DENIED`, e um teste que faz `update` com o `ownerUid` correto e espera
sucesso.

**A2. Separar a chave do Google Maps em duas e ligar cotas.**
Problema: S3, a chave não pode ser restringida porque serve web e Android. Mudança: criar duas
chaves no Google Cloud — `MAPS_WEB` restrita por referenciador a `rotaflow-83610.web.app` e ao domínio
próprio, limitada a Maps JavaScript, Geocoding, Places e Directions; e `MAPS_ANDROID` restrita ao
pacote `com.rotaflow.pro` com o SHA-1 do certificado de release, limitada ao Maps SDK for Android.
Arquivos: `firebase-config.js:12`, `index.html:258`, `track.html:1078-1082`, `native/bridge.js:196`,
`src/js/main.js:74` (remover a constante duplicada e usar `window.ROTAFLOW_MAPS_KEY`). Em paralelo,
no console do Google Cloud: orçamento com alerta por e-mail e cota diária por API. Como validar: o app
web funciona e a chave web, colada num HTML de outro domínio, retorna `RefererNotAllowedMapError`.

**A3. Tirar o `estudo-transpetro/` do deploy e inverter a lógica do Hosting.**
Problema: S6. Mudança mínima: adicionar `"estudo-transpetro/**"` ao `ignore` do `firebase.json`.
Mudança correta: trocar `"public": "."` por um diretório `public/` que o build popula explicitamente,
transformando a blocklist em allowlist. Arquivos: `firebase.json:3-27`, `scripts/build-web.js`
(copiar `index.html`, `sw.js`, `firebase-config.js`, `track*` e `build/` para `public/`). Como
validar: `firebase deploy --only hosting --dry-run` (ou inspecionar `.firebase/hosting..cache` depois
do deploy) e conferir que apenas os arquivos esperados aparecem, incluindo `build/app.js`.

**A4. TTL e minimização de dados na coleção `tracks`.**
Problema: S4. Mudança: adicionar um campo `expiresAt` ao payload e configurar uma política de TTL no
Firestore para apagar documentos vencidos (7 dias após a última atualização é um prazo razoável para
suporte ao cliente). Ao encerrar o rastreio, limpar `destLat`, `destLng` e `destName` em vez de
apenas mudar o `status`. Arquivos: `src/js/main.js:916-949` (`buildTrackPayload`),
`src/js/main.js:1055-1062` (`closeTrackingSession`), `firestore.rules:49-54` (permitir `expiresAt` na
lista de campos), e a política de TTL no console do Firestore. Acrescentar também um parágrafo de
privacidade em `track.html` perto do rodapé. Como validar: criar um documento com `expiresAt` no
passado no emulador e confirmar a exclusão; verificar que a página do cliente degrada com elegância
quando o documento some (o caminho já existe em `track.html:905-909`, com `missingTries`).

**A5. Publicar apenas para as próximas paradas.**
Problema de custo da seção 3.2. Mudança: em `activeTrackTargets` (`main.js:6505-6513`) e no filtro de
`publishDriverGpsFromWatch` (`main.js:1156`), limitar aos três primeiros destinos de `pendingStops()`,
que já está ordenado pela rota. Os demais continuam com o documento publicado (o cliente vê destino,
status e `stopsAhead`), só param de receber atualização de GPS em tempo real até chegarem perto da
vez. Arquivos: `src/js/main.js:1153-1184`, `6505-6513`,
`native/android/BackgroundGpsService.java:194-221` (o mesmo corte no lado nativo). Como validar:
contar as escritas no console do Firebase durante uma rota de teste com 10 paradas, antes e depois.

**A6. Validar e escapar a restauração de backup.**
Problema: S8. Mudança: envolver `del.id`, `del.sequentialId`, `statusText` e `statusClass` em
`escapeHtml` (`main.js:4302`, `4305`, `4306`, `4309`), e acrescentar em `restoreData` uma função de
validação que confira tipos e tamanhos de cada campo antes de atribuir, descartando o que não casar.
Arquivos: `src/js/main.js:4276-4336`, `5818-5859`. Como validar: um teste em `test/` que passe um
objeto com `sequentialId` contendo HTML pelo sanitizador e confira a saída; manualmente, importar um
backup com `"status": "<img src=x onerror=alert(1)>"` e confirmar que nada executa.

**A7. Corrigir o cache do service worker.**
Problema da seção 3.1. Três mudanças pequenas: ancorar a regex de hostname em `sw.js:65`
(`/\.(gstatic|googleapis|firebaseio)\.com$/`); trocar o ramo cache-first por stale-while-revalidate
de verdade para `/build/**`, devolvendo o cacheado mas sempre atualizando; e fazer
`scripts/build-web.js` carimbar o `CACHE_NAME` do `sw.js` da raiz a partir de `version.json`, igual ao
que `prepare-www.js:39-43` já faz para a cópia do APK. Arquivos: `sw.js:2`, `60-74`,
`scripts/build-web.js`, `scripts/prepare-www.js`. Como validar: `npm run build`, abrir o app, mudar
uma string em `main.js`, rebuildar, recarregar e confirmar que a string nova aparece sem precisar
limpar o cache.

**A8. CI mínima.**
Criar `.github/workflows/ci.yml` que rode `npm ci`, `npm test` e `npm run build` em cada push e pull
request, falhando se `build/app.js` não for gerado. Como validar: abrir um PR que quebre um teste e
confirmar que o check falha.

**A9. Remover 85 KB de fonte não usada.**
Tirar `inter-latin-ext.woff2` do precache do service worker (`sw.js:12`) e da geração em
`src/styles/fonts.css`. Como validar: carregar o app e conferir visualmente que nenhum caractere
português aparece com fallback.

### Onda B — refatoração estrutural

Esta onda muda a forma do código. Deve vir depois da A, com os testes de regra do Firestore já no
lugar para servir de rede de proteção.

**B1. Quebrar `main.js` em módulos, guiado pelas seções que já existem.**
O problema é que 7.859 linhas num escopo compartilhado tornam qualquer mudança arriscada. A mudança
proposta é extrair, um por vez e nesta ordem de menor para maior acoplamento ao estado global:
`src/js/tracking.js` (hoje `main.js:850-1256`), `src/js/history.js` (`2402-2627`),
`src/js/gallery.js` (`3319-3431`), `src/js/backup-ui.js` (`5459-5860`) e `src/js/routing.js`
(`6386-7070`). Cada extração segue o padrão que `photo-store.js` e `backup-store.js` já estabeleceram:
o módulo não lê variáveis globais, recebe dependências por uma função `configure*()`. O estado global
que sobrar (`deliveries`, `routes`, `agenda`, `startPoint`) vira um `src/js/store.js` com funções de
acesso, para que as mutações diretas e o `saveStorage()` manual deixem de estar espalhados.
Arquivos: `src/js/main.js` e os novos módulos; `scripts/build-web.js` não precisa mudar, o esbuild já
faz bundling. Como validar: `npm test` continua passando, o `build/app.js` não cresce
significativamente, e um roteiro manual de fumaça cobrindo adicionar entrega, otimizar rota, marcar
entregue, compartilhar rastreio e restaurar backup.

**B2. Desacoplar a inicialização do app do callback do Google Maps.**
O problema é que o Maps falhar mata toda a interatividade (seção 3.1). A mudança: separar
`initMap` em duas funções — `initAppUi()`, chamada no `DOMContentLoaded`, que registra todos os
listeners de `main.js:7212-7292`, e `initMapLayer()`, que continua sendo o callback do Maps e cuida
só de `map`, `geocoder`, `directionsService` e marcadores. As funções que dependem do mapa passam a
checar a disponibilidade e mostrar um toast explicativo em vez de simplesmente não existirem.
Arquivos: `src/js/main.js:7144-7293` e `7729-7809`, `index.html:258`. Como validar: bloquear
`maps.googleapis.com` no DevTools, recarregar, e confirmar que perfil, backup, histórico, galeria,
lista e painel de entrega continuam funcionando.

**B3. Extrair um contrato único para o documento `tracks`.**
Hoje a forma do documento está em quatro lugares (seção 3.3). A mudança: criar `lib/track-schema.js`
com a lista de campos, os validadores e as funções compartilhadas (haversine, formatação de distância
e duração), importado por `src/js/main.js` e por um `track.html` que passe a carregar um bundle
gerado em vez de script inline. O arquivo também vira a fonte para gerar a lista de campos de
`firestore.rules`. Arquivos: novo `lib/track-schema.js`, `src/js/main.js:839-848` e `916-949`,
`track.html` inteiro, `track-sw.js:28-137`, `firestore.rules:48-73`, `scripts/build-web.js` (segundo
entry point). Como validar: testes de unidade do schema em `test/`, mais um teste de regras no
emulador que use exatamente a mesma lista de campos.

**B4. Tipos via JSDoc e `checkJs`.**
Adicionar um `jsconfig.json` com `checkJs: true` e anotar as entidades principais (`Delivery`,
`AgendaItem`, `Route`, `TrackDoc`, `UserProfile`) com `@typedef`. Não exige TypeScript nem mudar o
build — o esbuild ignora os comentários, e o editor e o CI passam a pegar erros de campo. Arquivos:
novo `jsconfig.json`, anotações em `lib/`, `src/js/`. Como validar: `npx tsc --noEmit` no CI, com
uma lista inicial de exclusões que vai encolhendo.

**B5. Backup de verdade, incluindo fotos.**
O problema é a perda total de dados da seção 3.1. A mudança: habilitar o backup na nuvem
(`firebase-config.js:15`) com autenticação real em vez de anônima (uma conta por motorista, via
e-mail ou Google), e fazer o upload das fotos do IndexedDB para o Storage de forma incremental e em
segundo plano, em vez de embutir no JSON. O JSON passa a conter apenas as referências. Arquivos:
`src/js/backup-store.js:163-204`, `src/js/main.js:5522-5546` e `5548-5604`,
`src/js/photo-store.js`, `storage.rules:6-13`, `src/js/main.js:1389-1409` (tela de login real).
Como validar: fazer backup num aparelho, instalar limpo em outro, logar e confirmar que rota, agenda
e fotos reaparecem.

**B6. Substituir o GPS cru pelo FusedLocationProvider e adicionar fila offline.**
`BackgroundGpsService.java:153-176` usa `LocationManager` com `GPS_PROVIDER` a cada 4 segundos e 12
metros, mais `NETWORK_PROVIDER`. Isso mantém o chip de GPS ligado a jornada inteira. A mudança:
migrar para `FusedLocationProviderClient` com `PRIORITY_BALANCED_POWER_ACCURACY` quando longe de um
destino e `PRIORITY_HIGH_ACCURACY` apenas dentro de um raio de alguns quilômetros da próxima parada,
e acrescentar uma fila persistente (Room ou um arquivo JSON) para as publicações que falharem
offline, drenada quando a conectividade voltar. Arquivos:
`native/android/BackgroundGpsService.java` (reescrita parcial),
`android/app/build.gradle` (dependência `play-services-location`), `native/bridge.js`. Risco: muda
comportamento sensível em segundo plano, precisa de teste de campo com medição de bateria antes e
depois. Como validar: rodar uma jornada simulada de 6 horas com o Battery Historian e comparar o
consumo.

**B7. Renderização incremental da lista.**
Trocar a reconstrução de `innerHTML` por atualização do nó específico que mudou. A delegação de
eventos já existe (`main.js:4429`), então basta `querySelector('[data-id="…"]')` e substituir o
`outerHTML` daquele item. Arquivos: `src/js/main.js:4355-4426`, `7462-7499`. Como validar: medir o
tempo de `markDelivered` no Performance do DevTools com 60 entregas na rota.

### Onda C — evolução de produto

Esta onda pressupõe a A e a maior parte da B. Os detalhes de cada ideia estão na seção 5; aqui ficam
as que são pré-requisito estrutural para as demais.

**C1. Multi-usuário de verdade.** Autenticação real (B5) é o pré-requisito. Depois disso, o modelo de
dados passa de `localStorage` por aparelho para Firestore por conta, com `users/{uid}/routes/{routeId}`
e `users/{uid}/agenda/{itemId}`. As regras `match /users/{userId}` já existem em `firestore.rules:6-8`
e `storage.rules:6-29` e finalmente passam a valer.

**C2. Conceito de organização.** Introduzir `orgs/{orgId}` com `members/{uid}` e papéis
(`gestor`, `motorista`). Rotas passam a pertencer a uma organização, não a uma pessoa. Essa é a
mudança de modelagem que destrava painel do gestor, relatórios de equipe e monetização por assento.

**C3. Separar o front do gestor.** Um segundo app web, provavelmente com framework, consumindo os
mesmos dados. Não faz sentido estendê-lo dentro de `main.js`.

---

## 5. Ideias profissionais de produto e negócio

O app funciona e resolve um problema real — a combinação de roteirização, rastreio público com ETA e
comprovação por foto já é mais do que a maioria dos apps gratuitos de entregador oferece. As ideias
abaixo são ordenadas por relação entre valor e esforço, com o esforço descrito em termos de quais
subsistemas precisam mudar.

### 5.1 Tirar o muro da página de rastreio (maior ganho imediato)

Hoje `track.html:811-813` exige **instalar o PWA e conceder permissão de notificação** antes de
mostrar o mapa:

```811:813:track.html
        function isAccessUnlocked() {
            return isInstalledOk() && isNotifyOk();
        }
```

Se qualquer uma das duas condições falhar, `showGate()` (`track.html:845-852`) esconde o mapa e
mostra uma tela de dois passos. Um cliente que recebeu o link no WhatsApp e só quer ver onde está a
encomenda bate numa parede de duas permissões — exatamente a fricção que o rastreio deveria eliminar.
A taxa de abandono nessa tela é, quase com certeza, a maior perda de valor do produto inteiro.

A inversão: mostrar o mapa imediatamente e oferecer instalação e notificações como um convite
dispensável no rodapé, depois que o cliente já viu o valor. Arquivos: `track.html:811-813`,
`845-852`, `877-887`, `897-923`. O risco é perder inscrições de push — mitigável pedindo a permissão
no primeiro evento relevante (quando o motorista fica a menos de 1 km), que é quando o cliente
realmente quer ser avisado. Vale instrumentar antes e depois para medir.

### 5.2 Importação de pedidos

Hoje cada entrega é digitada à mão em `index.html:61-95`, com geocodificação individual
(`main.js:7760`). Para quem tem 40 entregas por dia, isso é meia hora de digitação. Três níveis:

- **Colar uma lista de texto.** Um textarea que aceita uma entrega por linha, com separador
  configurável, e geocodifica em lote com throttle. Afeta `index.html` (novo painel),
  `src/js/main.js:6329-6385` (`addDeliveryDirect` já existe e serve como base) e o uso do Geocoder.
  Risco: custo de Geocoding em lote e limite de taxa — resolvível com fila e cache por endereço
  normalizado (`normalizeAddress` já existe em `main.js:5326-5328`).
- **Planilha (CSV/XLSX).** Mesmo fluxo, com parser e mapeamento de colunas. Depende de uma biblioteca
  de parsing, o que aumenta o bundle; melhor carregar sob demanda, como o `firebase-loader.js` já faz.
- **OCR de romaneio.** O motorista fotografa a lista impressa. Depende de uma Cloud Function com
  Cloud Vision, portanto do plano Blaze, e de uma etapa de revisão humana porque a precisão nunca é
  100%. Afeta `functions/`, a UI de câmera (`main.js:1734-1860`, já existe) e um novo fluxo de
  conferência.

A importação é o recurso que mais encurta o tempo entre "baixei o app" e "o app me economizou tempo",
e por isso é o melhor candidato a primeiro investimento depois das correções da Onda A.

### 5.3 Comprovação de entrega completa

A captura de foto já existe e é bem resolvida (`main.js:1734-1860`, `photo-store.js`, com compressão,
deduplicação e limite por item). Falta o que transforma foto em comprovante:

- **Assinatura do destinatário** num canvas, salva junto com a foto. Afeta `index.html` (novo modal),
  `src/js/photo-store.js` (mesmo armazenamento), `main.js:3423-3532` (ações do painel).
- **Carimbo de data, hora e coordenada GPS** na imagem no momento da captura. A posição já está
  disponível em `startPoint` (`main.js:6392`). Afeta `main.js:1889-1932` (`addPhotoDataUrlToItem`).
- **Recibo compartilhável.** Uma página pública, no mesmo molde do `track.html`, com foto, assinatura,
  horário e endereço, cujo link vai para o cliente e para o lojista. Afeta `firestore.rules`
  (nova coleção com as mesmas preocupações de retenção do S4), `storage.rules` (leitura por token) e
  um novo arquivo de página.

Isso é o que permite cobrar: comprovação de entrega é o que o lojista quer, não o que o motorista
quer. Depende de B5 (fotos fora do aparelho).

### 5.4 Painel do gestor e multi-entregador

Depende de C1 e C2. O painel é um segundo front-end, não uma aba do app atual: mapa com todos os
motoboys em tempo real, distribuição de pedidos entre eles, status consolidado do dia. Modelagem:
`orgs/{orgId}/routes/{routeId}` com `assignedTo`, e índices compostos em `firestore.indexes.json`
(hoje vazio) para as consultas por organização e data. Risco principal: o custo de leitura em tempo
real cresce com o produto de motoristas por observadores — vale usar documentos de agregação
atualizados por Cloud Function em vez de `onSnapshot` em coleções inteiras.

É também o que destrava a monetização: um lojista com três motoboys paga por assento; um motoboy
autônomo não paga nada.

### 5.5 Roteirização com janelas de tempo e restrições

Hoje a otimização é um `optimizeWaypoints: true` do Directions (`main.js:6796`) com fallback de
vizinho mais próximo acima de 24 paradas (`main.js:6806-6821`, `MAX_WAYPOINTS = 23`). Funciona, mas
não contempla janela de horário ("entregar entre 14h e 16h"), prioridade, capacidade do veículo nem
tempo de parada.

A evolução natural é um solver próprio rodando numa Cloud Function — OR-Tools via Python, ou uma
heurística de inserção com 2-opt em Node — alimentado por uma **matriz de distâncias cacheada** em vez
de chamadas Directions repetidas. Isso resolve o problema de custo da seção 3.2 e a limitação de 23
waypoints ao mesmo tempo. Afeta `functions/` (novo endpoint), `main.js:6786-7026` (o cliente passa a
chamar a Function em vez do Directions) e exige plano Blaze. Risco: latência percebida — a otimização
deixa de ser instantânea e precisa de UI de progresso.

### 5.6 Relatórios, métricas e cálculo de ganhos

Os dados brutos já existem: `routeDayStats` (`main.js:2425-2434`) conta entregues, falhas e
pendentes; `routeMetrics` tem metros e segundos (`main.js:6951`); o histórico guarda 30 dias
(`HISTORY_MAX_DAYS`, `main.js:2403`). Falta a camada de leitura: quilômetros por dia e por semana,
taxa de sucesso, motivos de falha agregados (`FAIL_REASON_LABELS` em `main.js:7542` já categoriza),
horário médio por parada, e ganhos calculados a partir de uma tabela de comissão configurável no
perfil.

Afeta `index.html` (nova aba), `src/js/main.js:2402-2627` (histórico vira fonte de dados, não só
lista) e o perfil (`main.js:5916-6033`, onde já há campos de configuração). Esforço contido: nenhuma
mudança de backend, nenhuma dependência nova. Risco: o histórico está limitado a 30 dias e em
`localStorage`, então relatórios mensais sérios dependem de B5 ou C1.

### 5.7 Notificação ao cliente via WhatsApp Business API

Hoje o WhatsApp é aberto manualmente com uma mensagem pré-montada
(`buildDeliveryWhatsAppMessage`, `main.js:4177-4202`, com placeholders `{nome}`, `{id}`, `{endereco}`,
`{link}` configuráveis em `main.js:5939-5941`). Funciona bem para um motorista, mas exige uma ação
por entrega e não escala.

A WhatsApp Business Platform permite mandar templates aprovados automaticamente — "saiu para
entrega", "chegando em 10 minutos", "entregue". Afeta `functions/index.js` (onde a lógica de
notificação já está centralizada em `onTrackNotify`) e exige conta Business verificada, aprovação de
templates e um provedor (Meta direto ou um BSP). Custo por mensagem de template. Risco regulatório:
precisa de opt-in do destinatário, o que muda o fluxo de cadastro do pedido.

Esse recurso é provavelmente o maior diferencial comercial da lista — é o que o lojista percebe como
"profissional" — mas é também o de maior fricção de implantação.

### 5.8 Monetização

O produto se presta a um freemium claro:

| Plano | Limite | Público |
|---|---|---|
| Grátis | 1 motorista, N entregas/dia, rastreio com marca RotaFlow | Motoboy autônomo |
| Pro | 1 motorista, ilimitado, relatórios, importação, marca própria no rastreio | Autônomo profissional |
| Equipe | Vários motoristas, painel do gestor, comprovantes, WhatsApp automático | Loja, floricultura, distribuidora |

A infraestrutura de cobrança afeta `functions/` (webhooks do provedor de pagamento), o modelo de
dados (`orgs/{orgId}.plan` e verificação de limite nas regras do Firestore) e a UI de upgrade. Para o
Brasil, Stripe ou Mercado Pago com Pix recorrente. O gate mais natural de cobrança é o rastreio com
marca própria e o painel do gestor — recursos que o cliente final vê.

### 5.9 Publicação na Play Store

O APK já é gerado e assinado (`scripts/android-release.sh`). O que falta para publicar:

- Política de privacidade hospedada e declaração de Data Safety no Play Console. A declaração é
  obrigatória e precisa cobrir localização em segundo plano, câmera e dados pessoais de terceiros.
- Justificativa do uso de localização em segundo plano. O Google revisa isso caso a caso e exige um
  vídeo demonstrando a funcionalidade. O foreground service já está correto com
  `FOREGROUND_SERVICE_TYPE_LOCATION` (`BackgroundGpsService.java:129`), o que ajuda.
- Play App Signing ativado, resolvendo o risco do S5.
- Build em AAB em vez de APK (`android-release.sh:62` usa `assembleRelease`; precisa de
  `bundleRelease`).
- `targetSdk` compatível com a exigência vigente do Play.
- `android/app/google-services.json` presente, hoje ausente e apenas avisado em
  `android-release.sh:52-59`.

### 5.10 Onboarding e internacionalização

O app hoje assume muita coisa: `EMPRESA_PADRAO = "Correx express"` (`main.js:389`),
`DDD_PADRAO = "69"` (`main.js:571`), `PORTO_VELHO_CENTER` como centro do mapa e fallback de
geocodificação falha (`main.js:407`, usado em `main.js:7761`) e raio de 50 km para o Places
(`main.js:408`, `7085`). Tudo isso é razoável para o usuário atual e inviável para o segundo usuário.

Um onboarding de três telas na primeira abertura — nome, empresa, cidade de operação — resolve e
melhora a primeira impressão. Afeta `index.html:17-27` (tela de login, hoje um único botão),
`main.js:389`, `571`, `407-408`, `5916-6033` (perfil).

Para i18n, as strings estão espalhadas em literais por todo o `main.js` e `track.html`. Extrair para
um dicionário é mecânico mas toca quase todos os arquivos; só vale a pena quando houver demanda
concreta fora do Brasil. O espanhol para a América Latina seria o primeiro alvo natural.

---

## 6. Quick wins

Mudanças pequenas, de risco baixo, com efeito desproporcional.

1. **Adicionar `estudo-transpetro/**` à lista `ignore` do `firebase.json` (linhas 4-27).** Uma linha,
   remove conteúdo não relacionado de produção.
2. **Remover `inter-latin-ext.woff2` do precache (`sw.js:12`) e do build.** 85 KB a menos no primeiro
   carregamento, zero impacto visual em português.
3. **Ancorar a regex de hostname em `sw.js:65`.** Evita que o service worker cacheie respostas de
   domínios de terceiros que apenas contenham "googleapis" no nome.
4. **Envolver `del.id`, `del.sequentialId` e `statusText` em `escapeHtml` (`main.js:4302`, `4305`,
   `4306`, `4309`).** Fecha o caminho de XSS do S8 com quatro edições pontuais.
5. **Criar `.github/workflows/ci.yml` com `npm ci && npm test && npm run build`.** Os testes já
   passam; só falta alguém executá-los automaticamente.
6. **Ligar orçamento com alerta e cota diária por API no Google Cloud.** Não é mudança de código e é
   a única proteção real contra a chave irrestrita do S3 enquanto A2 não for feita.
7. **Limitar a publicação de GPS às três próximas paradas (`main.js:1156`, `6505-6513`).** Uma
   mudança de filtro corta mais de 90% das escritas no Firestore.
8. **Adicionar `Cache-Control: public, max-age=31536000, immutable` para `/build/**` no
   `firebase.json`** e hash no nome do arquivo em `build-web.js`. Resolve banda e invalidação de uma
   vez.
9. **Minificar `track.html` no build e trocar `no-cache` por um cache curto com revalidação
   (`firebase.json:42-47`).** São 49 KB rebaixados a cada abertura pelo cliente, em 4G.
10. **Remover a constante duplicada `MAPS_WEB_KEY` de `main.js:74`** e usar `window.ROTAFLOW_MAPS_KEY`.
    Reduz de quatro para três os lugares a atualizar quando a chave mudar — e é pré-requisito
    trivial de A2.
11. **Carimbar o `CACHE_NAME` do `sw.js` da raiz a partir de `version.json` dentro de
    `build-web.js`.** Elimina um passo manual que, quando esquecido, entrega JavaScript velho aos
    usuários do PWA.
12. **Adicionar um aviso de privacidade curto no rodapé de `track.html`.** Baixo custo, e é o mínimo
    exigível de uma página que mostra o endereço de uma pessoa.
