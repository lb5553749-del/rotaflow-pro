package com.example.rotaflow.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = BluePrimary,
    onPrimary = Color.White,
    primaryContainer = BlueDark,
    onPrimaryContainer = Color.White,
    secondary = GreenSuccess,
    onSecondary = Color.Black,
    background = BackgroundDark,
    onBackground = TextPrimary,
    surface = CardBackground,
    onSurface = TextPrimary,
    surfaceVariant = CardBackgroundElevated,
    onSurfaceVariant = TextMuted,
    outline = LineBorder,
    error = RedDanger,
    onError = Color.White
)

@Composable
fun RotaFlowTheme(
    darkTheme: Boolean = true, // Premium driver dark aesthetic default
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
