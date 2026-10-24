# RotaFlow Pro — Android (Kotlin & Jetpack Compose)

RotaFlow Pro is a delivery route and dispatch management application engineered for delivery drivers. The application provides comprehensive tools for routing daily deliveries, tracking customer contacts, calculating operating fuel costs, timing stops, and dispatching real-time notifications.

## Key Features

- **Nova Entrega (New Delivery)**: Client registration with auto-suggestions, duplicate address detection, multi-phone contact support with labels, package count, delivery fees, time windows, and instant option to sync to agenda.
- **Rota Atual (Active Route Management)**: Multi-route support (e.g. Rota 1, Rota 2), live progress bar with percentage, package counters, distance calculation, stop reordering/optimization, stopwatch timing per stop, and economics breakdown (gross revenue, fuel cost, net profit).
- **Driver Actions**: Direct WhatsApp dispatch with personalized template substitution (`{cliente}`), phone dialer integration, GPS navigation trigger (`geo:` uri), "Voltar depois" deferred delivery flags, and fail reason categorization.
- **Agenda de Clientes**: Saved recurring contacts, quick 1-tap dispatch to active route, favorite starring, and search.
- **Histórico (History & Archiving)**: Day-by-day archived logs detailing total packages, completed vs failed ratios, fuel economics, and expandable stop details.
- **Perfil & Custos Operacionais**: Vehicle selector (Moto, Carro, Van), fuel consumption (km/L), fuel price (R$/L), standard fee configuration, and risk area indicators.

## Tech Stack & Architecture

- **Language**: Kotlin 2.1.0
- **UI Framework**: Jetpack Compose (Material Design 3)
- **Architecture**: MVVM with reactive `StateFlow` and Clean Architecture Repository layer
- **Navigation**: Edge-to-edge Scaffold with M3 NavigationBar, badges, and predictive back support
- **Build System**: Gradle Kotlin DSL (`settings.gradle.kts`, `build.gradle.kts`, `app/build.gradle.kts`) with Version Catalog (`gradle/libs.versions.toml`)
