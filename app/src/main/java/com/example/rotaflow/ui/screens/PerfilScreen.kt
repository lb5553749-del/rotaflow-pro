package com.example.rotaflow.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.rotaflow.data.model.UserProfile
import com.example.rotaflow.ui.theme.*
import com.example.rotaflow.ui.viewmodel.RotaFlowViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PerfilScreen(
    viewModel: RotaFlowViewModel,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val initialProfile = uiState.profile

    var motorista by remember(initialProfile) { mutableStateOf(initialProfile.motorista) }
    var empresa by remember(initialProfile) { mutableStateOf(initialProfile.empresa) }
    var mensagemPadrao by remember(initialProfile) { mutableStateOf(initialProfile.mensagemPadrao) }
    var consumoKmL by remember(initialProfile) { mutableStateOf(initialProfile.consumoKmL.toString()) }
    var precoCombustivel by remember(initialProfile) { mutableStateOf(initialProfile.precoCombustivel.toString()) }
    var valorPadraoEntrega by remember(initialProfile) { mutableStateOf(initialProfile.valorPadraoEntrega.toString()) }
    var veiculo by remember(initialProfile) { mutableStateOf(initialProfile.veiculo) }

    var showSavedMessage by remember { mutableStateOf(false) }

    val vehicles = listOf("Moto", "Carro", "Van")

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(horizontal = 16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Perfil & Configurações",
            color = TextPrimary,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Dados do motorista, mensagens automáticas e custo de combustível",
            color = TextMuted,
            fontSize = 13.sp,
            modifier = Modifier.padding(top = 2.dp, bottom = 14.dp)
        )

        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CardBackground),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {

                Text("Dados do Motorista", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = TextPrimary)

                OutlinedTextField(
                    value = motorista,
                    onValueChange = { motorista = it },
                    label = { Text("Nome do motorista") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = BluePrimary,
                        unfocusedBorderColor = LineBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = empresa,
                    onValueChange = { empresa = it },
                    label = { Text("Empresa ou transportadora") },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = BluePrimary,
                        unfocusedBorderColor = LineBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                HorizontalDivider(color = LineBorder, thickness = 0.8.dp)

                Text("Mensagem Padrão (WhatsApp)", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                Text(
                    "Variáveis disponíveis: {cliente} (nome do cliente), {horario} (previsão de entrega) e {link} (link de rastreio em tempo real).",
                    fontSize = 12.sp,
                    color = BlueLight
                )

                OutlinedTextField(
                    value = mensagemPadrao,
                    onValueChange = { mensagemPadrao = it },
                    label = { Text("Modelo de aviso de rota") },
                    maxLines = 4,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = BluePrimary,
                        unfocusedBorderColor = LineBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                HorizontalDivider(color = LineBorder, thickness = 0.8.dp)

                Text("Veículo & Custos Operacionais", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = TextPrimary)

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    vehicles.forEach { v ->
                        val isSelected = veiculo == v
                        FilterChip(
                            selected = isSelected,
                            onClick = { veiculo = v },
                            label = { Text(v, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = BluePrimary,
                                selectedLabelColor = Color.White,
                                containerColor = CardBackgroundElevated,
                                labelColor = TextMuted
                            )
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = consumoKmL,
                        onValueChange = { consumoKmL = it },
                        label = { Text("Consumo (km/L)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = BluePrimary,
                            unfocusedBorderColor = LineBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.weight(1f)
                    )

                    OutlinedTextField(
                        value = precoCombustivel,
                        onValueChange = { precoCombustivel = it },
                        label = { Text("Combustível (R$/L)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = BluePrimary,
                            unfocusedBorderColor = LineBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.weight(1f)
                    )
                }

                OutlinedTextField(
                    value = valorPadraoEntrega,
                    onValueChange = { valorPadraoEntrega = it },
                    label = { Text("Valor padrão por entrega (R$)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = BluePrimary,
                        unfocusedBorderColor = LineBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                if (showSavedMessage) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = GreenSuccessBg,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Configurações salvas com sucesso!",
                            color = GreenSuccess,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                }

                Button(
                    onClick = {
                        val newProfile = UserProfile(
                            motorista = motorista,
                            empresa = empresa,
                            mensagemPadrao = mensagemPadrao,
                            consumoKmL = consumoKmL.toDoubleOrNull() ?: 12.0,
                            precoCombustivel = precoCombustivel.toDoubleOrNull() ?: 6.29,
                            valorPadraoEntrega = valorPadraoEntrega.toDoubleOrNull() ?: 15.0,
                            veiculo = veiculo
                        )
                        viewModel.updateProfile(newProfile)
                        showSavedMessage = true
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp).testTag("save_profile_btn"),
                    colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Save, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Salvar alterações", fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}
