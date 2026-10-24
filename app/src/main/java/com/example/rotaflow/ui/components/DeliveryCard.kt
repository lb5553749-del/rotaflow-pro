package com.example.rotaflow.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.rotaflow.data.model.Delivery
import com.example.rotaflow.data.model.DeliveryStatus
import com.example.rotaflow.data.model.RiskArea
import com.example.rotaflow.data.model.UserProfile
import com.example.rotaflow.ui.theme.*
import com.example.rotaflow.ui.util.WhatsAppUtils

@Composable
fun DeliveryCard(
    delivery: Delivery,
    riskArea: RiskArea?,
    profile: UserProfile,
    onStatusChange: (DeliveryStatus) -> Unit,
    onFailClick: () -> Unit,
    onToggleVoltarDepois: () -> Unit,
    onToggleFavorito: () -> Unit,
    onDelete: () -> Unit,
    onOpenDetails: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    val borderColor = when (delivery.status) {
        DeliveryStatus.EM_ROTA -> BluePrimary
        DeliveryStatus.ENTREGUE -> GreenSuccess
        DeliveryStatus.FALHOU -> RedDanger
        DeliveryStatus.PENDENTE -> LineBorder
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .border(1.5.dp, borderColor, RoundedCornerShape(16.dp))
            .clickable { onOpenDetails() }
            .testTag("delivery_card_${delivery.id}"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CardBackground)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header Row: Sequential ID, Name, Favorite Star
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(CardBackgroundElevated, CircleShape)
                            .border(1.2.dp, BluePrimary, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = delivery.sequentialId,
                            color = BlueLight,
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = delivery.nome,
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (!delivery.etaHorario.isNullOrBlank()) {
                                Text(
                                    text = "⚡ ETA: ${delivery.etaHorario}",
                                    color = YellowWarn,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                            if (delivery.janelaInicio.isNotBlank() || delivery.janelaFim.isNotBlank()) {
                                Text(
                                    text = "⏰ ${delivery.janelaInicio} - ${delivery.janelaFim}",
                                    color = TextMuted,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = onToggleFavorito,
                        modifier = Modifier.size(36.dp).testTag("fav_btn_${delivery.id}")
                    ) {
                        Icon(
                            imageVector = if (delivery.favorito) Icons.Filled.Star else Icons.Outlined.StarBorder,
                            contentDescription = "Favorito",
                            tint = if (delivery.favorito) YellowWarn else TextMuted
                        )
                    }
                    DeliveryStatusBadge(status = delivery.status)
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Address line
            Row(verticalAlignment = Alignment.Top) {
                Icon(
                    imageVector = Icons.Default.Place,
                    contentDescription = null,
                    tint = TextMuted,
                    modifier = Modifier.size(16.dp).padding(top = 2.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = delivery.endereco,
                    color = TextPrimary,
                    fontSize = 14.sp,
                    lineHeight = 19.sp
                )
            }

            // Risk Area warning if any
            if (riskArea != null) {
                Spacer(modifier = Modifier.height(6.dp))
                val isRed = riskArea.level == "vermelho"
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            if (isRed) RedDangerBg else YellowWarnBg,
                            RoundedCornerShape(8.dp)
                        )
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = "⚠️ Área de Atenção: ${riskArea.label}",
                        color = if (isRed) Color(0xFFFCA5A5) else Color(0xFFFDE68A),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            // Notes
            if (delivery.notes.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Obs: ${delivery.notes}",
                    color = TextMuted,
                    fontSize = 12.5.sp,
                    lineHeight = 17.sp
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Info chips row (Packages, Value, Duration, Return later)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = CardBackgroundElevated
                ) {
                    Text(
                        text = "📦 ${delivery.pacotes} ${if (delivery.pacotes > 1) "pacotes" else "pacote"}",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        fontSize = 12.sp,
                        color = TextPrimary
                    )
                }

                if (delivery.valor > 0) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = CardBackgroundElevated
                    ) {
                        Text(
                            text = "R$ ${"%.2f".format(delivery.valor)}",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = GreenSuccess
                        )
                    }
                }

                if (delivery.duracaoMs != null && delivery.duracaoMs > 0) {
                    val mins = delivery.duracaoMs / 60000
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = CardBackgroundElevated
                    ) {
                        Text(
                            text = "⏱️ ${mins} min",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            fontSize = 12.sp,
                            color = TextMuted
                        )
                    }
                }

                if (delivery.voltarDepois) {
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = YellowWarnBg
                    ) {
                        Text(
                            text = "↩️ Voltar depois",
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            fontSize = 12.sp,
                            color = YellowWarn,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Fail Reason banner
            if (delivery.status == DeliveryStatus.FALHOU && !delivery.failReason.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = RedDangerBg,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Motivo da falha: ${delivery.failReason}",
                        color = Color(0xFFFCA5A5),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = LineBorder, thickness = 0.8.dp)
            Spacer(modifier = Modifier.height(10.dp))

            // Action Buttons Row: WhatsApp, Call, Map, Return Later, Status Triggers
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // "Avisar cliente" button (WhatsApp with ETA & Status)
                Button(
                    onClick = {
                        val url = WhatsAppUtils.generateWhatsAppUrl(delivery, profile)
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        context.startActivity(intent)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.height(38.dp).testTag("avisar_cliente_btn_${delivery.id}")
                ) {
                    Icon(
                        imageVector = Icons.Default.Chat,
                        contentDescription = "Avisar cliente",
                        tint = Color.White,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Avisar cliente", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Color.White)
                }

                // Quick secondary actions
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    // Call
                    IconButton(
                        onClick = {
                            val phone = delivery.telefones.firstOrNull()?.numero ?: ""
                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                            context.startActivity(intent)
                        },
                        modifier = Modifier
                            .size(38.dp)
                            .background(CardBackgroundElevated, RoundedCornerShape(10.dp))
                            .testTag("call_btn_${delivery.id}"),
                        enabled = delivery.telefones.isNotEmpty()
                    ) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = "Ligar",
                            tint = BlueLight,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // Maps navigation
                    IconButton(
                        onClick = {
                            val gmmIntentUri = Uri.parse("geo:0,0?q=${Uri.encode(delivery.endereco)}")
                            val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                            context.startActivity(mapIntent)
                        },
                        modifier = Modifier
                            .size(38.dp)
                            .background(CardBackgroundElevated, RoundedCornerShape(10.dp))
                            .testTag("map_btn_${delivery.id}")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Navigation,
                            contentDescription = "Abrir GPS",
                            tint = YellowWarn,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // Status Button
                    when (delivery.status) {
                        DeliveryStatus.PENDENTE -> {
                            Button(
                                onClick = { onStatusChange(DeliveryStatus.EM_ROTA) },
                                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.height(38.dp).testTag("start_btn_${delivery.id}")
                            ) {
                                Text("Iniciar", fontSize = 12.5.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        DeliveryStatus.EM_ROTA -> {
                            Button(
                                onClick = { onStatusChange(DeliveryStatus.ENTREGUE) },
                                colors = ButtonDefaults.buttonColors(containerColor = GreenSuccess),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.height(38.dp).testTag("deliver_btn_${delivery.id}")
                            ) {
                                Text("Entregue", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                            }
                        }
                        DeliveryStatus.ENTREGUE, DeliveryStatus.FALHOU -> {
                            OutlinedButton(
                                onClick = { onOpenDetails() },
                                border = ButtonDefaults.outlinedButtonBorder.copy(brush = androidx.compose.ui.graphics.SolidColor(LineBorder)),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.height(38.dp).testTag("details_btn_${delivery.id}")
                            ) {
                                Text("Detalhes", fontSize = 12.sp, color = TextMuted)
                            }
                        }
                    }
                }
            }
        }
    }
}
