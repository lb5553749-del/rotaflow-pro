# RotaFlow Pro — série perf 01–19 (redesign 2.0, parte 5)

**Arquivo:** `rotaflow-pro-1.5.31-perf-01-19.apk` (3.867.750 bytes)
**sha256:** `0442f72d00215a69153f22347fe6ccb26f474954962dc501cb0db4b7ab305a78`
**Versão:** 1.5.31 (versionCode 56) · mesma chave das séries 01–14 a 01–18

## Instalar

1. Baixe o APK no celular (link do Drive).
2. Toque no arquivo → *Instalar* (permita "instalar apps desconhecidos" se pedir).
3. Atualiza **por cima** da versão anterior. Se o Android recusar, desinstale a antiga — o backup do Drive continua valendo (menu ⋯ → *Restaurar*).

## O que mudou nesta versão

| Antes (01–18) | Agora (01–19) |
|---|---|
| Aviso de backup numa linha própria dentro da folha (28 px) | virou **selo no cabeçalho**, na linha do "Salvo no aparelho": `⚠ Fazer agora ✕` |
| Moldura até a 1ª parada: 229 px | **205 px** |
| Progresso do dia rolava para fora e você perdia "quanto falta" | **progresso gruda no topo** enquanto a lista rola e encolhe para uma linha fina |
| Ao rolar: 4 paradas inteiras | **4 inteiras + a 5ª aparecendo** (moldura cai para 56 px) |

**Resumo da série:** item 192 → 105 px, moldura 360 → 205 px, paradas inteiras na dobra 1 → 3 (e 5 com a alça expandida).

## Segurança

- Assinado só com **v2** (sem v1): exigido pelo Android 7+ e permite migrar para v3 depois sem trocar de chave.
- SHA-1 da chave é o mesmo das versões anteriores, então a **chave do Google Maps continua valendo**.
