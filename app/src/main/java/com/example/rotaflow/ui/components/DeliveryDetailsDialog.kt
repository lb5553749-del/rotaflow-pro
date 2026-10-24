package com.example.rotaflow.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.rotaflow.data.model.Delivery
import com.example.rotaflow.data.model.DeliveryStatus
import com.example.rotaflow.data.model.UserProfile
import com.example.rotaflow.ui.theme.*
import com.example.rotaflow.ui.util.WhatsAppUtils

@Composable
fun DeliveryDetailsDialog(
    delivery: Delivery,
    profile: UserProfile,
    onStatusChange: (DeliveryStatus) -> Unit,
    onFailClick: () -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val statusDesc = WhatsAppUtils.formatStatusDescription(delivery.status, delivery.failReason)
    val eta = delivery.etaHorario ?: if (delivery.janelaInicio.isNotBlank()) "${delivery.janelaInicio} - ${delivery.janelaFim}" else "em breve"

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = CardBackground,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp)
                .testTag("delivery_details_panel")
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                // Header with sequential ID and close button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .background(CardBackgroundElevated, CircleShape)
                                .border(1.5.dp, BluePrimary, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = delivery.sequentialId,
                                color = BlueLight,
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "Detalhes da Entrega",
                                color = TextMuted,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = delivery.nome,
                                color = TextPrimary,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Close, contentDescription = "Fechar", tint = TextMuted)
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // ETA & Status Highlight Card
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = CardBackgroundElevated,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.AccessTime, contentDescription = null, tint = YellowWarn, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Previsão de chegada (ETA):", fontSize = 13.sp, color = TextMuted)
                            }
                            Text(
                                text = eta,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = YellowWarn
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        HorizontalDivider(color = LineBorder, thickness = 0.5.dp)
                        Spacer(modifier = Modifier.height(8.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Status da entrega:", fontSize = 13.sp, color = TextMuted)
                            DeliveryStatusBadge(status = delivery.status)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Address info
                Row(verticalAlignment = Alignment.Top) {
                    Icon(Icons.Default.Place, contentDescription = null, tint = YellowWarn, modifier = Modifier.size(20.dp).padding(top = 2.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text("Endereço completo", fontSize = 12.sp, color = TextMuted)
                        Text(delivery.endereco, fontSize = 14.sp, color = TextPrimary, lineHeight = 20.sp)
                    }
                }

                // Phone numbers info
                if (delivery.telefones.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Phone, contentDescription = null, tint = BlueLight, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = delivery.telefones.joinToString(" • ") { "${it.label}: ${it.numero}" },
                            fontSize = 13.sp,
                            color = TextPrimary
                        )
                    }
                }

                // Volume & Value info
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Surface(
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        color = CardBackgroundElevated
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text("Pacotes", fontSize = 11.sp, color = TextMuted)
                            Text("${delivery.pacotes} volumes", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                        }
                    }

                    if (delivery.valor > 0) {
                        Surface(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(10.dp),
                            color = CardBackgroundElevated
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Text("Valor da entrega", fontSize = 11.sp, color = TextMuted)
                                Text("R$ %.2f".format(delivery.valor), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = GreenSuccess)
                            }
                        }
                    }
                }

                // Observations
                if (delivery.notes.isNotBlank()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = CardBackgroundElevated,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text("Observações:", fontSize = 11.sp, color = TextMuted)
                            Text(delivery.notes, fontSize = 13.sp, color = TextPrimary)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // PRIMARY ACTION: "Avisar cliente" Button with WhatsApp
                Button(
                    onClick = {
                        val url = WhatsAppUtils.generateWhatsAppUrl(delivery, profile)
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        context.startActivity(intent)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)), // WhatsApp Brand Green
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .testTag("btn_avisar_cliente_dialog")
                ) {
                    Icon(
                        Icons.Default.Chat,
                        contentDescription = "WhatsApp",
                        tint = Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Avisar cliente",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Secondary navigation / call actions
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            val gmmIntentUri = Uri.parse("geo:0,0?q=${Uri.encode(delivery.endereco)}")
                            val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                            context.startActivity(mapIntent)
                        },
                        modifier = Modifier.weight(1f).height(42.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary)
                    ) {
                        Icon(Icons.Default.Navigation, contentDescription = null, tint = YellowWarn, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Abrir GPS", fontSize = 13.sp)
                    }

                    if (delivery.telefones.isNotEmpty()) {
                        OutlinedButton(
                            onClick = {
                                val phone = delivery.telefones.first().numero
                                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                                context.startActivity(intent)
                            },
                            modifier = Modifier.weight(1f).height(42.dp),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary)
                        ) {
                            Icon(Icons.Default.Phone, contentDescription = null, tint = BlueLight, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Ligar", fontSize = 13.sp)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))
                HorizontalDivider(color = LineBorder, thickness = 0.8.dp)
                Spacer(modifier = Modifier.height(12.dp))

                // Status transition triggers inside details panel
                Text("Alterar status da entrega:", fontSize = 12.sp, color = TextMuted, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    when (delivery.status) {
                        DeliveryStatus.PENDENTE -> {
                            Button(
                                onClick = {
                                    onStatusChange(DeliveryStatus.EM_ROTA)
                                    onDismiss()
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth().height(42.dp)
                            ) {
                                Icon(Icons.Default.PlayArrow, contentDescription = null)
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Iniciar rota", fontWeight = FontWeight.Bold)
                            }
                        }
                        DeliveryStatus.EM_ROTA -> {
                            Button(
                                onClick = {
                                    onStatusChange(DeliveryStatus.ENTREGUE)
                                    onDismiss()
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = GreenSuccess),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f).height(42.dp)
                            ) {
                                Text("Entregue", fontWeight = FontWeight.Bold, color = Color.Black)
                            }
                            Button(
                                onClick = {
                                    onFailClick()
                                    onDismiss()
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = RedDanger),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f).height(42.dp)
                            ) {
                                Text("Falhou", fontWeight = FontWeight.Bold)
                            }
                        }
                        DeliveryStatus.ENTREGUE, DeliveryStatus.FALHOU -> {
                            OutlinedButton(
                                onClick = {
                                    onStatusChange(DeliveryStatus.PENDENTE)
                                    onDismiss()
                                },
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth().height(42.dp)
                            ) {
                                Text("Reabrir entrega", color = TextMuted)
                            }
                        }
                    }
                }
            }
        }
    }
}
