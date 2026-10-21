package com.maystroon.reader

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test
import android.graphics.Bitmap
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File

class GuestNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun guestCanOpenSavedSettingsAndAboutWithoutAuthentication() {
        compose.onNodeWithText("المحفوظات").performClick()
        compose.onNodeWithText("لم تحفظ مقالات بعد. افتح مقالاً واضغط زر الحفظ.").assertIsDisplayed()
        compose.onNodeWithText("المزيد").performClick()
        compose.onNodeWithText("إعدادات القراءة").performClick()
        compose.onNodeWithText("حجم خط المقال").assertIsDisplayed()
        compose.onNodeWithText(PLATFORM_COPYRIGHT).assertIsDisplayed()
        screenshot("guest-settings")
        compose.onNodeWithContentDescription("رجوع").performClick()
        compose.onNodeWithText("عن المنصة وحقوق النشر").performClick()
        compose.onNodeWithText("تبقى حقوق المقالات والمصادر والمواد المرخصة لأصحابها، بصورة مستقلة عن حقوق تطوير المنصة.").assertIsDisplayed()
        compose.onNodeWithText("تسجيل الدخول").assertDoesNotExist()
        screenshot("guest-about")
    }
    private fun screenshot(name: String) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val directory = File(instrumentation.targetContext.getExternalFilesDir(null), "screenshots").apply { mkdirs() }
        requireNotNull(instrumentation.uiAutomation.takeScreenshot()).let { bitmap ->
            File(directory, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
    }
}
