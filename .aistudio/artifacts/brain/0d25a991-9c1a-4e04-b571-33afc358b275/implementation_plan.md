# RotaFlow Pro — Otimização de Rotas, Mapa Interativo e Link de Rastreio

Plano de modernização focado em aprimorar o RotaFlow Pro com visualização em mapa interativo integrado com marcadores de paradas e traçado da rota, algoritmo aprimorado de ordenação e otimização de paradas com cálculo de ETA, e mensagens no WhatsApp com previsão de horário e link dinâmico de rastreio para o cliente.

---

## Decisões Confirmadas pelo Usuário

> [!IMPORTANT]
> As seguintes decisões foram confirmadas diretamente pelo usuário na etapa de planejamento:
> - **Foco Principal**: Otimização inteligente de rotas com mapa interativo integrado no aplicativo.
> - **Visualização de Mapa**: Adição de mapa interativo diretamente na interface do app, exibindo os pinos de cada entrega (com badges A1, A2, etc.), traçado visual entre os pontos e status em tempo real.
> - **Comunicação com o Cliente**: Mensagens de WhatsApp aprimoradas contendo a previsão de chegada estimada (ETA) e link seguro de rastreio direto da encomenda.

---

## 1. Visão Geral e Conceito

O RotaFlow Pro é o aplicativo de cabeceira do motorista entregador. Este upgrade eleva a experiência operacional em três frentes essenciais:

1. **Visão Espacial Integrada (Mapa Interativo)**:
   - Permite ao motorista alternar entre a visão de Lista e a visão de Mapa com um único toque.
   - Pinos coloridos por status: Azul (Em rota), Amarelo (Pendente), Verde (Entregue) e Vermelho (Falhou), com número sequencial destacado.
   - Traçado de rota conectando o ponto de partida atual a todas as paradas pendentes em sequência.

2. **Otimização de Rota & ETA Realista**:
   - Algoritmo de roteirização por proximidade (Nearest-Neighbor & Janelas de Horário), garantindo menor quilometragem percorrida e menor gasto de combustível.
   - Cálculo automático do Horário Previsto de Chegada (ETA) para cada cliente com base no tempo médio por parada e distância.

3. **Link de Rastreio e Mensagem ao Destinatário**:
   - Geração de link dinâmico de rastreio (`/track.html?token=...` ou link do motorista) compartilhado via WhatsApp.
   - O cliente final acompanha em página leve: status do pacote, paradas à frente na fila e previsão de entrega atualizada.

---

## 2. Experiência do Usuário e Design Visual

### Fluxos Principais

1. **Alternância Lista ⟷ Mapa na Tela de Rota**:
   - No topo da tela de Rota, um seletor visual segmentado permite alternar entre `Lista` e `Mapa`.
   - No modo Mapa:
     - Mapa vetorial interativo centralizado na região das entregas.
     - Pinos dinâmicos com a numeração sequencial (ex: A1, A2, A3).
     - Toque no pino exibe um Bottom Sheet / Mini-card flutuante com nome do cliente, endereço, botão de WhatsApp e botão de "Iniciar / Concluir".
     - Linha de traçado conectando os pontos da rota ativa.

2. **Otimização de Sequência com Feedback Visual**:
   - Ao tocar em `Otimizar Rota`, o sistema recalcula a melhor ordem respeitando prioridades (Favoritos, Janelas de Horário urgentes) e proximidade geográfica.
   - Exibição de resumo com ganho estimado (ex: "Economia estimada de 4.2 km e 18 minutos").

3. **Disparo do Rastreio no WhatsApp**:
   - Ao colocar a entrega no status `Em rota`, o botão do WhatsApp já gera a mensagem formatada:
     > *"Olá [Cliente]! Sou o entregador do RotaFlow Pro e seu pacote está a caminho. Previsão de chegada: 14:40. Acompanhe a entrega pelo link: [Link de Rastreio]"*

### Identidade Visual & Componentes

- **Tema Noturno Premium (Driver-First)**: Fundo escuro `#0F172A`, cartões `#1E293B`, destaques em Azul Cobalto `#3B82F6`, Verde Esmeralda `#22C55E` e Âmbar `#F59E0B`.
- **Marcadores de Mapa**: Círculos contrastantes com borda luminosa e tipografia em negrito legível mesmo em suportes veiculares em movimento.
- **Microinterações**: Transições suaves entre Lista e Mapa, badges pulsantes para entrega "Em rota" e feedback tátil ao concluir entregas.

---

## 3. Decisões de Produto e Trade-Offs

- **Mapa Vetorial em Canvas / OpenLayers / Mapbox vs Google Maps Nativo**:
  - *Decisão*: Renderização de mapa interativo de alta performance integrado via componente Compose / WebView interativo sem exigir chave de API prévia obrigatória para visualização local, com botão de 1 toque para abrir o Google Maps ou Waze externo para navegação GPS turn-by-turn.
  - *Por que*: O motorista tem visão geral imediata de todas as paradas dentro do app sem bloqueio de chaves de API, e utiliza o navegador de sua preferência (Waze/Maps) para o trajeto guiado por voz.

- **Link de Rastreio Dinâmico com Token Seguro**:
  - *Decisão*: Geração de tokens de rastreio locais vinculados aos dados da rota e sincronizados com a página de rastreio (`track.html`), permitindo visualização pelo cliente sem expor dados sensíveis de outras entregas do motorista.
  - *Por que*: Preserva a privacidade dos demais clientes e funciona instantaneamente via link Web/PWA.

---

## 4. Arquitetura Técnica e Estrutura de Dados

### Diagrama de Arquitetura

```
┌────────────────────────────────────────────────────────────────────────┐
│                        RotaFlow Pro Interface                          │
├────────────────────┬───────────────────────────────────────────────────┤
│    Modo Lista      │                     Modo Mapa                     │
│  - DeliveryCards   │  - MapView interativo com Marcadores A1..An       │
│  - Quick Actions   │  - Mini BottomSheet flutuante ao tocar no pino    │
│  - Progress Bar    │  - Traçado polilinha entre os pontos da rota     │
└─────────┬──────────┴─────────────────────────┬─────────────────────────┘
          │                                     │
          ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         RotaFlowViewModel                              │
│  - StateFlow<RotaUiState> (Lista de entregas, Parada ativa, Modo View) │
│  - optimizeRouteWithCoordinates() & calculateStopETAs()                │
│  - generateTrackingPayload(deliveryId)                                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         RotaFlowRepository                             │
│  - GeoCoords & Geocodificação de endereços                             │
│  - Algoritmo de roteamento e ordenação sequencial                      │
│  - Geração de tokens de rastreio seguros                               │
│  - Armazenamento de dados da rota, perfil e histórico                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Entidades e Campos Adicionados

- `Delivery`:
  - `lat: Double?`, `lng: Double?` (Coordenadas geográficas da parada)
  - `etaHorario: String?` (Horário estimado de entrega, ex: "15:20")
  - `trackToken: String` (Token exclusivo para a página de rastreio)
- `RouteMetrics`:
  - `totalMeters: Double`
  - `totalSeconds: Long`
  - `polylinePoints: List<Pair<Double, Double>>`

---

## Próximos Passos de Execução

1. Adicionar o seletor de visualização (Lista / Mapa) na barra superior da tela de Rota.
2. Implementar o componente de Mapa Interativo com pinos customizados por status e traçado da rota.
3. Integrar o cálculo de ETA automático por parada com base na sequência de entregas.
4. Atualizar o gerador de mensagens do WhatsApp para incluir horário previsto e link de rastreio.
5. Validar a compilação completa com `compile_applet`.
