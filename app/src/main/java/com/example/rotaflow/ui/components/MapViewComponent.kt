package com.example.rotaflow.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.rotaflow.data.model.Delivery
import com.example.rotaflow.data.model.DeliveryStatus
import com.example.rotaflow.data.model.UserProfile
import com.example.rotaflow.ui.theme.*
import com.example.rotaflow.ui.util.WhatsAppUtils

@Composable
fun MapViewComponent(
    deliveries: List<Delivery>,
    profile: UserProfile,
    onStatusChange: (String, DeliveryStatus) -> Unit,
    onFailClick: (Delivery) -> Unit,
    onOpenDetails: (Delivery) -> Unit,
    isOptimizingRoute: Boolean = false,
    polylinePoints: List<Pair<Double, Double>> = emptyList(),
    routeMetricsText: String? = null,
    onOptimizeRoute: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var selectedDeliveryId by remember { mutableStateOf<String?>(deliveries.firstOrNull { it.status == DeliveryStatus.EM_ROTA }?.id ?: deliveries.firstOrNull()?.id) }

    // Coordinates bounding box
    val validCoords = deliveries.mapNotNull { d -> if (d.lat != null && d.lng != null) d to (d.lat to d.lng) else null }
    val minLat = validCoords.minOfOrNull { it.second.first } ?: -8.77
    val maxLat = validCoords.maxOfOrNull { it.second.first } ?: -8.75
    val minLng = validCoords.minOfOrNull { it.second.second } ?: -63.92
    val maxLng = validCoords.maxOfOrNull { it.second.second } ?: -63.89

    var zoomScale by remember { mutableStateOf(1f) }
    var panOffset by remember { mutableStateOf(Offset.Zero) }

    val transformState = rememberTransformableState { zoomChange, offsetChange, _ ->
        zoomScale = (zoomScale * zoomChange).coerceIn(0.6f, 3.0f)
        panOffset += offsetChange
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF0B132B))
            .transformable(state = transformState)
            .testTag("map_view_container")
    ) {
        // Interactive Canvas Map
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(deliveries, minLat, maxLat, minLng, maxLng, zoomScale, panOffset) {
                    detectTapGestures { tapOffset ->
                        val w = size.width
                        val h = size.height
                        val padX = w * 0.12f
                        val padY = h * 0.14f
                        val rangeLat = if (maxLat > minLat) (maxLat - minLat).toFloat() else 0.01f
                        val rangeLng = if (maxLng > minLng) (maxLng - minLng).toFloat() else 0.01f

                        // Find closest stop pin to tap
                        var closest: Delivery? = null
                        var minDistance = 70f // 70px touch target radius

                        validCoords.forEach { (del, coords) ->
                            val normX = (coords.second.toFloat() - minLng.toFloat()) / rangeLng
                            val normY = 1f - (coords.first.toFloat() - minLat.toFloat()) / rangeLat

                            val basePx = padX + normX * (w - 2 * padX)
                            val basePy = padY + normY * (h - 2 * padY)

                            val screenX = (basePx - w / 2) * zoomScale + w / 2 + panOffset.x
                            val screenY = (basePy - h / 2) * zoomScale + h / 2 + panOffset.y

                            val dist = (Offset(screenX, screenY) - tapOffset).getDistance()
                            if (dist < minDistance) {
                                minDistance = dist
                                closest = del
                            }
                        }

                        if (closest != null) {
                            selectedDeliveryId = closest!!.id
                        }
                    }
                }
        ) {
            val w = size.width
            val h = size.height

            // 1. Draw city grid / street pattern
            val gridStep = 60f * zoomScale
            val startGridX = (panOffset.x % gridStep)
            val startGridY = (panOffset.y % gridStep)

            var gx = startGridX
            while (gx < w) {
                drawLine(
                    color = Color(0xFF1C2541).copy(alpha = 0.4f),
                    start = Offset(gx, 0f),
                    end = Offset(gx, h),
                    strokeWidth = 1.2f
                )
                gx += gridStep
            }

            var gy = startGridY
            while (gy < h) {
                drawLine(
                    color = Color(0xFF1C2541).copy(alpha = 0.4f),
                    start = Offset(0f, gy),
                    end = Offset(w, gy),
                    strokeWidth = 1.2f
                )
                gy += gridStep
            }

            // 2. Map coordinates projection
            val padX = w * 0.12f
            val padY = h * 0.14f
            val rangeLat = if (maxLat > minLat) (maxLat - minLat).toFloat() else 0.01f
            val rangeLng = if (maxLng > minLng) (maxLng - minLng).toFloat() else 0.01f

            val projectedPoints = validCoords.map { (del, coords) ->
                val normX = (coords.second.toFloat() - minLng.toFloat()) / rangeLng
                val normY = 1f - (coords.first.toFloat() - minLat.toFloat()) / rangeLat

                val basePx = padX + normX * (w - 2 * padX)
                val basePy = padY + normY * (h - 2 * padY)

                val screenX = (basePx - w / 2) * zoomScale + w / 2 + panOffset.x
                val screenY = (basePy - h / 2) * zoomScale + h / 2 + panOffset.y

                del to Offset(screenX, screenY)
            }

            // 3. Draw Route Polyline connecting stops in sequence
            if (polylinePoints.size >= 2) {
                val path = Path()
                var first = true
                polylinePoints.forEach { (pLat, pLng) ->
                    val normX = (pLng.toFloat() - minLng.toFloat()) / rangeLng
                    val normY = 1f - (pLat.toFloat() - minLat.toFloat()) / rangeLat
                    val basePx = padX + normX * (w - 2 * padX)
                    val basePy = padY + normY * (h - 2 * padY)
                    val screenX = (basePx - w / 2) * zoomScale + w / 2 + panOffset.x
                    val screenY = (basePy - h / 2) * zoomScale + h / 2 + panOffset.y

                    if (first) {
                        path.moveTo(screenX, screenY)
                        first = false
                    } else {
                        path.lineTo(screenX, screenY)
                    }
                }

                // Outer route glow
                drawPath(
                    path = path,
                    color = BluePrimary.copy(alpha = 0.45f),
                    style = Stroke(width = 9f)
                )

                // Inner route line
                drawPath(
                    path = path,
                    color = BlueLight,
                    style = Stroke(width = 4.5f)
                )
            } else if (projectedPoints.size >= 2) {
                val path = Path()
                path.moveTo(projectedPoints.first().second.x, projectedPoints.first().second.y)
                for (i in 1 until projectedPoints.size) {
                    val p = projectedPoints[i].second
                    path.lineTo(p.x, p.y)
                }

                // Outer route glow
                drawPath(
                    path = path,
                    color = BluePrimary.copy(alpha = 0.35f),
                    style = Stroke(width = 8f)
                )

                // Inner route line
                drawPath(
                    path = path,
                    color = BlueLight,
                    style = Stroke(
                        width = 3.5f,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(20f, 12f), 0f)
                    )
                )
            }

            // 4. Draw markers for each stop
            val textPaint = android.graphics.Paint().apply {
                color = android.graphics.Color.WHITE
                textSize = 30f * zoomScale.coerceIn(0.8f, 1.4f)
                textAlign = android.graphics.Paint.Align.CENTER
                isFakeBoldText = true
            }

            projectedPoints.forEach { (del, pt) ->
                val isSelected = del.id == selectedDeliveryId
                val pinRadius = (if (isSelected) 24f else 18f) * zoomScale.coerceIn(0.8f, 1.3f)

                val (pinColor, glowColor) = when (del.status) {
                    DeliveryStatus.EM_ROTA -> BluePrimary to BlueLight
                    DeliveryStatus.ENTREGUE -> GreenSuccess to GreenSuccessBg
                    DeliveryStatus.FALHOU -> RedDanger to RedDangerBg
                    DeliveryStatus.PENDENTE -> YellowWarn to YellowWarnBg
                }

                // Pulse / Selected halo
                if (isSelected || del.status == DeliveryStatus.EM_ROTA) {
                    drawCircle(
                        color = glowColor.copy(alpha = 0.45f),
                        radius = pinRadius * 1.7f,
                        center = pt
                    )
                }

                // Shadow
                drawCircle(
                    color = Color.Black.copy(alpha = 0.4f),
                    radius = pinRadius,
                    center = pt + Offset(0f, 4f)
                )

                // Main Pin Circle
                drawCircle(
                    color = pinColor,
                    radius = pinRadius,
                    center = pt
                )

                // Pin White Border
                drawCircle(
                    color = Color.White,
                    radius = pinRadius,
                    center = pt,
                    style = Stroke(width = 2.5f)
                )

                // Draw Sequential ID text inside Pin
                drawContext.canvas.nativeCanvas.drawText(
                    del.sequentialId,
                    pt.x,
                    pt.y + (pinRadius * 0.38f),
                    textPaint
                )
            }
        }

        // Top Legend overlay
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = CardBackground.copy(alpha = 0.92f),
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 12.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).background(BluePrimary, CircleShape))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Em rota", fontSize = 11.sp, color = TextPrimary)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).background(YellowWarn, CircleShape))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Pendente", fontSize = 11.sp, color = TextPrimary)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).background(GreenSuccess, CircleShape))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Entregue", fontSize = 11.sp, color = TextPrimary)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = Modifier.size(8.dp).background(RedDanger, CircleShape))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Falhou", fontSize = 11.sp, color = TextPrimary)
                }
            }
        }

        // Route Metrics chip (if route was optimized)
        if (!routeMetricsText.isNullOrBlank()) {
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = CardBackground.copy(alpha = 0.95f),
                border = ButtonDefaults.outlinedButtonBorder.copy(brush = androidx.compose.ui.graphics.SolidColor(BluePrimary)),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 50.dp)
                    .testTag("map_route_metrics_chip")
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Navigation,
                        contentDescription = null,
                        tint = BlueLight,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = routeMetricsText,
                        fontSize = 11.5.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                }
            }
        }

        // Zoom / Recenter buttons
        Column(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 56.dp, end = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            IconButton(
                onClick = { zoomScale = (zoomScale * 1.25f).coerceAtMost(3.0f) },
                modifier = Modifier.size(38.dp).background(CardBackground, CircleShape)
            ) {
                Icon(Icons.Default.Add, contentDescription = "Zoom In", tint = TextPrimary)
            }
            IconButton(
                onClick = { zoomScale = (zoomScale / 1.25f).coerceAtLeast(0.6f) },
                modifier = Modifier.size(38.dp).background(CardBackground, CircleShape)
            ) {
                Icon(Icons.Default.Remove, contentDescription = "Zoom Out", tint = TextPrimary)
            }
            IconButton(
                onClick = {
                    zoomScale = 1f
                    panOffset = Offset.Zero
                },
                modifier = Modifier.size(38.dp).background(CardBackground, CircleShape)
            ) {
                Icon(Icons.Default.MyLocation, contentDescription = "Centralizar", tint = BlueLight)
            }
        }

        // Selected Delivery Floating Mini-Card at Bottom
        val selectedDelivery = deliveries.find { it.id == selectedDeliveryId }
        if (selectedDelivery != null) {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = CardBackground),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(14.dp)
                    .border(1.5.dp, BluePrimary.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
                    .testTag("map_selected_delivery_card")
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // Header: ID, Name, ETA, Status Badge
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(34.dp)
                                    .background(CardBackgroundElevated, CircleShape)
                                    .border(1.2.dp, BluePrimary, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = selectedDelivery.sequentialId,
                                    color = BlueLight,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp
                                )
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = selectedDelivery.nome,
                                    color = TextPrimary,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp
                                )
                                if (!selectedDelivery.etaHorario.isNullOrBlank()) {
                                    Text(
                                        text = "⚡ Previsão de chegada: ${selectedDelivery.etaHorario}",
                                        color = YellowWarn,
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }

                        DeliveryStatusBadge(status = selectedDelivery.status)
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Address
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.Place,
                            contentDescription = null,
                            tint = YellowWarn,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = selectedDelivery.endereco,
                            color = TextPrimary,
                            fontSize = 13.sp,
                            maxLines = 1
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    HorizontalDivider(color = LineBorder, thickness = 0.8.dp)
                    Spacer(modifier = Modifier.height(10.dp))

                    // Quick Actions: Avisar cliente, Details, GPS, Status
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // "Avisar cliente" WhatsApp CTA
                        Button(
                            onClick = {
                                val url = WhatsAppUtils.generateWhatsAppUrl(selectedDelivery, profile)
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                context.startActivity(intent)
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A)),
                            shape = RoundedCornerShape(10.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                            modifier = Modifier.height(38.dp).testTag("map_avisar_cliente_btn"),
                            enabled = selectedDelivery.telefones.isNotEmpty()
                        ) {
                            Icon(
                                Icons.Default.Chat,
                                contentDescription = "Avisar cliente",
                                tint = Color.White,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Avisar cliente", fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            // Open Details Button
                            IconButton(
                                onClick = { onOpenDetails(selectedDelivery) },
                                modifier = Modifier
                                    .size(38.dp)
                                    .background(CardBackgroundElevated, RoundedCornerShape(10.dp))
                                    .testTag("map_open_details_btn")
                            ) {
                                Icon(
                                    Icons.Default.Info,
                                    contentDescription = "Ver Detalhes",
                                    tint = BlueLight,
                                    modifier = Modifier.size(18.dp)
                                )
                            }

                            // GPS Intent
                            IconButton(
                                onClick = {
                                    val gmmIntentUri = Uri.parse("geo:0,0?q=${Uri.encode(selectedDelivery.endereco)}")
                                    val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                                    context.startActivity(mapIntent)
                                },
                                modifier = Modifier
                                    .size(38.dp)
                                    .background(CardBackgroundElevated, RoundedCornerShape(10.dp))
                            ) {
                                Icon(
                                    Icons.Default.Navigation,
                                    contentDescription = "Abrir GPS",
                                    tint = YellowWarn,
                                    modifier = Modifier.size(18.dp)
                                )
                            }

                            // Phone call
                            IconButton(
                                onClick = {
                                    val phone = selectedDelivery.telefones.firstOrNull()?.numero ?: ""
                                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                                    context.startActivity(intent)
                                },
                                modifier = Modifier
                                    .size(38.dp)
                                    .background(CardBackgroundElevated, RoundedCornerShape(10.dp)),
                                enabled = selectedDelivery.telefones.isNotEmpty()
                            ) {
                                Icon(
                                    Icons.Default.Phone,
                                    contentDescription = "Ligar",
                                    tint = BlueLight,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }

                        // Status Buttons
                        when (selectedDelivery.status) {
                            DeliveryStatus.PENDENTE -> {
                                Button(
                                    onClick = { onStatusChange(selectedDelivery.id, DeliveryStatus.EM_ROTA) },
                                    colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                                    modifier = Modifier.height(38.dp)
                                ) {
                                    Text("Iniciar", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                }
                            }
                            DeliveryStatus.EM_ROTA -> {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Button(
                                        onClick = { onStatusChange(selectedDelivery.id, DeliveryStatus.ENTREGUE) },
                                        colors = ButtonDefaults.buttonColors(containerColor = GreenSuccess),
                                        shape = RoundedCornerShape(10.dp),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                        modifier = Modifier.height(38.dp)
                                    ) {
                                        Text("Entregue", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color.Black)
                                    }
                                    Button(
                                        onClick = { onFailClick(selectedDelivery) },
                                        colors = ButtonDefaults.buttonColors(containerColor = RedDanger),
                                        shape = RoundedCornerShape(10.dp),
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
                                        modifier = Modifier.height(38.dp)
                                    ) {
                                        Text("Falhou", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                    }
                                }
                            }
                            DeliveryStatus.ENTREGUE, DeliveryStatus.FALHOU -> {
                                OutlinedButton(
                                    onClick = { onStatusChange(selectedDelivery.id, DeliveryStatus.PENDENTE) },
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                    modifier = Modifier.height(38.dp)
                                ) {
                                    Text("Reabrir", fontSize = 12.sp, color = TextMuted)
                                }
                            }
                        }
                    }
                }
            }
        }

        // Floating Action Button to Optimize Route directly from the map
        FloatingActionButton(
            onClick = { if (!isOptimizingRoute) onOptimizeRoute() },
            containerColor = if (isOptimizingRoute) CardBackgroundElevated else BluePrimary,
            contentColor = Color.White,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(
                    bottom = if (selectedDelivery != null) 210.dp else 24.dp,
                    end = 16.dp
                )
                .testTag("map_optimize_route_fab")
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (isOptimizingRoute) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        color = BlueLight,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Otimizando...",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                } else {
                    Icon(
                        Icons.Default.Route,
                        contentDescription = "Otimizar rota",
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Otimizar Rota",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}
