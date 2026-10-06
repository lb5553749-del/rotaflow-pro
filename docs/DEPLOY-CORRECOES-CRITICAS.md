# Deploy das correções críticas (rastreio, chaves, headers)

Rules, Cloud Functions, hosting (track.html / track-sw.js) e o app mudaram juntos.
Siga a ordem abaixo; nada disso é feito pelo CI.

## 1. Antes do deploy (console / CLI, uma vez)

1. **Auth anônima ligada**: Console Firebase → Authentication → Sign-in method → *Anônimo* → Ativar.
   Sem isso o app não publica rastreio (as rules exigem `request.auth`).
2. **Chave VAPID no Secret Manager** (valor = `privateKey` de `functions/vapid-private.json`):
   ```bash
   firebase functions:secrets:set VAPID_PRIVATE_KEY
   ```
   Depois do primeiro deploy bem-sucedido, apague `functions/vapid-private.json` da máquina
   (guarde a private num cofre). Emulador: `functions/.secret.local` com `VAPID_PRIVATE_KEY=...`.
3. **Chave Maps (`AIzaSyCRc…`)** — Google Cloud Console → APIs e serviços → Credenciais:
   - Restringir por **referenciador HTTP**: `https://rotaflow-83610.web.app/*`,
     `https://rotaflow-83610.firebaseapp.com/*` (+ `http://localhost/*` se usar preview).
   - Para o SDK nativo, criar **outra chave** restrita a *Apps Android* (pacote `com.rotaflow.pro`
     + SHA-1 do keystore de release e do debug) e usá-la em `AndroidManifest.xml`
     (`com.google.android.geo.API_KEY`). A mesma chave não aceita as duas restrições.
   - Restringir as APIs da chave (Maps JavaScript, Directions, Geocoding, Maps SDK for Android).
4. **Chave Firebase web (`AIzaSyBBO…`)**: se tiver restrição de API, incluir *Identity Toolkit API*
   e *Token Service API* (login anônimo; o GPS nativo em segundo plano renova o ID token em
   `securetoken.googleapis.com`), além de Cloud Firestore.
5. **App Check** (próximo passo, opcional): reCAPTCHA Enterprise na web e Play Integrity no Android;
   ativar enforcement em Firestore só depois de todos os clientes atualizados.

## 2. Deploy (tudo junto)

```bash
npm test && npm run test:rules && npm run build
firebase deploy --only functions,firestore:rules,hosting
```

Rules e cliente são acoplados: rules novas recusam escrita sem `ownerUid`/`expiresAt` e recusam
posição no doc pai; o track.html novo lê `tracks/{token}/live/pos`.

## 3. Depois do deploy

- Gerar e distribuir **APK novo** (`npm run android:release`): `src/js` mudou. APKs antigos
  continuam abrindo, mas **não conseguem mais publicar rastreio** (sem login/ownerUid).
- Links enviados antes do deploy (tracks sem `ownerUid`) ficam congelados no último estado.
  Ao compartilhar de novo essa entrega, o app novo gera outro token automaticamente
  (`trackTokenV`); o cliente precisa do link novo.
- Conferir no console do navegador (`/` e `/r/<token>`) se há avisos
  `[Report Only] Refused to …`. Sem avisos por alguns dias, trocar em `firebase.json`
  `Content-Security-Policy-Report-Only` → `Content-Security-Policy`.

## Retenção (LGPD)

- O app grava `expiresAt` em `tracks/{token}` e `live/pos`: **48h após a última escrita**
  enquanto a entrega está ativa, **24h** após entregue/falhou/encerrado.
- `cleanupExpiredTracks` (a cada 6h) apaga o track com `recursiveDelete` (inclui `live/` e `subs/`).
  Tracks antigos sem `expiresAt` saem após 3 dias sem atualização.
- **TTL nativo não é usado**: apagaria só o doc pai e deixaria `subs/` (endpoint e chaves de push)
  órfãs. Se um dia quiser TTL como reforço, precisa de política em cada grupo:
  ```bash
  gcloud firestore fields ttls update expiresAt --collection-group=tracks --enable-async
  gcloud firestore fields ttls update expiresAt --collection-group=live --enable-async
  ```
  e `expiresAt` também em `subs` (hoje não existe).
