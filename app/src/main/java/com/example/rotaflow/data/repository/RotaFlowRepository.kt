package com.example.rotaflow.data.repository

import com.example.rotaflow.data.model.*
import com.example.rotaflow.data.service.OptimizationResult
import com.example.rotaflow.data.service.RouteOptimizationService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.*

class RotaFlowRepository {

    private val _routes = MutableStateFlow<List<Route>>(emptyList())
    val routes: StateFlow<List<Route>> = _routes.asStateFlow()

    private val _activeRouteId = MutableStateFlow<String>("")
    val activeRouteId: StateFlow<String> = _activeRouteId.asStateFlow()

    private val _agenda = MutableStateFlow<List<AgendaItem>>(emptyList())
    val agenda: StateFlow<List<AgendaItem>> = _agenda.asStateFlow()

    private val _history = MutableStateFlow<List<HistoryDay>>(emptyList())
    val history: StateFlow<List<HistoryDay>> = _history.asStateFlow()

    private val _profile = MutableStateFlow(UserProfile())
    val profile: StateFlow<UserProfile> = _profile.asStateFlow()

    private val _riskAreas = MutableStateFlow<List<RiskArea>>(
        listOf(
            RiskArea("r1", "Vila Esperança (Atenção)", "esperança", "amarelo"),
            RiskArea("r2", "Morro Alto (Crítico)", "morro alto", "vermelho")
        )
    )
    val riskAreas: StateFlow<List<RiskArea>> = _riskAreas.asStateFlow()

    init {
        // Base coordinate in city center
        val baseLat = -8.7612
        val baseLng = -63.9038

        val rawInitialDeliveries = listOf(
            Delivery(
                id = "d1",
                sequentialId = "A1",
                nome = "Carlos Andrade",
                endereco = "Av. Sete de Setembro, 1420 - Centro",
                lat = baseLat + 0.0045,
                lng = baseLng - 0.0032,
                telefones = listOf(PhoneEntry("69992345678", "Principal")),
                pacotes = 2,
                valor = 18.0,
                janelaInicio = "09:00",
                janelaFim = "11:30",
                notes = "Interfone 202. Deixar na portaria se ausente.",
                status = DeliveryStatus.EM_ROTA,
                trackToken = "tok_d1_ca92",
                iniciadaEm = System.currentTimeMillis() - 15 * 60 * 1000
            ),
            Delivery(
                id = "d2",
                sequentialId = "A2",
                nome = "Mariana Silveira",
                endereco = "Rua Dom Pedro II, 850 - São Cristóvão",
                lat = baseLat + 0.0120,
                lng = baseLng + 0.0085,
                telefones = listOf(PhoneEntry("69984123456", "Celular"), PhoneEntry("6932214455", "Comercial")),
                pacotes = 1,
                valor = 15.0,
                janelaInicio = "10:30",
                janelaFim = "12:00",
                trackToken = "tok_d2_ms73",
                notes = "Casa com portão branco e campainha com câmera.",
                status = DeliveryStatus.PENDENTE
            ),
            Delivery(
                id = "d3",
                sequentialId = "A3",
                nome = "Farmácia Central",
                endereco = "Av. Calama, 2450 - Embratel",
                lat = baseLat - 0.0080,
                lng = baseLng + 0.0150,
                telefones = listOf(PhoneEntry("69991239876", "Balcão")),
                pacotes = 3,
                valor = 22.0,
                janelaInicio = "13:00",
                janelaFim = "15:00",
                trackToken = "tok_d3_fc41",
                notes = "Receber no balcão de compras com carimbo.",
                status = DeliveryStatus.ENTREGUE,
                iniciadaEm = System.currentTimeMillis() - 60 * 60 * 1000,
                concluidaEm = System.currentTimeMillis() - 35 * 60 * 1000,
                duracaoMs = 25 * 60 * 1000
            ),
            Delivery(
                id = "d4",
                sequentialId = "A4",
                nome = "Roberto Fontes",
                endereco = "Rua Rio Madeira, 310 - Flodoaldo",
                lat = baseLat - 0.0150,
                lng = baseLng - 0.0110,
                telefones = listOf(PhoneEntry("69998765432", "WhatsApp")),
                pacotes = 1,
                valor = 15.0,
                janelaInicio = "14:00",
                janelaFim = "16:00",
                trackToken = "tok_d4_rf88",
                notes = "Tocou interfone 3 vezes sem resposta.",
                status = DeliveryStatus.FALHOU,
                failReason = "Cliente ausente",
                voltarDepois = false,
                duracaoMs = 12 * 60 * 1000
            )
        )

        val computedInitial = recomputeETAs(rawInitialDeliveries)

        val route1 = Route(
            id = "route_1",
            name = "Rota 1",
            deliveries = computedInitial
        )

        _routes.value = listOf(route1)
        _activeRouteId.value = "route_1"

        _agenda.value = listOf(
            AgendaItem(
                id = "ag_1",
                nome = "Consultório Dr. Marcelo",
                endereco = "Rua Duque de Caxias, 540 - Centro",
                lat = baseLat + 0.0030,
                lng = baseLng + 0.0010,
                telefones = listOf(PhoneEntry("69993214433", "Secretária")),
                pacotes = 1,
                notes = "Entregar antes das 17h. 3º andar, sala 302.",
                favorito = true
            ),
            AgendaItem(
                id = "ag_2",
                nome = "Oficina Mecânica São José",
                endereco = "Av. Imigrantes, 4120 - Industrial",
                lat = baseLat + 0.0180,
                lng = baseLng + 0.0210,
                telefones = listOf(PhoneEntry("69981112233", "Responsável")),
                pacotes = 4,
                notes = "Peças pesadas. Estacionar nos fundos.",
                favorito = false
            )
        )
    }

    private fun recomputeETAs(deliveries: List<Delivery>): List<Delivery> {
        val cal = Calendar.getInstance()
        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
        var accumulatedMinutes = 0

        return deliveries.map { d ->
            if (d.status == DeliveryStatus.ENTREGUE || d.status == DeliveryStatus.FALHOU) {
                d
            } else {
                accumulatedMinutes += 18 // Average 18 mins per stop (traffic + service)
                val etaCal = cal.clone() as Calendar
                etaCal.add(Calendar.MINUTE, accumulatedMinutes)
                val etaStr = sdf.format(etaCal.time)
                d.copy(etaHorario = etaStr)
            }
        }
    }

    fun getActiveRoute(): Route? {
        val currentId = _activeRouteId.value
        return _routes.value.find { it.id == currentId } ?: _routes.value.firstOrNull()
    }

    fun addDelivery(
        nome: String,
        endereco: String,
        telefones: List<PhoneEntry>,
        pacotes: Int,
        valor: Double,
        janelaInicio: String,
        janelaFim: String,
        notes: String,
        saveToAgenda: Boolean
    ): Delivery {
        val active = getActiveRoute() ?: createRoute("Rota 1")
        val prefix = if (active.name.startsWith("Rota 2")) "B" else "A"
        val nextNum = active.deliveries.size + 1
        val seqId = "$prefix$nextNum"

        // Generate coordinate around centroid
        val baseLat = active.deliveries.firstOrNull { it.lat != null }?.lat ?: -8.7612
        val baseLng = active.deliveries.firstOrNull { it.lng != null }?.lng ?: -63.9038
        val randomOffsetLat = (Random().nextDouble() - 0.5) * 0.03
        val randomOffsetLng = (Random().nextDouble() - 0.5) * 0.03

        val token = "trk_${System.currentTimeMillis().toString(36)}_${Random().nextInt(1000)}"

        val newDelivery = Delivery(
            id = "d_${System.currentTimeMillis()}",
            sequentialId = seqId,
            nome = nome.trim(),
            endereco = endereco.trim(),
            lat = baseLat + randomOffsetLat,
            lng = baseLng + randomOffsetLng,
            telefones = telefones.filter { it.numero.isNotBlank() },
            pacotes = maxOf(1, pacotes),
            valor = valor,
            janelaInicio = janelaInicio,
            janelaFim = janelaFim,
            trackToken = token,
            notes = notes.trim(),
            status = DeliveryStatus.PENDENTE,
            savedToAgenda = saveToAgenda
        )

        val updatedDeliveries = recomputeETAs(active.deliveries + newDelivery)
        val updatedRoute = active.copy(deliveries = updatedDeliveries)
        _routes.value = _routes.value.map { if (it.id == updatedRoute.id) updatedRoute else it }

        if (saveToAgenda) {
            val agendaItem = AgendaItem(
                id = "ag_${System.currentTimeMillis()}",
                nome = nome.trim(),
                endereco = endereco.trim(),
                lat = newDelivery.lat,
                lng = newDelivery.lng,
                telefones = telefones,
                pacotes = pacotes,
                notes = notes.trim()
            )
            _agenda.value = _agenda.value + agendaItem
        }

        return newDelivery
    }

    fun checkDuplicateAddress(address: String): Delivery? {
        val active = getActiveRoute() ?: return null
        val clean = address.trim().lowercase()
        if (clean.length < 5) return null
        return active.deliveries.find { it.endereco.trim().lowercase() == clean }
    }

    fun applyStatusTransition(
        deliveryId: String,
        newStatus: DeliveryStatus,
        failReason: String? = null
    ) {
        val active = getActiveRoute() ?: return
        val now = System.currentTimeMillis()
        val rawUpdated = active.deliveries.map { delivery ->
            if (delivery.id != deliveryId) return@map delivery

            val iniciadaEm = when (newStatus) {
                DeliveryStatus.EM_ROTA -> delivery.iniciadaEm ?: now
                else -> delivery.iniciadaEm
            }

            val concluidaEm = when (newStatus) {
                DeliveryStatus.ENTREGUE, DeliveryStatus.FALHOU -> now
                else -> null
            }

            val duracaoMs = if (concluidaEm != null && iniciadaEm != null) {
                concluidaEm - iniciadaEm
            } else delivery.duracaoMs

            delivery.copy(
                status = newStatus,
                failReason = if (newStatus == DeliveryStatus.FALHOU) failReason else null,
                voltarDepois = if (newStatus == DeliveryStatus.ENTREGUE) false else delivery.voltarDepois,
                iniciadaEm = iniciadaEm,
                concluidaEm = concluidaEm,
                duracaoMs = duracaoMs
            )
        }

        val updatedDeliveries = recomputeETAs(rawUpdated)
        val updatedRoute = active.copy(deliveries = updatedDeliveries)
        _routes.value = _routes.value.map { if (it.id == updatedRoute.id) updatedRoute else it }
    }

    fun toggleVoltarDepois(deliveryId: String) {
        val active = getActiveRoute() ?: return
        val updatedDeliveries = active.deliveries.map {
            if (it.id == deliveryId) it.copy(voltarDepois = !it.voltarDepois) else it
        }
        val updatedRoute = active.copy(deliveries = updatedDeliveries)
        _routes.value = _routes.value.map { if (it.id == updatedRoute.id) updatedRoute else it }
    }

    fun toggleFavorito(deliveryId: String) {
        val active = getActiveRoute() ?: return
        val updatedDeliveries = active.deliveries.map {
            if (it.id == deliveryId) it.copy(favorito = !it.favorito) else it
        }
        val updatedRoute = active.copy(deliveries = updatedDeliveries)
        _routes.value = _routes.value.map { if (it.id == updatedRoute.id) updatedRoute else it }
    }

    fun deleteDelivery(deliveryId: String) {
        val active = getActiveRoute() ?: return
        val updatedDeliveries = recomputeETAs(active.deliveries.filter { it.id != deliveryId })
        val updatedRoute = active.copy(deliveries = updatedDeliveries)
        _routes.value = _routes.value.map { if (it.id == updatedRoute.id) updatedRoute else it }
    }

    fun createRoute(name: String? = null): Route {
        val nextIndex = _routes.value.size + 1
        val finalName = name ?: "Rota $nextIndex"
        val newRoute = Route(
            id = "route_${System.currentTimeMillis()}",
            name = finalName,
            deliveries = emptyList()
        )
        _routes.value = _routes.value + newRoute
        _activeRouteId.value = newRoute.id
        return newRoute
    }

    fun switchRoute(routeId: String) {
        if (_routes.value.any { it.id == routeId }) {
            _activeRouteId.value = routeId
        }
    }

    fun renameRoute(routeId: String, newName: String) {
        val clean = newName.trim()
        if (clean.isBlank()) return
        _routes.value = _routes.value.map {
            if (it.id == routeId) it.copy(name = clean) else it
        }
    }

    fun clearActiveRoute() {
        val active = getActiveRoute() ?: return
        val updatedRoute = active.copy(deliveries = emptyList())
        _routes.value = _routes.value.map { if (it.id == updatedRoute.id) updatedRoute else it }
    }

    suspend fun optimizeRouteWithDirections(
        startLat: Double? = null,
        startLng: Double? = null
    ): OptimizationResult {
        val active = getActiveRoute() ?: return OptimizationResult(
            success = false,
            reorderedDeliveries = emptyList(),
            totalDistanceMeters = 0,
            totalDurationSeconds = 0,
            message = "Nenhuma rota ativa selecionada",
            usedGoogleMapsApi = false
        )

        val prefix = if (active.name.startsWith("Rota 2")) "B" else "A"
        val customKey = _profile.value.googleMapsApiKey.trim()
        val keyToUse = if (customKey.isNotBlank()) customKey else RouteOptimizationService.DEFAULT_MAPS_KEY

        val result = RouteOptimizationService.optimizeRoute(
            deliveries = active.deliveries,
            startLat = startLat,
            startLng = startLng,
            apiKey = keyToUse,
            routePrefix = prefix
        )

        if (result.success && result.reorderedDeliveries.isNotEmpty()) {
            val updatedRoute = active.copy(deliveries = result.reorderedDeliveries)
            _routes.value = _routes.value.map { if (it.id == updatedRoute.id) updatedRoute else it }
        }

        return result
    }

    fun optimizeRoute() {
        val active = getActiveRoute() ?: return
        val prefix = if (active.name.startsWith("Rota 2")) "B" else "A"
        val inTransit = active.deliveries.filter { it.status == DeliveryStatus.EM_ROTA }
        val pending = active.deliveries.filter { it.status == DeliveryStatus.PENDENTE }
            .sortedWith(
                compareByDescending<Delivery> { it.favorito }
                    .thenBy { if (it.janelaInicio.isNotBlank()) it.janelaInicio else "99:99" }
                    .thenBy { (it.lat ?: 0.0) + (it.lng ?: 0.0) }
            )
        val completed = active.deliveries.filter { it.status == DeliveryStatus.ENTREGUE || it.status == DeliveryStatus.FALHOU }

        val reordered = (inTransit + pending + completed).mapIndexed { idx, d ->
            d.copy(sequentialId = "$prefix${idx + 1}")
        }
        val computedDeliveries = recomputeETAs(reordered)
        val updatedRoute = active.copy(deliveries = computedDeliveries)
        _routes.value = _routes.value.map { if (it.id == updatedRoute.id) updatedRoute else it }
    }

    fun archiveActiveRoute(): HistoryDay? {
        val active = getActiveRoute() ?: return null
        if (active.deliveries.isEmpty()) return null

        val sdf = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault())
        val dateStr = sdf.format(Date())
        val total = active.deliveries.size
        val entregue = active.deliveries.count { it.status == DeliveryStatus.ENTREGUE }
        val falhou = active.deliveries.count { it.status == DeliveryStatus.FALHOU }
        val pacotes = active.deliveries.sumOf { it.pacotes }
        val estKm = total * 3.8
        val fuelLiters = estKm / _profile.value.consumoKmL
        val fuelCost = fuelLiters * _profile.value.precoCombustivel
        val grossRevenue = active.deliveries.sumOf { if (it.valor > 0) it.valor else _profile.value.valorPadraoEntrega }
        val net = grossRevenue - fuelCost

        val historyEntry = HistoryDay(
            id = "hist_${System.currentTimeMillis()}",
            date = dateStr,
            savedAt = System.currentTimeMillis(),
            deliveries = active.deliveries,
            statsTotal = total,
            statsEntregue = entregue,
            statsFalhou = falhou,
            totalPacotes = pacotes,
            totalKm = estKm,
            fuelCost = fuelCost,
            revenue = grossRevenue,
            netProfit = net
        )

        _history.value = listOf(historyEntry) + _history.value
        clearActiveRoute()
        return historyEntry
    }

    fun addAgendaItem(item: AgendaItem) {
        _agenda.value = _agenda.value + item
    }

    fun removeAgendaItem(id: String) {
        _agenda.value = _agenda.value.filter { it.id != id }
    }

    fun sendAgendaItemToRoute(id: String) {
        val item = _agenda.value.find { it.id == id } ?: return
        addDelivery(
            nome = item.nome,
            endereco = item.endereco,
            telefones = item.telefones,
            pacotes = item.pacotes,
            valor = _profile.value.valorPadraoEntrega,
            janelaInicio = "",
            janelaFim = "",
            notes = item.notes,
            saveToAgenda = false
        )
    }

    fun toggleAgendaFavorito(id: String) {
        _agenda.value = _agenda.value.map {
            if (it.id == id) it.copy(favorito = !it.favorito) else it
        }
    }

    fun updateProfile(newProfile: UserProfile) {
        _profile.value = newProfile
    }

    fun checkRiskArea(address: String): RiskArea? {
        val lower = address.lowercase()
        return _riskAreas.value.find { lower.contains(it.matchPattern.lowercase()) }
    }
}
