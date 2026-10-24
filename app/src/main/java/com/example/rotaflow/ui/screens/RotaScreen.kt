package com.example.rotaflow.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.rotaflow.data.model.Delivery
import com.example.rotaflow.data.model.DeliveryStatus
import com.example.rotaflow.ui.components.*
import com.example.rotaflow.ui.theme.*
import com.example.rotaflow.ui.viewmodel.RotaFlowViewModel

enum class RotaViewMode {
    LISTA,
    MAPA
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RotaScreen(
    viewModel: RotaFlowViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val activeRoute = uiState.activeRoute
    val allDeliveries = activeRoute?.deliveries ?: emptyList()

    var viewMode by remember { mutableStateOf(RotaViewMode.LISTA) }

    // Filter logic
    val filteredDeliveries = remember(allDeliveries, uiState.searchQuery, uiState.selectedFilter) {
        allDeliveries.filter { delivery ->
            val matchesSearch = uiState.searchQuery.isBlank() ||
                    delivery.nome.contains(uiState.searchQuery, ignoreCase = true) ||
                    delivery.endereco.contains(uiState.searchQuery, ignoreCase = true) ||
                    delivery.sequentialId.contains(uiState.searchQuery, ignoreCase = true) ||
                    delivery.notes.contains(uiState.searchQuery, ignoreCase = true)

            val matchesFilter = when (uiState.selectedFilter) {
                "PENDENTES" -> delivery.status == DeliveryStatus.PENDENTE
                "EM_ROTA" -> delivery.status == DeliveryStatus.EM_ROTA
                "ENTREGUES" -> delivery.status == DeliveryStatus.ENTREGUE
                "FALHAS" -> delivery.status == DeliveryStatus.FALHOU
                "FAVORITOS" -> delivery.favorito
                else -> true
            }

            matchesSearch && matchesFilter
        }
    }

    // Stats calculations
    val totalDeliveries = allDeliveries.size
    val deliveredCount = allDeliveries.count { it.status == DeliveryStatus.ENTREGUE }
    val failedCount = allDeliveries.count { it.status == DeliveryStatus.FALHOU }
    val completedCount = deliveredCount + failedCount
    val totalPackages = allDeliveries.sumOf { it.pacotes }
    val progressPct = if (totalDeliveries > 0) (completedCount * 100) / totalDeliveries else 0

    var showMenu by remember { mutableStateOf(false) }

    // Dialog handlers
    if (uiState.selectedDeliveryForFailReason != null) {
        NotDeliveredDialog(
            delivery = uiState.selectedDeliveryForFailReason!!,
            onConfirmFail = { reason ->
                viewModel.updateStatus(uiState.selectedDeliveryForFailReason!!.id, DeliveryStatus.FALHOU, reason)
                viewModel.closeFailReasonDialog()
            },
            onDismiss = { viewModel.closeFailReasonDialog() }
        )
    }

    if (uiState.showStopwatchDialog) {
        StopwatchSummaryDialog(
            deliveries = allDeliveries,
            onDismiss = { viewModel.closeStopwatchDialog() }
        )
    }

    if (uiState.showEconomicsDialog) {
        EconomicsDialog(
            route = activeRoute,
            profile = uiState.profile,
            onDismiss = { viewModel.closeEconomicsDialog() }
        )
    }

    if (uiState.selectedDeliveryForDetails != null) {
        val selectedDelivery = uiState.selectedDeliveryForDetails!!
        DeliveryDetailsDialog(
            delivery = selectedDelivery,
            profile = uiState.profile,
            onStatusChange = { newStatus ->
                viewModel.updateStatus(selectedDelivery.id, newStatus)
                viewModel.openDetailsDialog(selectedDelivery.copy(status = newStatus))
            },
            onFailClick = {
                viewModel.openFailReasonDialog(selectedDelivery)
            },
            onDismiss = { viewModel.closeDetailsDialog() }
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        // Top Bar: Route switcher chips + View Mode Toggle (Lista / Mapa)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Route switcher chips
            Row(
                modifier = Modifier
                    .weight(1f)
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                uiState.routes.forEach { route ->
                    val isActive = route.id == activeRoute?.id
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = if (isActive) BluePrimary else CardBackground,
                        border = if (isActive) null else ButtonDefaults.outlinedButtonBorder.copy(brush = androidx.compose.ui.graphics.SolidColor(LineBorder)),
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .clickable { viewModel.switchRoute(route.id) }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = route.name,
                                color = if (isActive) Color.White else TextPrimary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Surface(
                                shape = CircleShape,
                                color = if (isActive) BlueDark else CardBackgroundElevated
                            ) {
                                Text(
                                    text = "${route.deliveries.size}",
                                    color = if (isActive) Color.White else TextMuted,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                    }
                }

                IconButton(
                    onClick = { viewModel.createRoute() },
                    modifier = Modifier.size(36.dp).background(CardBackground, CircleShape)
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Nova rota", tint = BlueLight)
                }
            }

            Spacer(modifier = Modifier.width(10.dp))

            // Segmented Button: Lista | Mapa
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = CardBackground,
                border = ButtonDefaults.outlinedButtonBorder.copy(brush = androidx.compose.ui.graphics.SolidColor(LineBorder)),
                modifier = Modifier.testTag("view_mode_toggle")
            ) {
                Row(modifier = Modifier.padding(2.dp)) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (viewMode == RotaViewMode.LISTA) BluePrimary else Color.Transparent,
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { viewMode = RotaViewMode.LISTA }
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.FormatListBulleted,
                                contentDescription = "Ver Lista",
                                tint = if (viewMode == RotaViewMode.LISTA) Color.White else TextMuted,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Lista",
                                fontSize = 12.sp,
                                fontWeight = if (viewMode == RotaViewMode.LISTA) FontWeight.Bold else FontWeight.Normal,
                                color = if (viewMode == RotaViewMode.LISTA) Color.White else TextMuted
                            )
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = if (viewMode == RotaViewMode.MAPA) BluePrimary else Color.Transparent,
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { viewMode = RotaViewMode.MAPA }
                            .testTag("btn_mode_mapa")
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Default.Map,
                                contentDescription = "Ver Mapa",
                                tint = if (viewMode == RotaViewMode.MAPA) Color.White else TextMuted,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Mapa",
                                fontSize = 12.sp,
                                fontWeight = if (viewMode == RotaViewMode.MAPA) FontWeight.Bold else FontWeight.Normal,
                                color = if (viewMode == RotaViewMode.MAPA) Color.White else TextMuted
                            )
                        }
                    }
                }
            }
        }

        if (viewMode == RotaViewMode.MAPA) {
            // Full interactive Map Mode
            val metricsText = if (!uiState.optimizationMessage.isNullOrBlank()) {
                uiState.optimizationMessage
            } else if (uiState.totalRouteDistanceKm != null) {
                val km = String.format(java.util.Locale.US, "%.1f", uiState.totalRouteDistanceKm)
                val min = uiState.totalRouteDurationMin ?: 0
                "$km km • ~$min min • Rota Otimizada"
            } else null

            MapViewComponent(
                deliveries = allDeliveries,
                profile = uiState.profile,
                onStatusChange = { id, newStatus ->
                    viewModel.updateStatus(id, newStatus)
                },
                onFailClick = { delivery ->
                    viewModel.openFailReasonDialog(delivery)
                },
                onOpenDetails = { delivery ->
                    viewModel.openDetailsDialog(delivery)
                },
                isOptimizingRoute = uiState.isOptimizingRoute,
                polylinePoints = uiState.routePolylinePoints,
                routeMetricsText = metricsText,
                onOptimizeRoute = {
                    viewModel.optimizeRoute()
                },
                modifier = Modifier.weight(1f)
            )
        } else {
            // List Mode
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item {
                    // Day progress card
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = CardBackground),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "$completedCount de $totalDeliveries entregas",
                                    color = TextPrimary,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp
                                )
                                Text(
                                    text = "$progressPct%",
                                    color = BlueLight,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 15.sp
                                )
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            LinearProgressIndicator(
                                progress = { if (totalDeliveries > 0) completedCount.toFloat() / totalDeliveries.toFloat() else 0f },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(8.dp)
                                    .clip(RoundedCornerShape(99.dp)),
                                color = GreenSuccess,
                                trackColor = CardBackgroundElevated
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // Metrics chips
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "✅ $deliveredCount entregues",
                                    color = GreenSuccess,
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "❌ $failedCount falhas",
                                    color = if (failedCount > 0) RedDanger else TextMuted,
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "📦 $totalPackages pacotes",
                                    color = TextPrimary,
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "📍 ${(totalDeliveries * 3.8).toInt()} km",
                                    color = YellowWarn,
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Route Actions Toolbar (Tempo, Economia, Otimizar, Menu)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedButton(
                            onClick = { viewModel.openStopwatchDialog() },
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary),
                            modifier = Modifier.weight(1f).height(38.dp)
                        ) {
                            Icon(Icons.Default.Timer, contentDescription = null, modifier = Modifier.size(16.dp), tint = YellowWarn)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Tempo", fontSize = 12.5.sp)
                        }

                        OutlinedButton(
                            onClick = { viewModel.openEconomicsDialog() },
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary),
                            modifier = Modifier.weight(1f).height(38.dp)
                        ) {
                            Icon(Icons.Default.AttachMoney, contentDescription = null, modifier = Modifier.size(16.dp), tint = GreenSuccess)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Lucro", fontSize = 12.5.sp)
                        }

                        OutlinedButton(
                            onClick = { if (!uiState.isOptimizingRoute) viewModel.optimizeRoute() },
                            enabled = !uiState.isOptimizingRoute,
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary),
                            modifier = Modifier.weight(1f).height(38.dp).testTag("btn_optimize_route")
                        ) {
                            if (uiState.isOptimizingRoute) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(15.dp),
                                    strokeWidth = 2.dp,
                                    color = BlueLight
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Calculando...", fontSize = 11.5.sp)
                            } else {
                                Icon(Icons.Default.Route, contentDescription = null, modifier = Modifier.size(16.dp), tint = BlueLight)
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Otimizar", fontSize = 12.5.sp)
                            }
                        }

                        // More actions menu
                        Box {
                            IconButton(
                                onClick = { showMenu = !showMenu },
                                modifier = Modifier
                                    .size(38.dp)
                                    .background(CardBackground, RoundedCornerShape(10.dp))
                            ) {
                                Icon(Icons.Default.MoreVert, contentDescription = "Mais opções", tint = TextPrimary)
                            }

                            DropdownMenu(
                                expanded = showMenu,
                                onDismissRequest = { showMenu = false },
                                modifier = Modifier.background(CardBackground)
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Arquivar dia no histórico", color = TextPrimary) },
                                    leadingIcon = { Icon(Icons.Default.Archive, contentDescription = null, tint = GreenSuccess) },
                                    onClick = {
                                        viewModel.archiveActiveRoute()
                                        showMenu = false
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("Limpar rota atual", color = RedDanger) },
                                    leadingIcon = { Icon(Icons.Default.DeleteSweep, contentDescription = null, tint = RedDanger) },
                                    onClick = {
                                        viewModel.clearActiveRoute()
                                        showMenu = false
                                    }
                                )
                            }
                        }
                    }

                    if (!uiState.optimizationMessage.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            color = GreenSuccessBg,
                            shape = RoundedCornerShape(10.dp),
                            border = ButtonDefaults.outlinedButtonBorder.copy(brush = androidx.compose.ui.graphics.SolidColor(GreenSuccess)),
                            modifier = Modifier.fillMaxWidth().testTag("route_optimization_banner")
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = GreenSuccess, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = uiState.optimizationMessage!!,
                                        color = TextPrimary,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                                IconButton(
                                    onClick = { viewModel.clearOptimizationMessage() },
                                    modifier = Modifier.size(24.dp)
                                ) {
                                    Icon(Icons.Default.Close, contentDescription = "Fechar", tint = TextMuted, modifier = Modifier.size(14.dp))
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Search input
                    OutlinedTextField(
                        value = uiState.searchQuery,
                        onValueChange = { viewModel.setSearchQuery(it) },
                        placeholder = { Text("Buscar cliente, endereço ou ID...") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = TextMuted) },
                        trailingIcon = {
                            if (uiState.searchQuery.isNotBlank()) {
                                IconButton(onClick = { viewModel.setSearchQuery("") }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Limpar busca", tint = TextMuted)
                                }
                            }
                        },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = BluePrimary,
                            unfocusedBorderColor = LineBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().testTag("route_search_input")
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    // Filter chips
                    val filterOptions = listOf(
                        "TODOS" to "Todos",
                        "PENDENTES" to "Pendentes",
                        "EM_ROTA" to "Em rota",
                        "ENTREGUES" to "Entregues",
                        "FALHAS" to "Falhas",
                        "FAVORITOS" to "Favoritos"
                    )

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        filterOptions.forEach { (key, label) ->
                            val isSelected = uiState.selectedFilter == key
                            FilterChip(
                                selected = isSelected,
                                onClick = { viewModel.setSelectedFilter(key) },
                                label = { Text(label, fontSize = 12.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = BluePrimary,
                                    selectedLabelColor = Color.White,
                                    containerColor = CardBackground,
                                    labelColor = TextMuted
                                ),
                                border = FilterChipDefaults.filterChipBorder(
                                    enabled = true,
                                    selected = isSelected,
                                    borderColor = LineBorder,
                                    selectedBorderColor = BluePrimary
                                )
                            )
                        }
                    }
                }

                // Deliveries List
                if (filteredDeliveries.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 40.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(
                                    imageVector = Icons.Default.Inbox,
                                    contentDescription = null,
                                    tint = TextMuted,
                                    modifier = Modifier.size(48.dp)
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                Text(
                                    text = if (allDeliveries.isEmpty()) "Nenhuma entrega cadastrada nesta rota." else "Nenhuma entrega encontrada com esse filtro.",
                                    color = TextMuted,
                                    fontSize = 14.sp
                                )
                            }
                        }
                    }
                } else {
                    items(filteredDeliveries, key = { it.id }) { delivery ->
                        val risk = viewModel.checkRiskArea(delivery.endereco)
                        DeliveryCard(
                            delivery = delivery,
                            riskArea = risk,
                            profile = uiState.profile,
                            onStatusChange = { newStatus ->
                                viewModel.updateStatus(delivery.id, newStatus)
                            },
                            onFailClick = {
                                viewModel.openFailReasonDialog(delivery)
                            },
                            onToggleVoltarDepois = {
                                viewModel.toggleVoltarDepois(delivery.id)
                            },
                            onToggleFavorito = {
                                viewModel.toggleFavorito(delivery.id)
                            },
                            onDelete = {
                                viewModel.deleteDelivery(delivery.id)
                            },
                            onOpenDetails = {
                                viewModel.openDetailsDialog(delivery)
                            }
                        )
                    }
                }

                item {
                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }
    }
}
