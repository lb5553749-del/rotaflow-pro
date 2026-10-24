package com.example.rotaflow.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import com.example.rotaflow.ui.theme.*
import com.example.rotaflow.ui.viewmodel.RotaFlowViewModel

@Composable
fun AgendaScreen(
    viewModel: RotaFlowViewModel,
    onNavigateToRota: () -> Unit,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val agendaList = uiState.agenda

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
                text = "Agenda de Clientes",
                color = TextPrimary,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Clientes e endereços frequentes para envio rápido à rota",
                color = TextMuted,
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 2.dp, bottom = 14.dp)
            )

            // Search agenda
            OutlinedTextField(
                value = uiState.agendaSearchQuery,
                onValueChange = { viewModel.setAgendaSearchQuery(it) },
                placeholder = { Text("Buscar cliente ou endereço na agenda...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = TextMuted) },
                trailingIcon = {
                    if (uiState.agendaSearchQuery.isNotBlank()) {
                        IconButton(onClick = { viewModel.setAgendaSearchQuery("") }) {
                            Icon(Icons.Default.Clear, contentDescription = "Limpar", tint = TextMuted)
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
                modifier = Modifier.fillMaxWidth().testTag("agenda_search_input")
            )

            Spacer(modifier = Modifier.height(8.dp))
        }

        if (agendaList.isEmpty()) {
            item {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.Contacts,
                            contentDescription = null,
                            tint = TextMuted,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = if (uiState.agendaSearchQuery.isBlank()) "Nenhum cliente salvo na agenda ainda." else "Nenhum resultado para a busca.",
                            color = TextMuted,
                            fontSize = 14.sp
                        )
                        Text(
                            text = "Ao cadastrar uma nova entrega, marque 'Salvar também na agenda'.",
                            color = TextMuted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            }
        } else {
            items(agendaList, key = { it.id }) { item ->
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = CardBackground),
                    modifier = Modifier.fillMaxWidth().testTag("agenda_item_${item.id}")
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = item.nome,
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                            IconButton(
                                onClick = { viewModel.toggleAgendaFavorito(item.id) },
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(
                                    imageVector = if (item.favorito) Icons.Filled.Star else Icons.Outlined.StarBorder,
                                    contentDescription = "Favorito",
                                    tint = if (item.favorito) YellowWarn else TextMuted
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        Row(verticalAlignment = Alignment.Top) {
                            Icon(
                                Icons.Default.Place,
                                contentDescription = null,
                                tint = YellowWarn,
                                modifier = Modifier.size(16.dp).padding(top = 2.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = item.endereco,
                                color = TextPrimary,
                                fontSize = 13.5.sp
                            )
                        }

                        if (item.telefones.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Phone,
                                    contentDescription = null,
                                    tint = BlueLight,
                                    modifier = Modifier.size(15.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = item.telefones.joinToString(" • ") { "${it.label}: ${it.numero}" },
                                    color = TextMuted,
                                    fontSize = 12.5.sp
                                )
                            }
                        }

                        if (item.notes.isNotBlank()) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "Obs: ${item.notes}",
                                color = TextMuted,
                                fontSize = 12.sp
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))
                        HorizontalDivider(color = LineBorder, thickness = 0.8.dp)
                        Spacer(modifier = Modifier.height(10.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            TextButton(
                                onClick = { viewModel.removeAgendaItem(item.id) },
                                colors = ButtonDefaults.textButtonColors(contentColor = RedDanger)
                            ) {
                                Icon(Icons.Default.DeleteOutline, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Excluir", fontSize = 13.sp)
                            }

                            Button(
                                onClick = {
                                    viewModel.sendAgendaItemToRoute(item.id)
                                    onNavigateToRota()
                                },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                                modifier = Modifier.height(38.dp).testTag("send_to_route_btn_${item.id}")
                            ) {
                                Icon(Icons.Default.AddLocation, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Enviar para rota", fontSize = 13.sp, fontWeight = FontWeight.Bold)
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
