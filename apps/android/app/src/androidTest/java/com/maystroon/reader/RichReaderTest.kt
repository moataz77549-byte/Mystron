package com.maystroon.reader

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.LayoutDirection
import com.maystroon.reader.core.*
import com.maystroon.reader.ui.*
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Rule
import org.junit.Test

class RichReaderTest {
    @get:Rule val compose = createComposeRule()
    @Test fun poetryCitationAndMixedParagraphRenderNativelyInRtl() {
        compose.setContent { MaystroonTheme(dark = false) { CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) { Column {
            RichArticleNode(RichNode("paragraph", content = listOf(RichNode("text", text = "العربية English 2026"))), 1f)
            RichArticleNode(RichNode("poetryVerse", attrs = mapOf("first" to JsonPrimitive("الشطر الأول"), "second" to JsonPrimitive("الشطر الثاني"))), 1f)
            RichArticleNode(RichNode("citation", attrs = mapOf("quote" to JsonPrimitive("نص اقتباس"), "author" to JsonPrimitive("الكاتب"), "book" to JsonPrimitive("الكتاب"), "page" to JsonPrimitive("12"))), 1f)
        } } } }
        compose.onNodeWithText("العربية English 2026").assertIsDisplayed()
        compose.onNodeWithText("الشطر الأول").assertIsDisplayed()
        compose.onNodeWithText("الشطر الثاني").assertIsDisplayed()
        compose.onNodeWithText("نص اقتباس").assertIsDisplayed()
        compose.onNodeWithText("الكاتب — الكتاب — 12").assertIsDisplayed()
    }
}
