package com.example.rotaflow.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.rotaflow.data.model.Route
import com.example.rotaflow.data.model.UserProfile
import com.example.rotaflow.ui.theme.*

@Composable
fun EconomicsDialog(
    route: Route?,
    profile: UserProfile,
    onDismiss: () -> Unit
) {
    val deliveries = route?.deliveries ?: emptyList()
    val totalDeliveries = deliveries.size
    val estKm = totalDeliveries * 3.8
    val fuelLiters = if (profile.consumoKmL > 0) estKm / profile.consumoKmL else 0.0
    val fuelCost = fuelLiters * profile.precoCombustivel
    val grossRevenue = deliveries.sumOf { if (it.valor > 0) it.valor else profile.valorPadraoEntrega }
    val netProfit = grossRevenue - fuelCost

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = CardBackground,
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(
                    text = "💰 Economia e Lucro da Rota",
                    color = TextPrimary,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
                Text(
                    text = "${route?.name ?: "Rota"} • $totalDeliveries entregas cadastradas",
                    color = TextMuted,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(top = 2.dp, bottom = 16.dp)
                )

                Surface(
                    color = CardBackgroundElevated,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Distância estimada:", color = TextMuted, fontSize = 13.sp)
                            Text("%.1f km".format(estKm), color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Consumo médio (${profile.veiculo}):", color = TextMuted, fontSize = 13.sp)
                            Text("%.1f km/L".format(profile.consumoKmL), color = TextPrimary, fontSize = 13.sp)
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Custo combustível (R$ %.2f/L):".format(profile.precoCombustivel), color = TextMuted, fontSize = 13.sp)
                            Text("- R$ %.2f".format(fuelCost), color = RedDanger, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        }
                        HorizontalDivider(color = LineBorder, thickness = 0.8.dp)
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Faturamento bruto:", color = TextMuted, fontSize = 13.sp)
                            Text("+ R$ %.2f".format(grossRevenue), color = BlueLight, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Lucro líquido estimado:", color = GreenSuccess, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Text("R$ %.2f".format(netProfit), color = GreenSuccess, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
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
                    Text("OK, entendi")
                }
            }
        }
    }
}
