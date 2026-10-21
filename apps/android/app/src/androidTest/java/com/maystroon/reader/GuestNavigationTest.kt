package com.maystroon.reader

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test

class GuestNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    @Test fun guestCanOpenSavedSettingsAndAboutWithoutAuthentication() {
        compose.onNodeWithText("المحفوظات").performClick()
        compose.onNodeWithText("لم تحفظ مقالات بعد. افتح مقالاً واضغط زر الحفظ.").assertIsDisplayed()
        compose.onNodeWithText("المزيد").performClick()
        compose.onNodeWithText("إعدادات القراءة").performClick()
        compose.onNodeWithText("حجم خط المقال").assertIsDisplayed()
        compose.onNodeWithText(PLATFORM_COPYRIGHT).assertIsDisplayed()
        compose.onNodeWithContentDescription("رجوع").performClick()
        compose.onNodeWithText("عن المنصة وحقوق النشر").performClick()
        compose.onNodeWithText("تبقى حقوق المقالات والمصادر والمواد المرخصة لأصحابها، بصورة مستقلة عن حقوق تطوير المنصة.").assertIsDisplayed()
        compose.onNodeWithText("تسجيل الدخول").assertDoesNotExist()
    }
}
