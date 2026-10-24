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
import com.example.rotaflow.data.model.PhoneEntry
import com.example.rotaflow.ui.theme.*
import com.example.rotaflow.ui.viewmodel.RotaFlowViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NovaEntregaScreen(
    viewModel: RotaFlowViewModel,
    onDeliveryAdded: () -> Unit,
    modifier: Modifier = Modifier
) {
    var nome by remember { mutableStateOf("") }
    var endereco by remember { mutableStateOf("") }
    var telefones by remember { mutableStateOf<List<PhoneEntry>>(listOf(PhoneEntry("", "Principal"))) }
    var currentPhoneInput by remember { mutableStateOf("") }
    var currentPhoneLabel by remember { mutableStateOf("") }
    var pacotes by remember { mutableStateOf("1") }
    var valor by remember { mutableStateOf("15.00") }
    var janelaInicio by remember { mutableStateOf("") }
    var janelaFim by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var saveToAgenda by remember { mutableStateOf(false) }

    val duplicateWarning = remember(endereco) {
        viewModel.checkDuplicateAddress(endereco)
    }

    val riskAreaWarning = remember(endereco) {
        viewModel.checkRiskArea(endereco)
    }

    var showSuccessSnackbar by remember { mutableStateOf(false) }

    val scrollState = rememberScrollState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(horizontal = 16.dp)
            .verticalScroll(scrollState)
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Nova Entrega",
            color = TextPrimary,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "Preencha os dados do cliente e endereço para adicionar à rota",
            color = TextMuted,
            fontSize = 13.sp,
            modifier = Modifier.padding(top = 2.dp, bottom = 16.dp)
        )

        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CardBackground),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {

                // Client name
                OutlinedTextField(
                    value = nome,
                    onValueChange = { nome = it },
                    label = { Text("Nome do cliente") },
                    placeholder = { Text("Ex: Carlos Andrade") },
                    leadingIcon = { Icon(Icons.Default.Person, contentDescription = null, tint = BlueLight) },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = BluePrimary,
                        unfocusedBorderColor = LineBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth().testTag("input_customer_name")
                )

                // Full address
                Column {
                    OutlinedTextField(
                        value = endereco,
                        onValueChange = { endereco = it },
                        label = { Text("Endereço completo") },
                        placeholder = { Text("Rua, número, bairro, cidade") },
                        leadingIcon = { Icon(Icons.Default.Place, contentDescription = null, tint = YellowWarn) },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = BluePrimary,
                            unfocusedBorderColor = LineBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.fillMaxWidth().testTag("input_address")
                    )

                    // Duplicate warning
                    if (duplicateWarning != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = YellowWarnBg,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Warning, contentDescription = null, tint = YellowWarn, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Endereço já na rota (ID: ${duplicateWarning.sequentialId} - ${duplicateWarning.nome})",
                                    fontSize = 12.sp,
                                    color = YellowWarn
                                )
                            }
                        }
                    }

                    // Risk area warning
                    if (riskAreaWarning != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (riskAreaWarning.level == "vermelho") RedDangerBg else YellowWarnBg,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Shield, contentDescription = null, tint = RedDanger, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "Área de Atenção: ${riskAreaWarning.label}",
                                    fontSize = 12.sp,
                                    color = if (riskAreaWarning.level == "vermelho") Color(0xFFFCA5A5) else Color(0xFFFDE68A)
                                )
                            }
                        }
                    }
                }

                // Phone numbers row
                Column {
                    Text("Telefones de contato", fontSize = 13.sp, color = TextMuted, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = currentPhoneInput,
                            onValueChange = { currentPhoneInput = it },
                            placeholder = { Text("(69) 99999-9999") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = BluePrimary,
                                unfocusedBorderColor = LineBorder,
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary
                            ),
                            modifier = Modifier.weight(2f)
                        )
                        OutlinedTextField(
                            value = currentPhoneLabel,
                            onValueChange = { currentPhoneLabel = it },
                            placeholder = { Text("Tipo") },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = BluePrimary,
                                unfocusedBorderColor = LineBorder,
                                focusedTextColor = TextPrimary,
                                unfocusedTextColor = TextPrimary
                            ),
                            modifier = Modifier.weight(1.2f)
                        )
                        IconButton(
                            onClick = {
                                if (currentPhoneInput.isNotBlank()) {
                                    val label = if (currentPhoneLabel.isNotBlank()) currentPhoneLabel else "Celular"
                                    telefones = telefones.filter { it.numero.isNotBlank() } + PhoneEntry(currentPhoneInput, label)
                                    currentPhoneInput = ""
                                    currentPhoneLabel = ""
                                }
                            },
                            modifier = Modifier
                                .size(44.dp)
                                .background(BluePrimary, RoundedCornerShape(10.dp))
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "Adicionar Telefone", tint = Color.White)
                        }
                    }

                    if (telefones.any { it.numero.isNotBlank() }) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                            telefones.filter { it.numero.isNotBlank() }.forEach { p ->
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = CardBackgroundElevated
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text("${p.label}: ${p.numero}", fontSize = 12.sp, color = BlueLight)
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Icon(
                                            Icons.Default.Close,
                                            contentDescription = "Remover",
                                            tint = TextMuted,
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Packages & Value row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = pacotes,
                        onValueChange = { pacotes = it },
                        label = { Text("Pacotes") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = BluePrimary,
                            unfocusedBorderColor = LineBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.weight(1f).testTag("input_packages")
                    )

                    OutlinedTextField(
                        value = valor,
                        onValueChange = { valor = it },
                        label = { Text("Valor (R$)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = BluePrimary,
                            unfocusedBorderColor = LineBorder,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        ),
                        modifier = Modifier.weight(1f).testTag("input_value")
                    )
                }

                // Time window row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = janelaInicio,
                        onValueChange = { janelaInicio = it },
                        label = { Text("Horário início") },
                        placeholder = { Text("Ex: 09:00") },
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
                        value = janelaFim,
                        onValueChange = { janelaFim = it },
                        label = { Text("Horário fim") },
                        placeholder = { Text("Ex: 12:00") },
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

                // Notes
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Observações de entrega") },
                    placeholder = { Text("Interfone, portaria, ponto de referência...") },
                    maxLines = 3,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = BluePrimary,
                        unfocusedBorderColor = LineBorder,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                // Save to agenda checkbox
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Checkbox(
                        checked = saveToAgenda,
                        onCheckedChange = { saveToAgenda = it },
                        colors = CheckboxDefaults.colors(checkedColor = BluePrimary)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Salvar cliente também na agenda de contatos",
                        color = TextPrimary,
                        fontSize = 13.5.sp
                    )
                }

                // Submit button
                Button(
                    onClick = {
                        if (nome.isNotBlank() && endereco.isNotBlank()) {
                            val allPhones = if (currentPhoneInput.isNotBlank()) {
                                telefones.filter { it.numero.isNotBlank() } + PhoneEntry(currentPhoneInput, if (currentPhoneLabel.isNotBlank()) currentPhoneLabel else "Principal")
                            } else {
                                telefones.filter { it.numero.isNotBlank() }
                            }

                            val packCount = pacotes.toIntOrNull() ?: 1
                            val valDelivery = valor.toDoubleOrNull() ?: 15.0

                            viewModel.addDelivery(
                                nome = nome,
                                endereco = endereco,
                                telefones = allPhones,
                                pacotes = packCount,
                                valor = valDelivery,
                                janelaInicio = janelaInicio,
                                janelaFim = janelaFim,
                                notes = notes,
                                saveToAgenda = saveToAgenda
                            )

                            // Clear form
                            nome = ""
                            endereco = ""
                            telefones = listOf(PhoneEntry("", "Principal"))
                            currentPhoneInput = ""
                            currentPhoneLabel = ""
                            pacotes = "1"
                            notes = ""
                            saveToAgenda = false
                            showSuccessSnackbar = true
                            onDeliveryAdded()
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp)
                        .testTag("submit_delivery_btn"),
                    colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                    shape = RoundedCornerShape(12.dp),
                    enabled = nome.isNotBlank() && endereco.isNotBlank()
                ) {
                    Icon(Icons.Default.AddLocation, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Adicionar à rota",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}
