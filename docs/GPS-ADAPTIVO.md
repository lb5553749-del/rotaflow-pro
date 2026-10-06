# GPS adaptativo (bateria) — limites desta onda

## O que mudou (JS)

- `lib/gps-helpers.js`: helpers puros `isGpsStationary`, `adaptiveWatchOptions`,
  `nextStationaryState`, `suggestedBackgroundIntervalMs`.
- `src/js/gps.js`: o `watchPosition` do WebView/Capacitor Geolocation retuna
  automaticamente quando o motorista fica parado (~18 m, 3 amostras):
  - em movimento: `enableHighAccuracy: true`, `maximumAge: 10s`
  - parado: `enableHighAccuracy: false`, `maximumAge: 45s`

Isso reduz polling/CPU no JS enquanto a UI está em primeiro plano.

## O que NÃO mudou (nativo Java)

O `BackgroundGpsService` Android continua com intervalo fixo (~4 s / 12–20 m)
em `BackgroundGpsPlugin` / `BackgroundGpsService`. Alterar o intervalo nativo
exige patch Java + validação de notificação foreground, custo de bateria real
e regressão de “near” push — **fora do escopo seguro desta onda**.

`suggestedBackgroundIntervalMs()` documenta o valor desejado (12 s parado /
4 s em movimento) para uma ponte futura (`bg.updateInterval` ou similar).

## Próximo passo sugerido

1. Expor `setAdaptiveInterval({ intervalMs, minDistanceM })` no plugin
   `BackgroundGps`.
2. Chamar a partir de `retuneGpsWatchIfNeeded` quando `bgGpsStarted`.
3. Testar com tela bloqueada + 1 alvo de rastreio antes de release.
