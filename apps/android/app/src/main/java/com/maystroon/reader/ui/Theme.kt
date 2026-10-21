package com.maystroon.reader.ui

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily

private val Navy = Color(0xFF111D31)
private val Gold = Color(0xFFD5A96A)
private val Ivory = Color(0xFFF7F3EB)
private val Teal = Color(0xFF267E81)
private val Wine = Color(0xFF8F4D52)
private val Light = lightColorScheme(primary = Teal, onPrimary = Color.White, secondary = Navy,
    tertiary = Wine, background = Ivory, surface = Ivory, onSurface = Navy, onBackground = Navy,
    secondaryContainer = Gold.copy(alpha = .24f), onSecondaryContainer = Navy)
private val Dark = darkColorScheme(primary = Gold, onPrimary = Navy, secondary = Color(0xFF8ECED0),
    tertiary = Color(0xFFE7AFB5), background = Navy, surface = Color(0xFF19283D), onSurface = Ivory,
    onBackground = Ivory, secondaryContainer = Color(0xFF30455D), onSecondaryContainer = Ivory)
@Composable fun MaystroonTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Typography().run {
        copy(bodyLarge = bodyLarge.copy(fontFamily = FontFamily.SansSerif), bodyMedium = bodyMedium.copy(fontFamily = FontFamily.SansSerif))
    }, content = content)
}
