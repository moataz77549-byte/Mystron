package com.maystroon.reader

import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import com.maystroon.reader.core.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import org.junit.Assert.*
import org.junit.Test

class LocalReadingTest {
    @Test fun savedArabicDocumentAndPositionSurviveDatabaseReopen() = runTest {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "reader-test-${System.nanoTime()}.db"
        val post = Post(id = "fixture", title = "مقال محفوظ", slug = "عربي", content_json = RichNode("doc", content = listOf(RichNode("poetryVerse", attrs = mapOf("first" to kotlinx.serialization.json.JsonPrimitive("أول"), "second" to kotlinx.serialization.json.JsonPrimitive("ثانٍ"))))))
        var database = Room.databaseBuilder(context, ReaderDatabase::class.java, name).build()
        try {
            database.reader().save(SavedArticle(post.id, post.slug, ApiFactory.json.encodeToString(post), 1))
            database.reader().position(ReadingPosition(post.slug, 3, 72))
            database.close()
            database = Room.databaseBuilder(context, ReaderDatabase::class.java, name).build()
            val stored = requireNotNull(database.reader().saved(post.slug))
            assertEquals(post, ApiFactory.json.decodeFromString<Post>(stored.document))
            assertEquals(ReadingPosition(post.slug, 3, 72), database.reader().position(post.slug))
            assertEquals(1, database.reader().observeSaved().first().size)
            database.reader().remove(post.id)
            assertNull(database.reader().saved(post.slug))
        } finally { database.close(); context.deleteDatabase(name) }
    }
}
