package com.example.rotaflow

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.rotaflow.ui.screens.*
import com.example.rotaflow.ui.theme.*
import com.example.rotaflow.ui.viewmodel.RotaFlowViewModel

enum class ScreenTab(val title: String) {
    ROTA("Rota"),
    NOVA("Nova"),
    AGENDA("Agenda"),
    HISTORICO("Histórico"),
    PERFIL("Perfil")
}

class MainActivity : ComponentActivity() {

    private val viewModel: RotaFlowViewModel by viewModels()

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            RotaFlowTheme {
                val uiState by viewModel.uiState.collectAsState()
                var currentTab by remember { mutableStateOf(ScreenTab.ROTA) }

                BackHandler(enabled = currentTab != ScreenTab.ROTA) {
                    currentTab = ScreenTab.ROTA
                }

                val activeRouteDeliveriesCount = uiState.activeRoute?.deliveries?.size ?: 0
                val agendaCount = uiState.agenda.size

                Scaffold(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(BackgroundDark),
                    topBar = {
                        TopAppBar(
                            title = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = BluePrimary,
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                imageVector = Icons.Default.LocalShipping,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(20.dp)
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(
                                                text = "RotaFlow",
                                                color = TextPrimary,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 18.sp
                                            )
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Surface(
                                                shape = RoundedCornerShape(4.dp),
                                                color = Color(0xFF1E3A8A)
                                            ) {
                                                Text(
                                                    text = "PRO",
                                                    color = BlueLight,
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.ExtraBold,
                                                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                                                )
                                            }
                                        }
                                        Text(
                                            text = uiState.activeRoute?.name ?: "Roteiro do dia",
                                            color = TextMuted,
                                            fontSize = 12.sp
                                        )
                                    }
                                }
                            },
                            actions = {
                                // Sync indicator
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = CardBackgroundElevated,
                                    modifier = Modifier.padding(end = 12.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(8.dp)
                                                .background(GreenSuccess, CircleShape)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = "Local ativo",
                                            color = TextMuted,
                                            fontSize = 11.sp
                                        )
                                    }
                                }
                            },
                            colors = TopAppBarDefaults.topAppBarColors(
                                containerColor = BackgroundDark,
                                titleContentColor = TextPrimary
                            )
                        )
                    },
                    bottomBar = {
                        NavigationBar(
                            containerColor = CardBackground,
                            contentColor = TextMuted,
                            modifier = Modifier
                                .navigationBarsPadding()
                                .testTag("bottom_nav_bar")
                        ) {
                            // Nova Entrega
                            NavigationBarItem(
                                selected = currentTab == ScreenTab.NOVA,
                                onClick = { currentTab = ScreenTab.NOVA },
                                icon = {
                                    Icon(
                                        imageVector = if (currentTab == ScreenTab.NOVA) Icons.Filled.AddLocationAlt else Icons.Outlined.AddLocationAlt,
                                        contentDescription = "Nova Entrega"
                                    )
                                },
                                label = { Text("Nova", fontSize = 11.sp) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = BluePrimary,
                                    selectedTextColor = BluePrimary,
                                    indicatorColor = CardBackgroundElevated,
                                    unselectedIconColor = TextMuted,
                                    unselectedTextColor = TextMuted
                                ),
                                modifier = Modifier.testTag("nav_nova")
                            )

                            // Rota
                            NavigationBarItem(
                                selected = currentTab == ScreenTab.ROTA,
                                onClick = { currentTab = ScreenTab.ROTA },
                                icon = {
                                    BadgedBox(
                                        badge = {
                                            if (activeRouteDeliveriesCount > 0) {
                                                Badge(containerColor = BluePrimary, contentColor = Color.White) {
                                                    Text("$activeRouteDeliveriesCount")
                                                }
                                            }
                                        }
                                    ) {
                                        Icon(
                                            imageVector = if (currentTab == ScreenTab.ROTA) Icons.Filled.Route else Icons.Outlined.Route,
                                            contentDescription = "Rota"
                                        )
                                    }
                                },
                                label = { Text("Rota", fontSize = 11.sp) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = BluePrimary,
                                    selectedTextColor = BluePrimary,
                                    indicatorColor = CardBackgroundElevated,
                                    unselectedIconColor = TextMuted,
                                    unselectedTextColor = TextMuted
                                ),
                                modifier = Modifier.testTag("nav_rota")
                            )

                            // Agenda
                            NavigationBarItem(
                                selected = currentTab == ScreenTab.AGENDA,
                                onClick = { currentTab = ScreenTab.AGENDA },
                                icon = {
                                    BadgedBox(
                                        badge = {
                                            if (agendaCount > 0) {
                                                Badge(containerColor = CardBackgroundElevated, contentColor = TextMuted) {
                                                    Text("$agendaCount")
                                                }
                                            }
                                        }
                                    ) {
                                        Icon(
                                            imageVector = if (currentTab == ScreenTab.AGENDA) Icons.Filled.Contacts else Icons.Outlined.Contacts,
                                            contentDescription = "Agenda"
                                        )
                                    }
                                },
                                label = { Text("Agenda", fontSize = 11.sp) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = BluePrimary,
                                    selectedTextColor = BluePrimary,
                                    indicatorColor = CardBackgroundElevated,
                                    unselectedIconColor = TextMuted,
                                    unselectedTextColor = TextMuted
                                ),
                                modifier = Modifier.testTag("nav_agenda")
                            )

                            // Histórico
                            NavigationBarItem(
                                selected = currentTab == ScreenTab.HISTORICO,
                                onClick = { currentTab = ScreenTab.HISTORICO },
                                icon = {
                                    Icon(
                                        imageVector = if (currentTab == ScreenTab.HISTORICO) Icons.Filled.History else Icons.Outlined.History,
                                        contentDescription = "Histórico"
                                    )
                                },
                                label = { Text("Histórico", fontSize = 11.sp) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = BluePrimary,
                                    selectedTextColor = BluePrimary,
                                    indicatorColor = CardBackgroundElevated,
                                    unselectedIconColor = TextMuted,
                                    unselectedTextColor = TextMuted
                                ),
                                modifier = Modifier.testTag("nav_historico")
                            )

                            // Perfil
                            NavigationBarItem(
                                selected = currentTab == ScreenTab.PERFIL,
                                onClick = { currentTab = ScreenTab.PERFIL },
                                icon = {
                                    Icon(
                                        imageVector = if (currentTab == ScreenTab.PERFIL) Icons.Filled.Person else Icons.Outlined.Person,
                                        contentDescription = "Perfil"
                                    )
                                },
                                label = { Text("Perfil", fontSize = 11.sp) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = BluePrimary,
                                    selectedTextColor = BluePrimary,
                                    indicatorColor = CardBackgroundElevated,
                                    unselectedIconColor = TextMuted,
                                    unselectedTextColor = TextMuted
                                ),
                                modifier = Modifier.testTag("nav_perfil")
                            )
                        }
                    }
                ) { innerPadding ->
                    Box(modifier = Modifier.padding(innerPadding)) {
                        when (currentTab) {
                            ScreenTab.ROTA -> RotaScreen(viewModel = viewModel)
                            ScreenTab.NOVA -> NovaEntregaScreen(
                                viewModel = viewModel,
                                onDeliveryAdded = { currentTab = ScreenTab.ROTA }
                            )
                            ScreenTab.AGENDA -> AgendaScreen(
                                viewModel = viewModel,
                                onNavigateToRota = { currentTab = ScreenTab.ROTA }
                            )
                            ScreenTab.HISTORICO -> HistoricoScreen(viewModel = viewModel)
                            ScreenTab.PERFIL -> PerfilScreen(viewModel = viewModel)
                        }
                    }
                }
            }
        }
    }
}
