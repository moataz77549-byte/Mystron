package com.maystroon.reader.core

import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.encodeToString
import retrofit2.HttpException

data class LoadedArticle(val post: Post?, val offline: Boolean = false)

class ArticleRepository(private val dao: ReaderDao, private val fetch: suspend (String) -> Post?) {
    suspend fun load(slug: String): LoadedArticle {
        val post = try {
            fetch(slug)
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            val code = (e as? HttpException)?.code()
            if (code in listOf(401, 403, 404, 410)) {
                dao.withdraw(slug)
                throw e
            }
            if (e is IOException || code == 429 || (code != null && code >= 500)) {
                val document = dao.recent(slug)?.document ?: dao.saved(slug)?.document
                val cached = document?.let { runCatching { ApiFactory.json.decodeFromString<Post>(it) }.getOrNull() }
                if (cached != null) return LoadedArticle(cached, offline = true)
            }
            throw e
        }
        if (post == null) dao.withdraw(slug)
        else {
            // A full disk must not hide an article already received from the server.
            try { dao.remember(ReadArticle(post.id, post.slug, ApiFactory.json.encodeToString(post), System.currentTimeMillis())) }
            catch (e: Exception) { if (e is CancellationException) throw e }
        }
        return LoadedArticle(post)
    }
}
