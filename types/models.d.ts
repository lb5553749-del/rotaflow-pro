/**
 * Modelos de dados do app em escopo GLOBAL (só tipos, nada em runtime).
 * Espelha lib/types.js, que declara os mesmos shapes via JSDoc.
 * Existindo aqui, qualquer arquivo pode usar `Delivery`, `Route`, `HistoryDay`…
 * sem precisar de import — e o esbuild não vê nada disso.
 */

type PhoneEntry = {
  numero: string;
  label?: string;
};

type Delivery = {
  id?: number | string;
  sequentialId?: string | number;
  nome?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  telefones?: any[];
  pacotes?: number;
  notes?: string;
  status?: string;
  favorito?: boolean;
  savedToAgenda?: boolean;
  photos?: string[];
  photoIds?: string[];
  voltarDepois?: boolean;
  failReason?: string;
  trackToken?: string;
  trackTokenV?: number;
  nearNotified?: boolean;
  deliveredNotified?: boolean;
  absentNotified?: boolean;
  legMeters?: number;
  legSeconds?: number;
  etaMeters?: number;
  etaSeconds?: number;
  routeOrder?: number;
  valor?: number;
  janelaInicio?: string;
  janelaFim?: string;
  [key: string]: any;
};

/** Alias usado na linguagem de produto ("parada" / stop). */
type DeliveryStop = Delivery;

type AgendaItem = {
  agendaId?: number;
  nome?: string;
  endereco?: string;
  lat?: number;
  lng?: number;
  telefones?: any[];
  pacotes?: number;
  notes?: string;
  favorito?: boolean;
  photos?: string[];
  photoIds?: string[];
  [key: string]: any;
};

type RouteMetrics = {
  signature?: string;
  meters?: number;
  seconds?: number;
  [key: string]: any;
};

type Route = {
  id: string;
  name?: string;
  deliveries: DeliveryStop[];
  nextSequenceNumber?: number;
  routeActive?: boolean;
  routeMetrics?: RouteMetrics | null;
  createdAt?: number;
  [key: string]: any;
};

type TrackLiveDoc = {
  updatedAt: number;
  ownerUid: string;
  expiresAt: any;
  etaSeconds?: number;
  stopsAhead?: number;
  driverLat?: number;
  driverLng?: number;
  accuracy?: number;
  [key: string]: any;
};

type TrackPayload = Record<string, any>;

type UserProfile = {
  motorista?: string;
  empresa?: string;
  mensagemPadrao?: string;
  consumoKmL?: number;
  precoCombustivel?: number;
  valorPadraoEntrega?: number;
  [key: string]: any;
};

type RiskArea = {
  id: string;
  label: string;
  match: string;
  level: 'amarelo' | 'vermelho';
  [key: string]: any;
};

type RouteEconomics = {
  meters?: number;
  km?: number;
  fuelCost?: number;
  revenue?: number;
  netProfit?: number;
  message?: string;
  [key: string]: any;
};

type HistoryDayStats = {
  total: number;
  entregue: number;
  falhou: number;
  pendente: number;
};

type HistoryDay = {
  id: string;
  date: string;
  savedAt: number;
  deliveries: DeliveryStop[];
  nextSequenceNumber?: number;
  stats?: HistoryDayStats;
  economics?: RouteEconomics;
  [key: string]: any;
};
