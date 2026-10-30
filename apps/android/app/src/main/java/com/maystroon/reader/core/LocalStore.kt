package com.maystroon.reader.core

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

@Entity(tableName = "saved_articles")
data class SavedArticle(@PrimaryKey val id: String, val slug: String, val document: String, val savedAt: Long)
@Entity(tableName = "read_articles")
data class ReadArticle(@PrimaryKey val id: String, val slug: String, val document: String, val readAt: Long)
@Entity(tableName = "reading_positions")
data class ReadingPosition(@PrimaryKey val slug: String, val item: Int, val offset: Int)
@Dao interface ReaderDao {
    @Query("SELECT * FROM saved_articles ORDER BY savedAt DESC") fun observeSaved(): Flow<List<SavedArticle>>
    @Query("SELECT * FROM saved_articles WHERE slug = :slug LIMIT 1") suspend fun saved(slug: String): SavedArticle?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun save(article: SavedArticle)
    @Query("DELETE FROM saved_articles WHERE id = :id") suspend fun remove(id: String)
    @Query("SELECT * FROM read_articles ORDER BY readAt DESC, id") fun observeRecent(): Flow<List<ReadArticle>>
    @Query("SELECT * FROM read_articles WHERE slug = :slug LIMIT 1") suspend fun recent(slug: String): ReadArticle?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun storeRead(article: ReadArticle)
    @Query("UPDATE saved_articles SET slug = :slug, document = :document WHERE id = :id") suspend fun refreshSaved(id: String, slug: String, document: String)
    @Query("DELETE FROM read_articles WHERE id NOT IN (SELECT id FROM read_articles ORDER BY readAt DESC, id LIMIT 100)") suspend fun trimRecent()
    @Query("DELETE FROM saved_articles WHERE slug = :slug") suspend fun removeSavedSlug(slug: String)
    @Query("DELETE FROM read_articles WHERE slug = :slug") suspend fun removeReadSlug(slug: String)
    @Query("DELETE FROM reading_positions WHERE slug = :slug") suspend fun removePosition(slug: String)
    @Transaction suspend fun remember(article: ReadArticle) {
        storeRead(article)
        refreshSaved(article.id, article.slug, article.document)
        trimRecent()
    }
    @Transaction suspend fun withdraw(slug: String) {
        removeSavedSlug(slug)
        removeReadSlug(slug)
        removePosition(slug)
    }
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun position(position: ReadingPosition)
    @Query("SELECT * FROM reading_positions WHERE slug = :slug") suspend fun position(slug: String): ReadingPosition?
}
@Database(entities = [SavedArticle::class, ReadingPosition::class, ReadArticle::class], version = 2, exportSchema = true)
abstract class ReaderDatabase : RoomDatabase() {
    abstract fun reader(): ReaderDao
    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS read_articles (id TEXT NOT NULL PRIMARY KEY, slug TEXT NOT NULL, document TEXT NOT NULL, readAt INTEGER NOT NULL)")
            }
        }
    }
}

private val Context.readerPreferences by preferencesDataStore(name = "reader_preferences")
class ReaderPreferences(private val context: Context) {
    private val dark = booleanPreferencesKey("dark")
    private val font = floatPreferencesKey("font_scale")
    val settings = context.readerPreferences.data.map { Preferences(it[dark], it[font] ?: 1f) }
    suspend fun dark(value: Boolean) { context.readerPreferences.edit { it[dark] = value } }
    suspend fun font(value: Float) { context.readerPreferences.edit { it[font] = value.coerceIn(.85f, 1.6f) } }
}
data class Preferences(val dark: Boolean? = null, val fontScale: Float = 1f)
