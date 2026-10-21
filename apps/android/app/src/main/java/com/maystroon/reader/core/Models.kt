package com.maystroon.reader.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.net.URI
import java.text.Normalizer
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Serializable data class Envelope<T>(val data: T)
@Serializable data class PostPage(val data: List<Post>, val total: Int, val page: Int, val pageSize: Int)
@Serializable data class PublicComment(val id: String, val parent_id: String? = null, val guest_name: String, val body: String, val created_at: String)
@Serializable data class CommentPage(val data: List<PublicComment>, val total: Int, val page: Int, val pageSize: Int)
@Serializable data class Category(val id: String, val name: String, val slug: String, val description: String? = null)
@Serializable data class Author(val display_name: String, val slug: String, val bio: String? = null)
@Serializable data class Source(val title: String? = null, val url: String? = null, val author: String? = null, val page: String? = null)
@Serializable data class Post(
    val id: String,
    val title: String,
    val slug: String,
    val excerpt: String? = null,
    val subtitle: String? = null,
    val content: String? = null,
    val content_json: RichNode? = null,
    val cover_image: String? = null,
    val cover_asset_id: String? = null,
    val thumbnail_asset_id: String? = null,
    val published_at: String? = null,
    val reading_minutes: Int? = null,
    val authors: Author? = null,
    val featured: Boolean = false,
    val tags: List<String> = emptyList(),
    val sources: List<Source> = emptyList(),
    val sharing: Map<String, Boolean> = emptyMap(),
) {
    val shareUrl get() = "https://mystron-henna.vercel.app/posts/" + encodeSegment(slug)
    val imageUrl get() = (thumbnail_asset_id ?: cover_asset_id)?.let(::assetUrl) ?: safeHttps(cover_image)
}
@Serializable data class RichMark(val type: String, val attrs: Map<String, JsonElement> = emptyMap())
@Serializable data class RichNode(
    val type: String,
    val text: String? = null,
    val attrs: Map<String, JsonElement> = emptyMap(),
    val marks: List<RichMark> = emptyList(),
    val content: List<RichNode> = emptyList(),
) {
    fun attr(key: String): String = (attrs[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
    fun plainText(depth: Int = 0): String = if (depth > 30) "" else when (type) {
        "text" -> text.orEmpty()
        "hardBreak" -> "\n"
        "poetryVerse" -> listOf(attr("first"), attr("second")).joinToString("     ")
        "citation" -> attr("quote")
        else -> content.joinToString(if (type in setOf("paragraph", "heading")) "" else "\n") { it.plainText(depth + 1) }
    }
}

fun encodeSegment(value: String): String = java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20")
fun safeHttps(value: String?): String? = runCatching {
    val uri = URI(value ?: return null)
    value.takeIf { uri.scheme == "https" && !uri.host.isNullOrEmpty() && uri.userInfo == null }
}.getOrNull()
fun assetUrl(id: String): String? = id.takeIf { it.matches(Regex("[a-fA-F0-9-]{36}")) }
    ?.let { "https://mystron-henna.vercel.app/api/v1/media/$it?variant=optimized" }

fun publicError(status: Int, retryAfter: String? = null): String = when (status) {
    404 -> "هذا المحتوى غير متاح الآن."
    429 -> "تجاوزت عدد المحاولات المسموح بها. حاول لاحقاً" + (retryAfter?.toIntOrNull()?.let { " بعد $it ثانية." } ?: ".")
    503 -> "الخدمة غير متاحة مؤقتاً. أعد المحاولة لاحقاً."
    else -> "تعذر تحميل المحتوى. تحقق من الاتصال ثم أعد المحاولة."
}

fun normalizeArabic(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFKC)
    .replace(Regex("[\\u064B-\\u065F\\u0670\\u0640]"), "")
    .replace(Regex("[أإآٱ]"), "ا").replace('ى', 'ي').lowercase(Locale.ROOT).trim()
fun searchSaved(posts: List<Post>, query: String): List<Post> {
    val terms = normalizeArabic(query).split(Regex("\\s+")).filter(String::isNotEmpty)
    return posts.filter { post ->
        val text = normalizeArabic(listOfNotNull(post.title, post.excerpt, post.authors?.display_name,
            post.tags.joinToString(" "), post.content_json?.plainText() ?: post.content).joinToString(" "))
        terms.all(text::contains)
    }
}
fun publicationDate(value: String?): String = value?.let {
    runCatching { Instant.parse(it).atZone(ZoneId.of("Asia/Aden")).format(DateTimeFormatter.ofPattern("dd MMMM yyyy", Locale.forLanguageTag("ar-YE"))) }.getOrNull()
}.orEmpty()
