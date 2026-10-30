package com.maystroon.reader

import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import com.maystroon.reader.core.*
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class OfflineRecoveryTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val post = Post("read", "مقال مقروء", "عربي")
    private suspend fun withDatabase(block: suspend (ReaderDatabase) -> Unit) {
        val database = Room.inMemoryDatabaseBuilder(context, ReaderDatabase::class.java).build()
        try { block(database) } finally { database.close() }
    }

    @Test fun readWithoutBookmarkSurvivesOfflineAndRefreshesExistingBookmark() = runTest {
        withDatabase { db ->
            val online = ArticleRepository(db.reader()) { post }
            assertFalse(online.load(post.slug).offline)
            assertNull(db.reader().saved(post.slug))
            val offline = ArticleRepository(db.reader()) { throw IOException("offline") }.load(post.slug)
            assertEquals(post, offline.post)
            assertTrue(offline.offline)
            db.reader().save(SavedArticle(post.id, post.slug, ApiFactory.json.encodeToString(post), 10))
            val edited = post.copy(title = "مقال محدّث")
            ArticleRepository(db.reader()) { edited }.load(post.slug)
            val saved = requireNotNull(db.reader().saved(post.slug))
            assertEquals(10L, saved.savedAt)
            assertEquals(edited, ApiFactory.json.decodeFromString<Post>(saved.document))
        }
    }

    @Test fun confirmedWithdrawalPurgesBothCopiesAndPositionBeforeOfflineRetry() = runTest {
        withDatabase { db ->
            for (status in listOf(401, 403, 404, 410)) {
                ArticleRepository(db.reader()) { post }.load(post.slug)
                db.reader().save(SavedArticle(post.id, post.slug, ApiFactory.json.encodeToString(post), 10))
                db.reader().position(ReadingPosition(post.slug, 2, 50))
                try {
                    ArticleRepository(db.reader()) { throw HttpException(Response.error<Post>(status, "{}".toResponseBody())) }.load(post.slug)
                    fail("Withdrawal must be surfaced")
                } catch (e: HttpException) { assertEquals(status, e.code()) }
                assertNull(db.reader().saved(post.slug))
                assertNull(db.reader().recent(post.slug))
                assertNull(db.reader().position(post.slug))
                try {
                    ArticleRepository(db.reader()) { throw IOException("offline") }.load(post.slug)
                    fail("Withdrawn copy must not reappear offline")
                } catch (_: IOException) { }
            }
        }
    }

    @Test fun cancellationKeepsCacheAndRecentHistoryIsBounded() = runTest {
        withDatabase { db ->
            ArticleRepository(db.reader()) { post }.load(post.slug)
            try {
                ArticleRepository(db.reader()) { throw CancellationException() }.load(post.slug)
                fail("Cancellation must propagate")
            } catch (_: CancellationException) { }
            assertNotNull(db.reader().recent(post.slug))
            for (i in 0..105) db.reader().remember(ReadArticle("$i", "slug-$i", "{}", Long.MAX_VALUE - 106 + i))
            val recent = db.reader().observeRecent().first()
            assertEquals(100, recent.size)
            assertEquals("105", recent.first().id)
        }
    }

    @Test fun migrationPreservesVersionOneBookmarksAndReadingPositions() = runTest {
        val name = "reader-migration-${System.nanoTime()}.db"
        context.openOrCreateDatabase(name, 0, null).use { old ->
            old.execSQL("CREATE TABLE saved_articles (id TEXT NOT NULL PRIMARY KEY, slug TEXT NOT NULL, document TEXT NOT NULL, savedAt INTEGER NOT NULL)")
            old.execSQL("CREATE TABLE reading_positions (slug TEXT NOT NULL PRIMARY KEY, item INTEGER NOT NULL, offset INTEGER NOT NULL)")
            old.execSQL("INSERT INTO saved_articles VALUES (?, ?, ?, ?)", arrayOf(post.id, post.slug, ApiFactory.json.encodeToString(post), 10))
            old.execSQL("INSERT INTO reading_positions VALUES (?, 2, 50)", arrayOf(post.slug))
            old.version = 1
        }
        val db = Room.databaseBuilder(context, ReaderDatabase::class.java, name).addMigrations(ReaderDatabase.MIGRATION_1_2).build()
        try {
            assertNotNull(db.reader().saved(post.slug))
            assertEquals(ReadingPosition(post.slug, 2, 50), db.reader().position(post.slug))
            assertTrue(db.reader().observeRecent().first().isEmpty())
            ArticleRepository(db.reader()) { post }.load(post.slug)
            assertNotNull(db.reader().recent(post.slug))
        } finally { db.close(); context.deleteDatabase(name) }
    }
}
