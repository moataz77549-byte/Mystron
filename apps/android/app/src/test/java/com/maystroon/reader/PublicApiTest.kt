package com.maystroon.reader

import com.maystroon.reader.core.*
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class PublicApiTest {
    @Test fun `offline Arabic search matches normalized words across document and author`() {
        val post = Post("saved", "إِبْداع القارئ", "s", authors = Author("أَحْمَد", "author"), content_json = RichNode("doc", content = listOf(RichNode("text", "فتى English"))))
        assertEquals(listOf(post), searchSaved(listOf(post), "ابداع احمد فتي english"))
        assertTrue(searchSaved(listOf(post), "غير موجود").isEmpty())
        assertTrue(publicationDate("2026-10-21T23:30:00Z").startsWith("22"))
        assertEquals("", publicationDate("invalid"))
    }
    @Test fun `decodes the shared server contract fixture`() {
        val fixture = requireNotNull(javaClass.classLoader?.getResource("public-reader-page.json")).readText()
        val page = ApiFactory.json.decodeFromString<PostPage>(fixture)
        assertEquals("اختبار-العقد", page.data.single().slug)
        assertEquals("كاتب الاختبار", page.data.single().authors?.display_name)
        assertEquals("نص الاقتباس", page.data.single().content_json!!.content[2].attr("quote"))
    }
    @Test fun `public DTO tolerates additional fields and preserves editorial nodes`() {
        val json = """{"data":[{"id":"p","title":"قصيدة عربية","slug":"قصيدة","authors":{"display_name":"شاعر","slug":"شاعر"},"seo_title":"عنوان","content_json":{"type":"doc","content":[{"type":"poetryVerse","attrs":{"first":"الشطر الأول","second":"الشطر الثاني","size":"large"}},{"type":"futureNode","attrs":{"opaque":"retained"},"content":[{"type":"text","text":"نص"}]}]}}],"total":1,"page":1,"pageSize":20}"""
        val page = ApiFactory.json.decodeFromString<PostPage>(json)
        assertEquals("شاعر", page.data.single().authors?.display_name)
        val roundTrip = ApiFactory.json.decodeFromString<Post>(ApiFactory.json.encodeToString(page.data.single()))
        assertEquals("retained", roundTrip.content_json!!.content[1].attr("opaque"))
        assertTrue(roundTrip.content_json!!.plainText().contains("الشطر الثاني"))
        assertTrue(roundTrip.shareUrl.contains("%D9"))
    }
    @Test fun `API pagination encodes Arabic query and sends no privileged credentials`() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("""{"data":[],"total":0,"page":2,"pageSize":20}"""))
            val result = ApiFactory.create(server.url("/").toString()).posts(page = 2, query = "ثقافة عربية", category = "كتب")
            assertEquals(2, result.page)
            val request = server.takeRequest()
            assertEquals("ثقافة عربية", request.requestUrl!!.queryParameter("q"))
            assertEquals("كتب", request.requestUrl!!.queryParameter("category"))
            assertNull(request.getHeader("Authorization"))
            assertNull(request.getHeader("apikey"))
            assertNull(request.getHeader("Origin"))
        }
    }
    @Test fun `links and media reject active and credential-bearing URLs`() {
        listOf("javascript:alert(1)", "data:text/html,test", "file:///sdcard/a", "http://example.com", "https://user:password@example.com").forEach { assertNull(safeHttps(it)) }
        assertEquals("https://example.com/path", safeHttps("https://example.com/path"))
        assertNull(assetUrl("../../private"))
        assertTrue(publicError(429, "60").contains("60"))
        assertFalse(publicError(503).contains("Exception"))
    }
}
