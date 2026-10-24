package com.example.rotaflow.ui.util

import android.net.Uri
import com.example.rotaflow.data.model.Delivery
import com.example.rotaflow.data.model.DeliveryStatus
import com.example.rotaflow.data.model.UserProfile

object WhatsAppUtils {

    fun formatStatusDescription(status: DeliveryStatus, failReason: String?): String {
        return when (status) {
            DeliveryStatus.EM_ROTA -> "🚚 A caminho / Em rota de entrega"
            DeliveryStatus.PENDENTE -> "⏳ Na fila de entregas do dia"
            DeliveryStatus.ENTREGUE -> "✅ Entregue com sucesso"
            DeliveryStatus.FALHOU -> "⚠️ Tentativa de entrega sem sucesso (${failReason ?: "Destinatário ausente"})"
        }
    }

    fun buildClientWhatsAppMessage(delivery: Delivery, profile: UserProfile): String {
        val cliente = delivery.nome.ifBlank { "Cliente" }
        val statusDesc = formatStatusDescription(delivery.status, delivery.failReason)
        val eta = delivery.etaHorario ?: if (delivery.janelaInicio.isNotBlank()) "${delivery.janelaInicio} - ${delivery.janelaFim}" else "em breve"
        val trackUrl = "${profile.trackingBaseUrl}?token=${delivery.trackToken ?: delivery.id}"

        val builder = StringBuilder()
        builder.append("Olá, *${cliente}*!\n\n")
        builder.append("📦 Atualização da sua entrega (*${delivery.sequentialId}*):\n")
        builder.append("📍 Status atual: *${statusDesc}*\n")
        if (delivery.status != DeliveryStatus.ENTREGUE) {
            builder.append("⏱️ Horário estimado de chegada (ETA): *${eta}*\n")
        }
        if (delivery.pacotes > 1) {
            builder.append("📦 Volume: *${delivery.pacotes} pacotes*\n")
        }
        builder.append("🚚 ${profile.empresa} • Motorista: ${profile.motorista}\n")
        builder.append("🔗 Acompanhe seu pacote em tempo real pelo link:\n${trackUrl}\n\n")
        builder.append("Qualquer dúvida, estou à disposição!")

        return builder.toString()
    }

    fun generateWhatsAppUrl(delivery: Delivery, profile: UserProfile): String {
        val phone = delivery.telefones.firstOrNull()?.numero ?: ""
        val cleanPhone = phone.replace(Regex("[^0-9]"), "")
        val message = buildClientWhatsAppMessage(delivery, profile)
        return "https://api.whatsapp.com/send?phone=$cleanPhone&text=${Uri.encode(message)}"
    }
}
