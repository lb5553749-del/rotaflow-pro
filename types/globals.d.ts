/**
 * Declarações globais usadas pelo app no WebView (sem @types próprios).
 * Só tipos — nada em runtime, então o esbuild ignora.
 */

interface Window {
  /** Ponte nativa (native/bridge.js) — plugin nativo exposto ao JS. */
  RotaFlowCap: any;
  /** Chaves/config injetadas por firebase-config.js. */

  ROTAFLOW_FIREBASE: any;
  ROTAFLOW_MAPS_KEY?: string;
  ROTAFLOW_MAPS_ANDROID_KEY?: string;
  ROTAFLOW_TRACK_HOST?: string;
  ROTAFLOW_VAPID_PUBLIC?: string;
  ROTAFLOW_APP_VERSION?: string;
  ROTAFLOW_VERSION_CODE?: number;
  ROTAFLOW_CLOUD_BACKUP_ENABLED?: boolean;
  initMap?: () => void;
  __rfLoadMaps?: () => void;
  isSecureContext: boolean;
  [key: string]: any;
}

/** Payload de rastreio publicado no Realtime Database. */
type TrackDoc = Record<string, any>;

/** SDK do Firebase carregado por <script> (compat) — sem @types no projeto. */
declare const firebase: any;
/** Google Maps JS API (carregada sob demanda). */
declare const google: any;
