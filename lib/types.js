'use strict';

/**
 * Shared entity shapes. JSDoc only — no runtime. Imported so checkJs sees the names.
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
 * @property {boolean} [nearNotified]
 * @property {boolean} [deliveredNotified]
 * @property {boolean} [absentNotified]
 * @property {number} [legMeters]
 * @property {number} [legSeconds]
 * @property {number} [etaMeters]
 * @property {number} [etaSeconds]
 * @property {number} [routeOrder]
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
 * @property {Delivery[]} deliveries
 * @property {number} [nextSequenceNumber]
 * @property {boolean} [routeActive]
 * @property {RouteMetrics|null} [routeMetrics]
 * @property {number} [createdAt]
 *
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
 * @property {number} [etaSeconds]
 * @property {number} [stopsAhead]
 * @property {number} [driverLat]
 * @property {number} [driverLng]
 * @property {number} [accuracy]
 *
 * @typedef {Object} UserProfile
 * @property {string} [motorista]
 * @property {string} [empresa]
 * @property {string} [mensagemPadrao]
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
 * @property {Delivery[]} deliveries
 * @property {number} [nextSequenceNumber]
 * @property {HistoryDayStats} [stats]
 */

module.exports = {};
