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
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

@Entity(tableName = "saved_articles")
data class SavedArticle(@PrimaryKey val id: String, val slug: String, val document: String, val savedAt: Long)
@Entity(tableName = "reading_positions")
data class ReadingPosition(@PrimaryKey val slug: String, val item: Int, val offset: Int)
@Dao interface ReaderDao {
    @Query("SELECT * FROM saved_articles ORDER BY savedAt DESC") fun observeSaved(): Flow<List<SavedArticle>>
    @Query("SELECT * FROM saved_articles WHERE slug = :slug LIMIT 1") suspend fun saved(slug: String): SavedArticle?
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun save(article: SavedArticle)
    @Query("DELETE FROM saved_articles WHERE id = :id") suspend fun remove(id: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun position(position: ReadingPosition)
    @Query("SELECT * FROM reading_positions WHERE slug = :slug") suspend fun position(slug: String): ReadingPosition?
}
@Database(entities = [SavedArticle::class, ReadingPosition::class], version = 1, exportSchema = true)
abstract class ReaderDatabase : RoomDatabase() { abstract fun reader(): ReaderDao }

private val Context.readerPreferences by preferencesDataStore(name = "reader_preferences")
class ReaderPreferences(private val context: Context) {
    private val dark = booleanPreferencesKey("dark")
    private val font = floatPreferencesKey("font_scale")
    val settings = context.readerPreferences.data.map { Preferences(it[dark], it[font] ?: 1f) }
    suspend fun dark(value: Boolean) { context.readerPreferences.edit { it[dark] = value } }
    suspend fun font(value: Float) { context.readerPreferences.edit { it[font] = value.coerceIn(.85f, 1.6f) } }
}
data class Preferences(val dark: Boolean? = null, val fontScale: Float = 1f)
