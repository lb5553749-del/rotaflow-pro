package com.example.rotaflow.data.service

import android.util.Log
import com.example.rotaflow.data.model.Delivery
import com.example.rotaflow.data.model.DeliveryStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.*

data class OptimizationResult(
    val success: Boolean,
    val reorderedDeliveries: List<Delivery>,
    val totalDistanceMeters: Long,
    val totalDurationSeconds: Long,
    val overviewPolylinePoints: List<Pair<Double, Double>> = emptyList(),
    val message: String,
    val usedGoogleMapsApi: Boolean
)

object RouteOptimizationService {

    private const val TAG = "RouteOptimizationService"
    const val DEFAULT_MAPS_KEY = "AIzaSyCRcCeryXHln-E84STTLlAl-oGrPh4mP8g"

    /**
     * Calculates the most efficient sequence for the current list of deliveries
     * using the Google Maps Directions API (with optimize:true), falling back to
     * a 2-opt spatial heuristic if offline or API key limits are reached.
     */
    suspend fun optimizeRoute(
        deliveries: List<Delivery>,
        startLat: Double?,
        startLng: Double?,
        apiKey: String? = null,
        routePrefix: String = "A"
    ): OptimizationResult = withContext(Dispatchers.IO) {
        if (deliveries.isEmpty()) {
            return@withContext OptimizationResult(
                success = true,
                reorderedDeliveries = emptyList(),
                totalDistanceMeters = 0,
                totalDurationSeconds = 0,
                message = "Nenhuma entrega para otimizar",
                usedGoogleMapsApi = false
            )
        }

        // Separate deliveries:
        // In-transit (active) must remain first.
        // Completed (entregue / falhou) remain in their completed position.
        // Pending deliveries are the ones to be sequenced.
        val inTransit = deliveries.filter { it.status == DeliveryStatus.EM_ROTA }
        val pending = deliveries.filter { it.status == DeliveryStatus.PENDENTE }
        val completed = deliveries.filter { it.status == DeliveryStatus.ENTREGUE || it.status == DeliveryStatus.FALHOU }

        if (pending.isEmpty()) {
            return@withContext OptimizationResult(
                success = true,
                reorderedDeliveries = deliveries,
                totalDistanceMeters = 0,
                totalDurationSeconds = 0,
                message = "Todas as entregas já foram concluídas ou estão em rota",
                usedGoogleMapsApi = false
            )
        }

        // Stops with coordinates
        val validPending = pending.filter { it.lat != null && it.lng != null }
        val withoutCoords = pending.filter { it.lat == null || it.lng == null }

        if (validPending.isEmpty()) {
            val reordered = resequenceDeliveries(inTransit + pending + completed, routePrefix)
            return@withContext OptimizationResult(
                success = true,
                reorderedDeliveries = reordered,
                totalDistanceMeters = 0,
                totalDurationSeconds = 0,
                message = "Entregas sem coordenadas no mapa mantidas na ordem atual",
                usedGoogleMapsApi = false
            )
        }

        // Effective start point:
        // 1. Explicit startLat/startLng (e.g. driver GPS)
        // 2. Or in-transit delivery coords
        // 3. Or first delivery coords
        val originLat = startLat
            ?: inTransit.firstOrNull { it.lat != null }?.lat
            ?: validPending.first().lat!!
        val originLng = startLng
            ?: inTransit.firstOrNull { it.lng != null }?.lng
            ?: validPending.first().lng!!

        val finalApiKey = if (!apiKey.isNullOrBlank()) apiKey.trim() else DEFAULT_MAPS_KEY

        // Try Google Maps Directions API with waypoint optimization
        var googleResult: OptimizationResult? = null
        if (finalApiKey.isNotBlank() && validPending.size >= 2) {
            try {
                googleResult = callGoogleMapsDirections(
                    originLat = originLat,
                    originLng = originLng,
                    pendingStops = validPending,
                    apiKey = finalApiKey,
                    inTransit = inTransit,
                    completed = completed,
                    withoutCoords = withoutCoords,
                    routePrefix = routePrefix
                )
            } catch (e: Exception) {
                Log.w(TAG, "Google Maps Directions API call failed, falling back to 2-Opt TSP heuristic", e)
            }
        }

        if (googleResult != null && googleResult.success) {
            return@withContext googleResult
        }

        // Fallback: 2-Opt Traveling Salesperson Heuristic with Haversine distance
        val fallbackResult = optimizeWithSpatialHeuristic(
            originLat = originLat,
            originLng = originLng,
            pendingStops = validPending,
            inTransit = inTransit,
            completed = completed,
            withoutCoords = withoutCoords,
            routePrefix = routePrefix
        )

        return@withContext fallbackResult
    }

    /**
     * Calls Google Maps Directions API with optimize:true for waypoints.
     */
    private fun callGoogleMapsDirections(
        originLat: Double,
        originLng: Double,
        pendingStops: List<Delivery>,
        apiKey: String,
        inTransit: List<Delivery>,
        completed: List<Delivery>,
        withoutCoords: List<Delivery>,
        routePrefix: String
    ): OptimizationResult? {
        // Directions API allows up to 25 total points (origin + destination + 23 waypoints).
        // If pendingStops size <= 23, we use the last stop as destination and intermediate as waypoints.
        val stopsToOptimize = if (pendingStops.size > 23) pendingStops.take(23) else pendingStops
        val excessStops = if (pendingStops.size > 23) pendingStops.drop(23) else emptyList()

        val destination = stopsToOptimize.last()
        val waypoints = stopsToOptimize.dropLast(1)

        val waypointsParam = if (waypoints.isNotEmpty()) {
            val pts = waypoints.joinToString("|") { "${it.lat},${it.lng}" }
            "&waypoints=" + URLEncoder.encode("optimize:true|$pts", "UTF-8")
        } else {
            ""
        }

        val urlString = "https://maps.googleapis.com/maps/api/directions/json?" +
                "origin=$originLat,$originLng" +
                "&destination=${destination.lat},${destination.lng}" +
                waypointsParam +
                "&mode=driving" +
                "&language=pt-BR" +
                "&key=$apiKey"

        val url = URL(urlString)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("Accept", "application/json")
        }

        val responseCode = conn.responseCode
        if (responseCode != 200) {
            Log.w(TAG, "Directions API returned HTTP $responseCode")
            return null
        }

        val responseText = conn.inputStream.bufferedReader().use(BufferedReader::readText)
        val json = JSONObject(responseText)
        val status = json.optString("status")

        if (status != "OK") {
            Log.w(TAG, "Directions API status: $status")
            return null
        }

        val routes = json.getJSONArray("routes")
        if (routes.length() == 0) return null

        val routeObj = routes.getJSONObject(0)
        val legs = routeObj.getJSONArray("legs")

        // waypoint_order gives the optimal permutation of waypoints
        val waypointOrder = routeObj.optJSONArray("waypoint_order")
        val orderedWaypoints = mutableListOf<Delivery>()

        if (waypointOrder != null && waypointOrder.length() == waypoints.size) {
            for (i in 0 until waypointOrder.length()) {
                val origIdx = waypointOrder.getInt(i)
                orderedWaypoints.add(waypoints[origIdx])
            }
        } else {
            orderedWaypoints.addAll(waypoints)
        }
        orderedWaypoints.add(destination)

        val allPendingOrdered = orderedWaypoints + excessStops + withoutCoords
        val rawOrdered = inTransit + allPendingOrdered + completed

        // Extract total distance and duration
        var totalDistanceMeters = 0L
        var totalDurationSeconds = 0L
        val legDurations = mutableListOf<Long>()

        for (i in 0 until legs.length()) {
            val leg = legs.getJSONObject(i)
            val dist = leg.getJSONObject("distance").getLong("value")
            val dur = leg.getJSONObject("duration").getLong("value")
            totalDistanceMeters += dist
            totalDurationSeconds += dur
            legDurations.add(dur)
        }

        // Parse polyline
        val overviewPolyline = routeObj.optJSONObject("overview_polyline")?.optString("points") ?: ""
        val polylinePoints = if (overviewPolyline.isNotBlank()) decodePolyline(overviewPolyline) else emptyList()

        // Recompute ETAs based on leg durations
        val finalDeliveries = assignETAsAndSequentialIds(
            deliveries = rawOrdered,
            legDurations = legDurations,
            routePrefix = routePrefix
        )

        val km = String.format(Locale.US, "%.1f", totalDistanceMeters / 1000.0)
        val mins = totalDurationSeconds / 60

        return OptimizationResult(
            success = true,
            reorderedDeliveries = finalDeliveries,
            totalDistanceMeters = totalDistanceMeters,
            totalDurationSeconds = totalDurationSeconds,
            overviewPolylinePoints = polylinePoints,
            message = "Rota otimizada pelo Google Maps Directions ($km km • ~$mins min)",
            usedGoogleMapsApi = true
        )
    }

    /**
     * 2-Opt spatial heuristic for when Google Maps Directions API is unreachable.
     */
    private fun optimizeWithSpatialHeuristic(
        originLat: Double,
        originLng: Double,
        pendingStops: List<Delivery>,
        inTransit: List<Delivery>,
        completed: List<Delivery>,
        withoutCoords: List<Delivery>,
        routePrefix: String
    ): OptimizationResult {
        // Nearest neighbor initialization
        val remaining = pendingStops.toMutableList()
        val ordered = mutableListOf<Delivery>()
        var currentLat = originLat
        var currentLng = originLng

        while (remaining.isNotEmpty()) {
            var bestIdx = 0
            var bestDist = Double.MAX_VALUE

            for (i in remaining.indices) {
                val s = remaining[i]
                val dist = haversineDistanceMeters(currentLat, currentLng, s.lat!!, s.lng!!)
                // If stop has urgent window, favor it
                val windowBonus = if (s.janelaInicio.isNotBlank()) 0.85 else 1.0
                val score = dist * windowBonus
                if (score < bestDist) {
                    bestDist = score
                    bestIdx = i
                }
            }

            val chosen = remaining.removeAt(bestIdx)
            ordered.add(chosen)
            currentLat = chosen.lat!!
            currentLng = chosen.lng!!
        }

        // Apply 2-opt swaps to remove crossovers
        val optimizedPending = apply2Opt(ordered, originLat, originLng)
        val allDeliveries = inTransit + optimizedPending + withoutCoords + completed

        // Calculate estimated metrics (assuming average urban speed 28 km/h + 5 min per stop)
        var totalDistMeters = 0L
        var totalDurSeconds = 0L
        var prevLat = originLat
        var prevLng = originLng
        val legDurations = mutableListOf<Long>()

        for (d in optimizedPending) {
            val dist = haversineDistanceMeters(prevLat, prevLng, d.lat!!, d.lng!!).toLong()
            totalDistMeters += dist
            // travel time in seconds: dist / (28 km/h in m/s) + 5 min stop
            val travelTime = (dist / 7.78).toLong() + 300L
            totalDurSeconds += travelTime
            legDurations.add(travelTime)
            prevLat = d.lat
            prevLng = d.lng
        }

        // Synthetic polyline connecting points
        val polylinePoints = mutableListOf<Pair<Double, Double>>()
        polylinePoints.add(originLat to originLng)
        for (d in inTransit) {
            if (d.lat != null && d.lng != null) polylinePoints.add(d.lat to d.lng)
        }
        for (d in optimizedPending) {
            if (d.lat != null && d.lng != null) polylinePoints.add(d.lat to d.lng)
        }

        val finalDeliveries = assignETAsAndSequentialIds(
            deliveries = allDeliveries,
            legDurations = legDurations,
            routePrefix = routePrefix
        )

        val km = String.format(Locale.US, "%.1f", totalDistMeters / 1000.0)
        val mins = totalDurSeconds / 60

        return OptimizationResult(
            success = true,
            reorderedDeliveries = finalDeliveries,
            totalDistanceMeters = totalDistMeters,
            totalDurationSeconds = totalDurSeconds,
            overviewPolylinePoints = polylinePoints,
            message = "Rota sequenciada pelo menor trajeto ($km km • ~$mins min)",
            usedGoogleMapsApi = false
        )
    }

    /**
     * 2-Opt heuristic local search.
     */
    private fun apply2Opt(stops: List<Delivery>, startLat: Double, startLng: Double): List<Delivery> {
        if (stops.size < 4) return stops
        val route = stops.toMutableList()
        var improved = true
        var iterations = 0

        while (improved && iterations < 50) {
            improved = false
            iterations++

            for (i in 0 until route.size - 1) {
                for (k in i + 1 until route.size) {
                    val p1 = if (i == 0) startLat to startLng else route[i - 1].lat!! to route[i - 1].lng!!
                    val p2 = route[i].lat!! to route[i].lng!!
                    val p3 = route[k].lat!! to route[k].lng!!
                    val p4 = if (k + 1 < route.size) route[k + 1].lat!! to route[k + 1].lng!! else null

                    val currentDist = haversineDistanceMeters(p1.first, p1.second, p2.first, p2.second) +
                            (if (p4 != null) haversineDistanceMeters(p3.first, p3.second, p4.first, p4.second) else 0.0)

                    val newDist = haversineDistanceMeters(p1.first, p1.second, p3.first, p3.second) +
                            (if (p4 != null) haversineDistanceMeters(p2.first, p2.second, p4.first, p4.second) else 0.0)

                    if (newDist < currentDist - 5.0) { // minimum 5m improvement
                        route.subList(i, k + 1).reverse()
                        improved = true
                        break
                    }
                }
                if (improved) break
            }
        }

        return route
    }

    /**
     * Re-indexes sequential IDs (A1, A2...) and computes estimated arrival times.
     */
    private fun assignETAsAndSequentialIds(
        deliveries: List<Delivery>,
        legDurations: List<Long>,
        routePrefix: String
    ): List<Delivery> {
        val cal = Calendar.getInstance()
        val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
        var currentDurationSec = 0L

        return deliveries.mapIndexed { idx, delivery ->
            val seqId = "$routePrefix${idx + 1}"

            if (delivery.status == DeliveryStatus.ENTREGUE || delivery.status == DeliveryStatus.FALHOU) {
                delivery.copy(sequentialId = seqId)
            } else {
                val legSec = if (idx < legDurations.size) legDurations[idx] else 600L // default 10 min
                currentDurationSec += legSec

                val etaCal = cal.clone() as Calendar
                etaCal.add(Calendar.SECOND, currentDurationSec.toInt())
                val computedEta = timeFormat.format(etaCal.time)

                delivery.copy(
                    sequentialId = seqId,
                    etaHorario = computedEta
                )
            }
        }
    }

    private fun resequenceDeliveries(deliveries: List<Delivery>, routePrefix: String): List<Delivery> {
        return deliveries.mapIndexed { idx, d ->
            d.copy(sequentialId = "$routePrefix${idx + 1}")
        }
    }

    /**
     * Standard Google Encoded Polyline algorithm decoder.
     */
    fun decodePolyline(encoded: String): List<Pair<Double, Double>> {
        val poly = ArrayList<Pair<Double, Double>>()
        var index = 0
        val len = encoded.length
        var lat = 0
        var lng = 0

        while (index < len) {
            var b: Int
            var shift = 0
            var result = 0
            do {
                if (index >= len) break
                b = encoded[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20)
            val dlat = if ((result and 1) != 0) (result shr 1).inv() else (result shr 1)
            lat += dlat

            shift = 0
            result = 0
            do {
                if (index >= len) break
                b = encoded[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20)
            val dlng = if ((result and 1) != 0) (result shr 1).inv() else (result shr 1)
            lng += dlng

            val pLat = lat.toDouble() / 1E5
            val pLng = lng.toDouble() / 1E5
            poly.add(Pair(pLat, pLng))
        }
        return poly
    }

    fun haversineDistanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0 // Earth radius in meters
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }
}
