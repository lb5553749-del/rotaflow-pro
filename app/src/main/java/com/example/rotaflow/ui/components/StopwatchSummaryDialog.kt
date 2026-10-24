package com.example.rotaflow.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.rotaflow.data.model.Delivery
import com.example.rotaflow.ui.theme.*

@Composable
fun StopwatchSummaryDialog(
    deliveries: List<Delivery>,
    onDismiss: () -> Unit
) {
    val completedWithDuration = deliveries.filter { (it.duracaoMs ?: 0L) > 0L }
    val totalMs = completedWithDuration.sumOf { it.duracaoMs ?: 0L }
    val avgMs = if (completedWithDuration.isNotEmpty()) totalMs / completedWithDuration.size else 0L

    fun formatDuration(ms: Long): String {
        val totalSecs = ms / 1000
        val mins = totalSecs / 60
        val secs = totalSecs % 60
        return "%d min %02d s".format(mins, secs)
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = CardBackground,
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = "⏱️ Resumo de Tempo do Dia",
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )

                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Surface(
                        modifier = Modifier.weight(1f),
                        color = CardBackgroundElevated,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Total em rota", fontSize = 11.sp, color = TextMuted)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = formatDuration(totalMs),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = BlueLight
                            )
                        }
                    }

                    Surface(
                        modifier = Modifier.weight(1f),
                        color = CardBackgroundElevated,
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Média / parada", fontSize = 11.sp, color = TextMuted)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = formatDuration(avgMs),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = GreenSuccess
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
                Text("Detalhamento por parada:", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextMuted)
                Spacer(modifier = Modifier.height(8.dp))

                if (completedWithDuration.isEmpty()) {
                    Text(
                        "Nenhuma entrega finalizada com cronômetro ainda.",
                        fontSize = 13.sp,
                        color = TextMuted,
                        modifier = Modifier.padding(vertical = 12.dp)
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 240.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        items(completedWithDuration) { del ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(CardBackgroundElevated, RoundedCornerShape(8.dp))
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${del.sequentialId} • ${del.nome}",
                                    fontSize = 13.sp,
                                    color = TextPrimary,
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    text = formatDuration(del.duracaoMs ?: 0L),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TextMuted
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))
                Button(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                ) {
                    Text("Fechar")
                }
            }
        }
    }
}
