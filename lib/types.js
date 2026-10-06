'use strict';

/**
 * Shared entity shapes. JSDoc only — no runtime. Imported so checkJs sees the names.
 *
 * Central models requested by architecture work:
 *   Route · DeliveryStop (= Delivery) · TrackPayload (= TrackDoc from buildTrackPayload)
 *
 * @typedef {Object} PhoneEntry
 * @property {string} numero
 * @property {string} [label]
 *
 * @typedef {Object} Delivery
 * @property {number|string} id
 * @property {string} [sequentialId]
 * @property {string} [nome]
 * @property {string} [endereco]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {PhoneEntry[]} [telefones]
 * @property {number} [pacotes]
 * @property {string} [notes]
 * @property {'pendente'|'em-rota'|'entregue'|'falhou'} [status]
 * @property {boolean} [favorito]
 * @property {boolean} [savedToAgenda]
 * @property {string[]} [photos]
 * @property {string[]} [photoIds]
 * @property {boolean} [voltarDepois]
 * @property {string} [failReason]
 * @property {string} [trackToken]
 * @property {number} [trackTokenV] 2 = criado com ownerUid (rules atuais)
 * @property {boolean} [nearNotified]
 * @property {boolean} [deliveredNotified]
 * @property {boolean} [absentNotified]
 * @property {number} [legMeters]
 * @property {number} [legSeconds]
 * @property {number} [etaMeters]
 * @property {number} [etaSeconds]
 * @property {number} [routeOrder]
 * @property {number} [valor] Receita / valor desta entrega (R$)
 * @property {string} [janelaInicio] HH:MM recebimento
 * @property {string} [janelaFim] HH:MM prazo / fim da janela
 *
 * Alias used in product language ("parada" / stop).
 * @typedef {Delivery} DeliveryStop
 *
 * @typedef {Object} AgendaItem
 * @property {number} [agendaId]
 * @property {string} [nome]
 * @property {string} [endereco]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {PhoneEntry[]} [telefones]
 * @property {number} [pacotes]
 * @property {string} [notes]
 * @property {boolean} [favorito]
 * @property {string[]} [photos]
 * @property {string[]} [photoIds]
 *
 * @typedef {Object} RouteMetrics
 * @property {string} [signature]
 * @property {number} [meters]
 * @property {number} [seconds]
 *
 * @typedef {Object} Route
 * @property {string} id
 * @property {string} [name]
 * @property {DeliveryStop[]} deliveries
 * @property {number} [nextSequenceNumber]
 * @property {boolean} [routeActive]
 * @property {RouteMetrics|null} [routeMetrics]
 * @property {number} [createdAt]
 *
 * Firestore `tracks/{token}` document shape (see lib/track-schema.js buildTrackPayload).
 * @typedef {Object} TrackDoc
 * @property {number} destLat
 * @property {number} destLng
 * @property {string} destName
 * @property {string} sequentialId
 * @property {'active'|'entregue'|'falhou'|'encerrado'} status
 * @property {string} motorista
 * @property {number} updatedAt
 * @property {boolean} nearNotified
 * @property {boolean} deliveredNotified
 * @property {boolean} absentNotified
 * @property {string} failReason
 * @property {string} ownerUid
 * @property {*} expiresAt Firestore Timestamp
 *
 * Firestore `tracks/{token}/live/pos` (posição ao vivo; não dispara onTrackNotify).
 * @typedef {Object} TrackLiveDoc
 * @property {number} updatedAt
 * @property {string} ownerUid
 * @property {*} expiresAt Firestore Timestamp
 * @property {number} [etaSeconds]
 * @property {number} [stopsAhead]
 * @property {number} [driverLat]
 * @property {number} [driverLng]
 * @property {number} [accuracy]
 *
 * buildTrackPayload output (event + live fields together; split by splitTrackPayload).
 * @typedef {TrackDoc & TrackLiveDoc} TrackPayload
 *
 * @typedef {Object} UserProfile
 * @property {string} [motorista]
 * @property {string} [empresa]
 * @property {string} [mensagemPadrao]
 * @property {number} [consumoKmL]
 * @property {number} [precoCombustivel]
 * @property {number} [valorPadraoEntrega]
 *
 * @typedef {Object} RouteEconomics
 * @property {number} [meters]
 * @property {number} [km]
 * @property {number} [fuelCost]
 * @property {number} [revenue]
 * @property {number} [netProfit]
 * @property {string} [message]
 *
 * @typedef {Object} HistoryDayStats
 * @property {number} total
 * @property {number} entregue
 * @property {number} falhou
 * @property {number} pendente
 *
 * @typedef {Object} HistoryDay
 * @property {string} id
 * @property {string} date
 * @property {number} savedAt
 * @property {DeliveryStop[]} deliveries
 * @property {number} [nextSequenceNumber]
 * @property {HistoryDayStats} [stats]
 * @property {RouteEconomics} [economics]
 */

module.exports = {};
