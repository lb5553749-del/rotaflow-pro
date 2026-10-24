package com.example.rotaflow.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
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
import com.example.rotaflow.data.model.HistoryDay
import com.example.rotaflow.ui.theme.*
import com.example.rotaflow.ui.viewmodel.RotaFlowViewModel

@Composable
fun HistoricoScreen(
    viewModel: RotaFlowViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val historyList = uiState.history

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "Histórico de Rotas",
                color = TextPrimary,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Rotas arquivadas dos dias anteriores com estatísticas e rendimentos",
                color = TextMuted,
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 2.dp, bottom = 14.dp)
            )
        }

        if (historyList.isEmpty()) {
            item {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.History,
                            contentDescription = null,
                            tint = TextMuted,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = "Nenhum dia arquivado ainda.",
                            color = TextMuted,
                            fontSize = 14.sp
                        )
                        Text(
                            text = "Na aba Rota, toque no menu de 3 pontos e escolha 'Arquivar dia'.",
                            color = TextMuted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            }
        } else {
            items(historyList, key = { it.id }) { historyDay ->
                var expanded by remember { mutableStateOf(false) }

                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = CardBackground),
                    modifier = Modifier.fillMaxWidth().testTag("history_card_${historyDay.id}")
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = "Dia ${historyDay.date}",
                                    color = TextPrimary,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                                Text(
                                    text = "${historyDay.statsTotal} paradas • ${historyDay.totalPacotes} pacotes • ${(historyDay.totalKm).toInt()} km",
                                    color = TextMuted,
                                    fontSize = 12.5.sp
                                )
                            }

                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = GreenSuccessBg
                            ) {
                                Text(
                                    text = "+ R$ %.2f".format(historyDay.netProfit),
                                    color = GreenSuccess,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Success vs fail bar
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                color = CardBackgroundElevated
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("✅ Entregues:", fontSize = 12.sp, color = TextMuted)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("${historyDay.statsEntregue}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = GreenSuccess)
                                }
                            }

                            Surface(
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp),
                                color = CardBackgroundElevated
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("❌ Falhas:", fontSize = 12.sp, color = TextMuted)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("${historyDay.statsFalhou}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (historyDay.statsFalhou > 0) RedDanger else TextMuted)
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        // Toggle expand details
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { expanded = !expanded }
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = if (expanded) "Ocultar paradas" else "Ver ${historyDay.deliveries.size} paradas",
                                color = BlueLight,
                                fontSize = 12.5.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Icon(
                                imageVector = if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                                contentDescription = null,
                                tint = BlueLight
                            )
                        }

                        AnimatedVisibility(visible = expanded) {
                            Column(
                                modifier = Modifier.padding(top = 8.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                historyDay.deliveries.forEach { del ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = CardBackgroundElevated,
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text("${del.sequentialId} • ${del.nome}", color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                                Text(del.endereco, color = TextMuted, fontSize = 11.sp, maxLines = 1)
                                            }
                                            Text(
                                                text = del.status.label,
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (del.status.label == "Entregue") GreenSuccess else RedDanger
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}
