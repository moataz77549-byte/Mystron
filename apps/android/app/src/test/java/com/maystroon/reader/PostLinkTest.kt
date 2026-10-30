package com.maystroon.reader

import com.maystroon.reader.core.postSlugFromSiteLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PostLinkTest {
    @Test fun acceptsCanonicalArticles() {
        assertEquals("arabic-article", postSlugFromSiteLink("https://mystron-henna.vercel.app/posts/arabic-article"))
        assertEquals("خبر-جديد", postSlugFromSiteLink("https://mystron-henna.vercel.app/posts/خبر-جديد?source=share"))
    }

    @Test fun rejectsExternalDomainsAndUnsafePaths() {
        assertNull(postSlugFromSiteLink("https://evil.example/posts/arabic-article"))
        assertNull(postSlugFromSiteLink("http://mystron-henna.vercel.app/posts/arabic-article"))
        assertNull(postSlugFromSiteLink("https://mystron-henna.vercel.app.evil.example/posts/arabic-article"))
        assertNull(postSlugFromSiteLink("https://mystron-henna.vercel.app/posts/../../admin"))
        assertNull(postSlugFromSiteLink("https://mystron-henna.vercel.app/admin"))
        assertNull(postSlugFromSiteLink("https://mystron-henna.vercel.app/posts/"))
        assertNull(postSlugFromSiteLink(null))
    }
}
