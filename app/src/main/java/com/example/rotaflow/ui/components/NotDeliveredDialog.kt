package com.example.rotaflow.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.rotaflow.data.model.Delivery
import com.example.rotaflow.ui.theme.*

@Composable
fun NotDeliveredDialog(
    delivery: Delivery,
    onConfirmFail: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val reasons = listOf(
        "Cliente ausente",
        "Endereço não localizado",
        "Recusado pelo destinatário",
        "Sem tempo hábil no horário",
        "Problema no pagamento/cobrança",
        "Endereço inacessível / obra / enchente",
        "Outro motivo"
    )

    var selectedReason by remember { mutableStateOf(reasons.first()) }
    var customNotes by remember { mutableStateOf("") }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = CardBackground,
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = "Registrar não entrega",
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
                Text(
                    text = "${delivery.sequentialId} • ${delivery.nome}",
                    color = TextMuted,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(top = 2.dp, bottom = 14.dp)
                )

                Text(
                    text = "Selecione o motivo:",
                    color = TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold
                )

                Spacer(modifier = Modifier.height(8.dp))

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    reasons.forEach { reason ->
                        val isSelected = selectedReason == reason
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isSelected) CardBackgroundElevated else androidx.compose.ui.graphics.Color.Transparent)
                                .clickable { selectedReason = reason }
                                .padding(horizontal = 8.dp, vertical = 6.dp)
                        ) {
                            RadioButton(
                                selected = isSelected,
                                onClick = { selectedReason = reason },
                                colors = RadioButtonDefaults.colors(selectedColor = RedDanger)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = reason,
                                color = if (isSelected) TextPrimary else TextMuted,
                                fontSize = 13.5.sp
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("Cancelar", color = TextMuted)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Button(
                        onClick = { onConfirmFail(selectedReason) },
                        colors = ButtonDefaults.buttonColors(containerColor = RedDanger),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.testTag("confirm_fail_btn")
                    ) {
                        Text("Confirmar falha", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
