/**
 * Contrato de rastreio compartilhado com track.html e track-sw.js.
 * Bundle: build/track-shared.js (IIFE) — acessível em globalThis.RotaFlowTrack.
 */
import {
    TRACK_STATUSES,
    TRACK_FAIL_REASONS,
    TRACK_FIELD_KEYS,
    TRACK_NEAR_METERS,
    isValidTrackToken,
    normalizeTrackToken,
    readTrackTokenFromLocation,
    haversineDistance,
    haversineKm,
    formatDistance,
    formatDistanceApprox,
    formatClientDuration,
    isValidTrack
} from '../../lib/track-schema.js';

const RotaFlowTrack = {
    TRACK_STATUSES,
    TRACK_FAIL_REASONS,
    TRACK_FIELD_KEYS,
    TRACK_NEAR_METERS,
    isValidTrackToken,
    normalizeTrackToken,
    readTrackTokenFromLocation,
    haversineDistance,
    haversineKm,
    formatDistance,
    formatDistanceApprox,
    formatClientDuration,
    formatDuration: formatClientDuration,
    isValidTrack
};

if (typeof globalThis !== 'undefined') {
    globalThis.RotaFlowTrack = RotaFlowTrack;
}

export default RotaFlowTrack;
