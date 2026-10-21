package com.maystroon.reader.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.maystroon.reader.core.*
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

private fun RichNode.inlineText(depth: Int = 0): AnnotatedString = buildAnnotatedString {
    if (depth > 30) return@buildAnnotatedString
    if (type == "text") {
        val link = marks.firstOrNull { it.type == "link" }?.attrs?.get("href") as? JsonPrimitive
        val href = safeHttps(link?.contentOrNull)
        if (href != null) pushStringAnnotation("URL", href)
        marks.forEach { mark -> when (mark.type) {
            "bold" -> pushStyle(SpanStyle(fontWeight = FontWeight.Bold))
            "italic" -> pushStyle(SpanStyle(fontStyle = FontStyle.Italic))
            "underline" -> pushStyle(SpanStyle(textDecoration = TextDecoration.Underline))
            "strike" -> pushStyle(SpanStyle(textDecoration = TextDecoration.LineThrough))
            "code" -> pushStyle(SpanStyle(fontFamily = FontFamily.Monospace))
        } }
        if (href != null) pushStyle(SpanStyle(textDecoration = TextDecoration.Underline))
        append(text.orEmpty())
    } else if (type == "hardBreak") append("\n")
    else content.forEach { append(it.inlineText(depth + 1)) }
}

@Composable fun RichArticleNode(node: RichNode, scale: Float, depth: Int = 0) {
    if (depth > 30) return
    val colors = MaterialTheme.colorScheme
    val handler = LocalUriHandler.current
    val alignment = when (node.attr("textAlign")) { "center" -> TextAlign.Center; "right" -> TextAlign.Right; "left" -> TextAlign.Left; "justify" -> TextAlign.Justify; else -> TextAlign.Start }
    val textStyle = MaterialTheme.typography.bodyLarge.copy(fontSize = (19 * scale).sp, lineHeight = (34 * scale).sp, fontFamily = ArabicReadingFont, textAlign = alignment, textDirection = if (node.type == "codeBlock") TextDirection.Ltr else TextDirection.ContentOrRtl)
    when (node.type) {
        "paragraph", "heading", "text", "codeBlock" -> {
            val style = if (node.type == "heading") textStyle.copy(fontSize = (if (node.attr("level") == "2") 27 else 23).times(scale).sp, fontWeight = FontWeight.Bold)
                else if (node.type == "codeBlock") textStyle.copy(fontFamily = FontFamily.Monospace) else textStyle
            val annotated = node.inlineText()
            ClickableText(annotated, Modifier.fillMaxWidth().padding(vertical = 5.dp), style = style.copy(color = colors.onSurface), onClick = { offset ->
                annotated.getStringAnnotations("URL", offset, offset).firstOrNull()?.let { runCatching { handler.openUri(it.item) } }
            })
        }
        "horizontalRule" -> HorizontalDivider(Modifier.padding(vertical = 12.dp))
        "image" -> Column {
            val url = assetUrl(node.attr("assetId"))
            if (url != null) AsyncImage(url, node.attr("alt").ifEmpty { "صورة المقال" }, Modifier.fillMaxWidth().heightIn(min = 120.dp, max = 420.dp), contentScale = ContentScale.Fit)
            if (node.attr("caption").isNotBlank()) Text(node.attr("caption"), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(8.dp))
        }
        "poetryVerse" -> Column(Modifier.fillMaxWidth().background(colors.secondaryContainer).padding(16.dp)) {
            val size = when (node.attr("size")) { "small" -> 18; "large" -> 25; else -> 21 }
            Text(node.attr("first"), fontSize = (size * scale).sp, fontFamily = ArabicReadingFont)
            Text(node.attr("second"), fontSize = (size * scale).sp, fontFamily = ArabicReadingFont, modifier = Modifier.padding(start = 24.dp, top = 8.dp))
        }
        "citation" -> ElevatedCard(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(node.attr("quote"), style = textStyle)
                Text(listOf(node.attr("author"), node.attr("book"), node.attr("page")).filter(String::isNotBlank).joinToString(" — "), style = MaterialTheme.typography.labelLarge)
                safeHttps(node.attr("url"))?.let { url -> TextButton(onClick = { runCatching { handler.openUri(url) } }) { Text("المصدر") } }
            }
        }
        "blockquote", "callout", "poetry", "footnote" -> Surface(color = colors.secondaryContainer, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), shape = MaterialTheme.shapes.medium) {
            Column(Modifier.padding(16.dp)) {
                if (node.attr("title").isNotBlank()) Text(node.attr("title"), fontWeight = FontWeight.Bold)
                node.content.forEach { RichArticleNode(it, scale, depth + 1) }
            }
        }
        "table" -> Column(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
            node.content.forEach { row -> Row {
                row.content.forEach { cell -> Surface(Modifier.width(180.dp).padding(1.dp), color = colors.secondaryContainer) {
                    Column(Modifier.padding(10.dp)) { cell.content.forEach { RichArticleNode(it, scale, depth + 1) } }
                } }
            } }
        }
        "bulletList", "orderedList" -> Column { node.content.forEachIndexed { index, child -> Row {
            Text(if (node.type == "orderedList") "${index + 1}. " else "• ", Modifier.padding(top = 5.dp), style = textStyle)
            Column(Modifier.weight(1f)) { RichArticleNode(child, scale, depth + 1) }
        } } }
        "video" -> safeHttps(node.attr("src"))?.let { url ->
            // Never embed remote scripts. Explicit external navigation only.
            TextButton(onClick = { runCatching { handler.openUri(url) } }) { Text("فتح الفيديو في تطبيق خارجي") }
        }
        else -> Column { node.content.forEach { RichArticleNode(it, scale, depth + 1) } }
    }
}
