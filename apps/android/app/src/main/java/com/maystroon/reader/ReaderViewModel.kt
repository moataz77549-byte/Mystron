package com.maystroon.reader

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.maystroon.reader.core.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import retrofit2.HttpException

data class FeedState(val posts: List<Post> = emptyList(), val total: Int = 0, val page: Int = 0,
    val loading: Boolean = false, val error: String? = null)
data class ArticleState(val post: Post? = null, val loading: Boolean = false, val offline: Boolean = false, val error: String? = null)
data class CommentsState(val rows: List<PublicComment> = emptyList(), val total: Int = 0, val page: Int = 0, val loading: Boolean = false, val error: String? = null)
class ReaderViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as MaystroonApplication
    private var feedJob: Job? = null
    private var articleJob: Job? = null
    private var commentJob: Job? = null
    private var filterCategory: String? = null
    private var filterQuery: String? = null
    private var filterAuthor: String? = null
    private val feeds = mutableMapOf<List<String?>, FeedState>()
    private val _feed = MutableStateFlow(FeedState())
    val feed = _feed.asStateFlow()
    private val _article = MutableStateFlow(ArticleState())
    val article = _article.asStateFlow()
    private val _comments = MutableStateFlow(CommentsState())
    val comments = _comments.asStateFlow()
    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories = _categories.asStateFlow()
    private val _catalogError = MutableStateFlow<String?>(null)
    val catalogError = _catalogError.asStateFlow()
    private val _authors = MutableStateFlow<List<Author>>(emptyList())
    val authors = _authors.asStateFlow()
    private val _notice = MutableStateFlow<String?>(null)
    val notice = _notice.asStateFlow()
    val settings = app.preferences.settings.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), Preferences())
    val saved = app.database.reader().observeSaved().map { rows -> rows.mapNotNull { row ->
        runCatching { ApiFactory.json.decodeFromString<Post>(row.document) }.getOrNull()
    } }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    init { refresh(); loadCatalog() }
    fun loadCatalog() { viewModelScope.launch {
        _catalogError.value = null
        try { _categories.value = app.api.categories().data }
        catch (e: Exception) { if (e is CancellationException) throw e; _catalogError.value = error(e) }
    } }
    fun loadAuthors() { viewModelScope.launch {
        try { _authors.value = app.api.authors().data }
        catch (e: Exception) { if (e is CancellationException) throw e; _notice.value = error(e) }
    } }
    fun filter(category: String? = null, query: String? = null, author: String? = null) {
        val nextQuery = query?.trim()?.take(100)?.ifEmpty { null }
        val oldKey = listOf(filterCategory, filterQuery, filterAuthor)
        val nextKey = listOf(category, nextQuery, author)
        if (oldKey == nextKey) {
            if (_feed.value.page == 0 && !_feed.value.loading) refresh()
            return
        }
        feeds[oldKey] = _feed.value.copy(loading = false)
        feedJob?.cancel()
        filterCategory = category; filterQuery = nextQuery; filterAuthor = author
        val cached = feeds[nextKey]
        if (cached != null && cached.page > 0) _feed.value = cached else refresh()
    }
    fun refresh() {
        feedJob?.cancel()
        _feed.value = FeedState(loading = true)
        loadPage(1)
    }
    fun nextPage() { val state = _feed.value; if (!state.loading && state.posts.size < state.total) loadPage(state.page + 1) }
    private fun loadPage(page: Int) {
        feedJob = viewModelScope.launch {
            _feed.update { it.copy(loading = true, error = null) }
            try {
                val response = app.api.posts(page = page, category = filterCategory, query = filterQuery, author = filterAuthor)
                _feed.update { FeedState(if (page == 1) response.data else (it.posts + response.data).distinctBy(Post::id), response.total, response.page) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _feed.update { it.copy(loading = false, error = error(e)) }
            }
        }
    }
    fun open(slug: String) {
        articleJob?.cancel()
        commentJob?.cancel()
        _comments.value = CommentsState()
        articleJob = viewModelScope.launch {
            _article.value = ArticleState(loading = true)
            try {
                val post = app.api.post(slug).data
                _article.value = ArticleState(post = post, error = if (post == null) publicError(404) else null)
                if (post != null) comments(post.id)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                val code = (e as? HttpException)?.code()
                // A confirmed withdrawal must not fall back to an old downloaded copy.
                val cached = if (code == 404 || code == 410) null else app.database.reader().saved(slug)?.let {
                    runCatching { ApiFactory.json.decodeFromString<Post>(it.document) }.getOrNull()
                }
                _article.value = ArticleState(post = cached, offline = cached != null, error = if (cached == null) error(e) else null)
            }
        }
    }
    fun comments(id: String, page: Int = 1) {
        if (_comments.value.loading) return
        commentJob = viewModelScope.launch {
            _comments.update { it.copy(loading = true, error = null) }
            try {
                val response = app.api.comments(id, page)
                _comments.update { CommentsState(if (page == 1) response.data else (it.rows + response.data).distinctBy(PublicComment::id), response.total, response.page) }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                _comments.update { it.copy(loading = false, error = error(e)) }
            }
        }
    }
    fun bookmark(post: Post) { viewModelScope.launch {
        try {
            if (app.database.reader().saved(post.slug) != null) app.database.reader().remove(post.id)
            else app.database.reader().save(SavedArticle(post.id, post.slug, ApiFactory.json.encodeToString(post), System.currentTimeMillis()))
            _notice.value = "تم تحديث المحفوظات على هذا الجهاز."
        } catch (e: Exception) { if (e is CancellationException) throw e; _notice.value = "تعذر تحديث المحفوظات. تحقق من مساحة الجهاز." }
    } }
    fun noticeConsumed() { _notice.value = null }
    fun dark(value: Boolean) { viewModelScope.launch { app.preferences.dark(value) } }
    fun font(value: Float) { viewModelScope.launch { app.preferences.font(value) } }
    suspend fun position(slug: String) = app.database.reader().position(slug)
    suspend fun rememberPosition(slug: String, item: Int, offset: Int) = app.database.reader().position(ReadingPosition(slug, item, offset))
    private fun error(e: Exception) = if (e is HttpException) publicError(e.code(), e.response()?.headers()?.get("Retry-After")) else publicError(0)
}
