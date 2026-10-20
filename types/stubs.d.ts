/**
 * Stubs de módulos que o TypeScript puxaria como JS de `node_modules`
 * (`events`, `punycode`) via `@types/node`. Não são usados pelo app; o stub
 * evita que o checkJs tente analisar código de terceiros.
 */
declare module 'events' {
  const EventEmitter: any;
  export = EventEmitter;
}

declare module 'punycode' {
  const punycode: any;
  export = punycode;
}
