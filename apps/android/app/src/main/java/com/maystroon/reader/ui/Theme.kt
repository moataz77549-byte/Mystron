package com.maystroon.reader.ui

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontWeight
import com.maystroon.reader.R

val ArabicInterfaceFont = FontFamily(Font(R.font.ibm_plex_arabic_regular), Font(R.font.ibm_plex_arabic_bold, FontWeight.Bold))
val ArabicReadingFont = FontFamily(Font(R.font.noto_naskh_arabic))

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
        copy(displayLarge = displayLarge.copy(fontFamily = ArabicInterfaceFont),
            displayMedium = displayMedium.copy(fontFamily = ArabicInterfaceFont), displaySmall = displaySmall.copy(fontFamily = ArabicInterfaceFont),
            headlineLarge = headlineLarge.copy(fontFamily = ArabicInterfaceFont), headlineMedium = headlineMedium.copy(fontFamily = ArabicInterfaceFont), headlineSmall = headlineSmall.copy(fontFamily = ArabicInterfaceFont),
            titleLarge = titleLarge.copy(fontFamily = ArabicInterfaceFont), titleMedium = titleMedium.copy(fontFamily = ArabicInterfaceFont), titleSmall = titleSmall.copy(fontFamily = ArabicInterfaceFont),
            bodyLarge = bodyLarge.copy(fontFamily = ArabicInterfaceFont), bodyMedium = bodyMedium.copy(fontFamily = ArabicInterfaceFont), bodySmall = bodySmall.copy(fontFamily = ArabicInterfaceFont),
            labelLarge = labelLarge.copy(fontFamily = ArabicInterfaceFont), labelMedium = labelMedium.copy(fontFamily = ArabicInterfaceFont), labelSmall = labelSmall.copy(fontFamily = ArabicInterfaceFont))
    }, content = content)
}
