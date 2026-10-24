package com.example.rotaflow.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.rotaflow.data.model.DeliveryStatus
import com.example.rotaflow.ui.theme.*

@Composable
fun DeliveryStatusBadge(status: DeliveryStatus, modifier: Modifier = Modifier) {
    val (bgColor, textColor) = when (status) {
        DeliveryStatus.PENDENTE -> Color(0xFF334155) to Color(0xFFE2E8F0)
        DeliveryStatus.EM_ROTA -> Color(0xFF1E3A8A) to Color(0xFF93C5FD)
        DeliveryStatus.ENTREGUE -> Color(0xFF14532D) to Color(0xFF86EFAC)
        DeliveryStatus.FALHOU -> Color(0xFF7F1D1D) to Color(0xFFFCA5A5)
    }

    Box(
        modifier = modifier
            .background(bgColor, RoundedCornerShape(8.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text = status.label,
            color = textColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )
    }
}
