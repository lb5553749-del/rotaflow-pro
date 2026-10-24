package com.example.rotaflow.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.rotaflow.data.model.*
import com.example.rotaflow.data.repository.RotaFlowRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class RotaUiState(
    val activeRoute: Route? = null,
    val routes: List<Route> = emptyList(),
    val searchQuery: String = "",
    val selectedFilter: String = "TODOS", // TODOS, PENDENTES, EM_ROTA, ENTREGUES, FALHAS, FAVORITOS
    val agenda: List<AgendaItem> = emptyList(),
    val agendaSearchQuery: String = "",
    val history: List<HistoryDay> = emptyList(),
    val profile: UserProfile = UserProfile(),
    val selectedDeliveryForFailReason: Delivery? = null,
    val selectedDeliveryForDetails: Delivery? = null,
    val showStopwatchDialog: Boolean = false,
    val showRenameRouteDialog: Boolean = false,
    val routeToRename: Route? = null,
    val showEconomicsDialog: Boolean = false,
    val isOptimizingRoute: Boolean = false,
    val optimizationMessage: String? = null,
    val routePolylinePoints: List<Pair<Double, Double>> = emptyList(),
    val totalRouteDistanceKm: Double? = null,
    val totalRouteDurationMin: Long? = null
)

class RotaFlowViewModel(
    private val repository: RotaFlowRepository = RotaFlowRepository()
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    private val _selectedFilter = MutableStateFlow("TODOS")
    private val _agendaSearchQuery = MutableStateFlow("")
    private val _selectedDeliveryForFailReason = MutableStateFlow<Delivery?>(null)
    private val _selectedDeliveryForDetails = MutableStateFlow<Delivery?>(null)
    private val _showStopwatchDialog = MutableStateFlow(false)
    private val _showRenameRouteDialog = MutableStateFlow(false)
    private val _routeToRename = MutableStateFlow<Route?>(null)
    private val _showEconomicsDialog = MutableStateFlow(false)

    private val _uiState = MutableStateFlow(RotaUiState())
    val uiState: StateFlow<RotaUiState> = _uiState.asStateFlow()

    init {
        // Collect repository routes and active route ID
        viewModelScope.launch {
            combine(
                repository.routes,
                repository.activeRouteId,
                _searchQuery,
                _selectedFilter
            ) { routes, activeId, query, filter ->
                val activeRoute = routes.find { it.id == activeId } ?: routes.firstOrNull()
                _uiState.update { current ->
                    current.copy(
                        activeRoute = activeRoute,
                        routes = routes,
                        searchQuery = query,
                        selectedFilter = filter
                    )
                }
            }.collect()
        }

        // Collect agenda and agenda search query
        viewModelScope.launch {
            combine(
                repository.agenda,
                _agendaSearchQuery
            ) { agendaList, agQuery ->
                val filtered = if (agQuery.isBlank()) agendaList else agendaList.filter {
                    it.nome.contains(agQuery, ignoreCase = true) || it.endereco.contains(agQuery, ignoreCase = true)
                }
                _uiState.update { current ->
                    current.copy(
                        agenda = filtered,
                        agendaSearchQuery = agQuery
                    )
                }
            }.collect()
        }

        // Collect history
        viewModelScope.launch {
            repository.history.collect { hist ->
                _uiState.update { it.copy(history = hist) }
            }
        }

        // Collect profile
        viewModelScope.launch {
            repository.profile.collect { prof ->
                _uiState.update { it.copy(profile = prof) }
            }
        }

        // Collect fail reason dialog delivery
        viewModelScope.launch {
            _selectedDeliveryForFailReason.collect { del ->
                _uiState.update { it.copy(selectedDeliveryForFailReason = del) }
            }
        }

        // Collect selected delivery for details dialog
        viewModelScope.launch {
            _selectedDeliveryForDetails.collect { del ->
                _uiState.update { it.copy(selectedDeliveryForDetails = del) }
            }
        }

        // Collect stopwatch dialog visibility
        viewModelScope.launch {
            _showStopwatchDialog.collect { show ->
                _uiState.update { it.copy(showStopwatchDialog = show) }
            }
        }

        // Collect rename route dialog visibility
        viewModelScope.launch {
            combine(_showRenameRouteDialog, _routeToRename) { show, route ->
                show to route
            }.collect { (show, route) ->
                _uiState.update { it.copy(showRenameRouteDialog = show, routeToRename = route) }
            }
        }

        // Collect economics dialog visibility
        viewModelScope.launch {
            _showEconomicsDialog.collect { show ->
                _uiState.update { it.copy(showEconomicsDialog = show) }
            }
        }
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun setSelectedFilter(filter: String) {
        _selectedFilter.value = filter
    }

    fun setAgendaSearchQuery(query: String) {
        _agendaSearchQuery.value = query
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
        return repository.addDelivery(
            nome = nome,
            endereco = endereco,
            telefones = telefones,
            pacotes = pacotes,
            valor = valor,
            janelaInicio = janelaInicio,
            janelaFim = janelaFim,
            notes = notes,
            saveToAgenda = saveToAgenda
        )
    }

    fun checkDuplicateAddress(address: String): Delivery? {
        return repository.checkDuplicateAddress(address)
    }

    fun checkRiskArea(address: String): RiskArea? {
        return repository.checkRiskArea(address)
    }

    fun updateStatus(deliveryId: String, newStatus: DeliveryStatus, failReason: String? = null) {
        repository.applyStatusTransition(deliveryId, newStatus, failReason)
    }

    fun toggleVoltarDepois(deliveryId: String) {
        repository.toggleVoltarDepois(deliveryId)
    }

    fun toggleFavorito(deliveryId: String) {
        repository.toggleFavorito(deliveryId)
    }

    fun deleteDelivery(deliveryId: String) {
        repository.deleteDelivery(deliveryId)
    }

    fun createRoute(name: String? = null) {
        repository.createRoute(name)
    }

    fun switchRoute(routeId: String) {
        repository.switchRoute(routeId)
    }

    fun renameRoute(routeId: String, newName: String) {
        repository.renameRoute(routeId, newName)
        _showRenameRouteDialog.value = false
        _routeToRename.value = null
    }

    fun clearActiveRoute() {
        repository.clearActiveRoute()
    }

    fun optimizeRoute(startLat: Double? = null, startLng: Double? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isOptimizingRoute = true, optimizationMessage = null) }
            val result = repository.optimizeRouteWithDirections(startLat, startLng)
            _uiState.update { current ->
                current.copy(
                    isOptimizingRoute = false,
                    optimizationMessage = result.message,
                    routePolylinePoints = result.overviewPolylinePoints,
                    totalRouteDistanceKm = if (result.totalDistanceMeters > 0) result.totalDistanceMeters / 1000.0 else null,
                    totalRouteDurationMin = if (result.totalDurationSeconds > 0) result.totalDurationSeconds / 60 else null
                )
            }
        }
    }

    fun clearOptimizationMessage() {
        _uiState.update { it.copy(optimizationMessage = null) }
    }

    fun archiveActiveRoute() {
        repository.archiveActiveRoute()
    }

    fun sendAgendaItemToRoute(id: String) {
        repository.sendAgendaItemToRoute(id)
    }

    fun removeAgendaItem(id: String) {
        repository.removeAgendaItem(id)
    }

    fun toggleAgendaFavorito(id: String) {
        repository.toggleAgendaFavorito(id)
    }

    fun updateProfile(profile: UserProfile) {
        repository.updateProfile(profile)
    }

    fun openFailReasonDialog(delivery: Delivery) {
        _selectedDeliveryForFailReason.value = delivery
    }

    fun closeFailReasonDialog() {
        _selectedDeliveryForFailReason.value = null
    }

    fun openDetailsDialog(delivery: Delivery) {
        _selectedDeliveryForDetails.value = delivery
    }

    fun closeDetailsDialog() {
        _selectedDeliveryForDetails.value = null
    }

    fun openStopwatchDialog() {
        _showStopwatchDialog.value = true
    }

    fun closeStopwatchDialog() {
        _showStopwatchDialog.value = false
    }

    fun openRenameRouteDialog(route: Route) {
        _routeToRename.value = route
        _showRenameRouteDialog.value = true
    }

    fun closeRenameRouteDialog() {
        _showRenameRouteDialog.value = false
        _routeToRename.value = null
    }

    fun openEconomicsDialog() {
        _showEconomicsDialog.value = true
    }

    fun closeEconomicsDialog() {
        _showEconomicsDialog.value = false
    }
}
