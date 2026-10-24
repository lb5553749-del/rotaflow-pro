package com.example.rotaflow.data.model

import kotlinx.serialization.Serializable

@Serializable
enum class DeliveryStatus(val label: String) {
    PENDENTE("Pendente"),
    EM_ROTA("Em rota"),
    ENTREGUE("Entregue"),
    FALHOU("Falhou")
}

@Serializable
data class PhoneEntry(
    val numero: String,
    val label: String = ""
)

@Serializable
data class Delivery(
    val id: String,
    val sequentialId: String,
    val nome: String,
    val endereco: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val telefones: List<PhoneEntry> = emptyList(),
    val pacotes: Int = 1,
    val valor: Double = 0.0,
    val janelaInicio: String = "",
    val janelaFim: String = "",
    val etaHorario: String? = null,
    val trackToken: String? = null,
    val notes: String = "",
    val status: DeliveryStatus = DeliveryStatus.PENDENTE,
    val failReason: String? = null,
    val voltarDepois: Boolean = false,
    val favorito: Boolean = false,
    val savedToAgenda: Boolean = false,
    val iniciadaEm: Long? = null,
    val concluidaEm: Long? = null,
    val duracaoMs: Long? = null
)

@Serializable
data class Route(
    val id: String,
    val name: String,
    val deliveries: List<Delivery> = emptyList(),
    val routeActive: Boolean = true,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class AgendaItem(
    val id: String,
    val nome: String,
    val endereco: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val telefones: List<PhoneEntry> = emptyList(),
    val pacotes: Int = 1,
    val notes: String = "",
    val favorito: Boolean = false
)

@Serializable
data class HistoryDay(
    val id: String,
    val date: String,
    val savedAt: Long,
    val deliveries: List<Delivery>,
    val statsTotal: Int,
    val statsEntregue: Int,
    val statsFalhou: Int,
    val totalPacotes: Int,
    val totalKm: Double = 0.0,
    val fuelCost: Double = 0.0,
    val revenue: Double = 0.0,
    val netProfit: Double = 0.0
)

@Serializable
data class UserProfile(
    val motorista: String = "Motorista",
    val empresa: String = "RotaFlow Express",
    val mensagemPadrao: String = "Olá {cliente}! Sou o entregador do RotaFlow Pro e seu pacote está a caminho. Previsão de chegada: {horario}. Acompanhe seu pacote pelo link: {link}",
    val trackingBaseUrl: String = "https://ais-dev-43h5gy2yh2su2pchn7mlza-731179008237.us-west2.run.app/track.html",
    val consumoKmL: Double = 12.0,
    val precoCombustivel: Double = 6.29,
    val valorPadraoEntrega: Double = 15.0,
    val veiculo: String = "Carro",
    val googleMapsApiKey: String = ""
)

@Serializable
data class RiskArea(
    val id: String,
    val label: String,
    val matchPattern: String,
    val level: String // "amarelo" or "vermelho"
)
