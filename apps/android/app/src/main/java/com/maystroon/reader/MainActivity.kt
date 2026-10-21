package com.maystroon.reader

import android.content.Intent
import android.os.Bundle
import android.text.Html
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Article
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import coil.compose.AsyncImage
import com.maystroon.reader.core.*
import com.maystroon.reader.ui.*
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged

const val PLATFORM_COPYRIGHT = "© معتز العلقمي — اليمن، تعز — 2026م"
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val vm: ReaderViewModel = viewModel()
            val prefs by vm.settings.collectAsStateWithLifecycle()
            MaystroonTheme(prefs.dark ?: isSystemInDarkTheme()) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) { ReaderApp(vm, prefs) }
            }
        }
    }
}
private data class Tab(val route: String, val title: String, val icon: ImageVector)
private val tabs = listOf(Tab("home", "الرئيسية", Icons.Default.Home), Tab("categories", "الأقسام", Icons.Default.Category),
    Tab("search", "البحث", Icons.Default.Search), Tab("saved", "المحفوظات", Icons.Default.Bookmarks), Tab("more", "المزيد", Icons.Default.MoreHoriz))

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ReaderApp(vm: ReaderViewModel, prefs: Preferences) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route ?: "home"
    val notice by vm.notice.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(notice) { notice?.let { snackbar.showSnackbar(it); vm.noticeConsumed() } }
    fun openPost(post: Post) { nav.navigate("article/" + encodeSegment(post.slug)) }
    Scaffold(
        topBar = { TopAppBar(title = { Column { Text("ما يسطرون", fontWeight = FontWeight.Bold); Text("MAYSTROON", style = MaterialTheme.typography.labelSmall) } },
            navigationIcon = { if (route !in tabs.map(Tab::route)) IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "رجوع") } }) },
        bottomBar = { if (route in tabs.map(Tab::route)) NavigationBar { tabs.forEach { tab -> NavigationBarItem(selected = route == tab.route,
            onClick = { nav.navigate(tab.route) { popUpTo(nav.graph.findStartDestination().id) { saveState = true }; launchSingleTop = true; restoreState = true } },
            icon = { Icon(tab.icon, tab.title) }, label = { Text(tab.title, maxLines = 1) }) } } },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding -> Box(Modifier.padding(padding).fillMaxSize()) {
        NavHost(nav, startDestination = "home") {
            composable("home") { LaunchedEffect(Unit) { vm.filter() }; FeedScreen(vm, "أحدث ما يسطرون", ::openPost) }
            composable("categories") {
                val categories by vm.categories.collectAsStateWithLifecycle()
                val error by vm.catalogError.collectAsStateWithLifecycle()
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item { Text("أقسام المنصة", style = MaterialTheme.typography.headlineMedium) }
                    if (error != null) item { StatusPanel(error!!, vm::loadCatalog) }
                    if (categories.isEmpty() && error == null) item { Text("لا توجد أقسام متاحة حالياً.") }
                    items(categories, key = Category::id) { category -> ElevatedCard(onClick = {
                        vm.filter(category = category.slug); nav.navigate("filtered/" + encodeSegment(category.name))
                    }, modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(20.dp)) {
                        Text(category.name, style = MaterialTheme.typography.titleLarge)
                        category.description?.let { Text(it, Modifier.padding(top = 8.dp)) }
                    } } }
                }
            }
            composable("filtered/{label}") { entry -> FeedScreen(vm, entry.arguments?.getString("label").orEmpty(), ::openPost) }
            composable("search") {
                var query by rememberSaveable { mutableStateOf("") }
                var local by rememberSaveable { mutableStateOf(false) }
                val saved by vm.saved.collectAsStateWithLifecycle()
                LaunchedEffect(Unit) { vm.filter(query = query) }
                Column {
                    OutlinedTextField(query, { query = it.take(100) }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), label = { Text("ابحث في المقالات") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { if (!local) vm.filter(query = query) }),
                        trailingIcon = { IconButton(onClick = { if (!local) vm.filter(query = query) }) { Icon(Icons.Default.Search, "تنفيذ البحث") } })
                    FilterChip(selected = local, onClick = { local = !local }, label = { Text("البحث في المحفوظات دون إنترنت") }, modifier = Modifier.padding(horizontal = 16.dp))
                    if (!local) FeedScreen(vm, "نتائج البحث", ::openPost)
                    else {
                        val results = remember(saved, query) { searchSaved(saved, query) }
                        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            if (results.isEmpty()) item { StatusPanel("لا توجد مقالات محفوظة تطابق البحث.") }
                            items(results, key = Post::id) { post -> PostCard(post) { openPost(post) } }
                        }
                    }
                }
            }
            composable("saved") {
                val saved by vm.saved.collectAsStateWithLifecycle()
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item { Text("المحفوظات", style = MaterialTheme.typography.headlineMedium) }
                    item { Text("تُحفظ النصوص على هذا الجهاز. تتطلب الصور اتصالاً ما لم تكن مخزنة مؤقتاً.", style = MaterialTheme.typography.bodySmall) }
                    if (saved.isEmpty()) item { StatusPanel("لم تحفظ مقالات بعد. افتح مقالاً واضغط زر الحفظ.") }
                    items(saved, key = Post::id) { post -> Column { PostCard(post) { openPost(post) }; TextButton(onClick = { vm.bookmark(post) }) { Text("إزالة من المحفوظات") } } }
                }
            }
            composable("more") {
                val uri = LocalUriHandler.current
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Text("المزيد", style = MaterialTheme.typography.headlineMedium) }
                    item { MenuButton("عن المنصة وحقوق النشر", Icons.Default.Info) { nav.navigate("about") } }
                    item { MenuButton("الكتّاب", Icons.Default.People) { vm.loadAuthors(); nav.navigate("authors") } }
                    item { MenuButton("أحدث المقالات", Icons.AutoMirrored.Filled.Article) { vm.filter(); nav.navigate("filtered/أحدث المقالات") } }
                    item { MenuButton("فتح بوت ما يسطرون", Icons.Default.Send) { runCatching { uri.openUri("https://t.me/Moatazbotai4bot") } } }
                    item { MenuButton("إعدادات القراءة", Icons.Default.Settings) { nav.navigate("settings") } }
                    item { Text(PLATFORM_COPYRIGHT, Modifier.padding(vertical = 24.dp), style = MaterialTheme.typography.bodySmall) }
                }
            }
            composable("authors") {
                val authors by vm.authors.collectAsStateWithLifecycle()
                LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item { Text("الكتّاب", style = MaterialTheme.typography.headlineMedium) }
                    if (authors.isEmpty()) item { StatusPanel("لا توجد أسماء للعرض حالياً.", vm::loadAuthors) }
                    items(authors, key = Author::slug) { author -> ElevatedCard(onClick = { vm.filter(author = author.slug); nav.navigate("filtered/" + encodeSegment(author.display_name)) }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(20.dp)) { Text(author.display_name, style = MaterialTheme.typography.titleLarge); author.bio?.let { Text(it) } }
                    } }
                }
            }
            composable("settings") {
                val dark = prefs.dark ?: isSystemInDarkTheme()
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Text("إعدادات القراءة", style = MaterialTheme.typography.headlineMedium)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("الوضع الداكن"); Switch(dark, vm::dark) }
                    Text("حجم خط المقال")
                    Slider(prefs.fontScale, vm::font, valueRange = .85f..1.6f, steps = 4)
                    Text("تُحفظ هذه الإعدادات على جهازك.")
                    Text("الإصدار ${BuildConfig.VERSION_NAME}")
                    Text(PLATFORM_COPYRIGHT)
                }
            }
            composable("about") { LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                item { Text("ما يسطرون", style = MaterialTheme.typography.headlineLarge) }
                item { Text("منصة ثقافية وإعلامية وكتابية عربية. التصفح والقراءة متاحان دون تسجيل دخول.") }
                item { Text(PLATFORM_COPYRIGHT) }
                item { Text("تبقى حقوق المقالات والمصادر والمواد المرخصة لأصحابها، بصورة مستقلة عن حقوق تطوير المنصة.") }
                item { Text("الإصدار ${BuildConfig.VERSION_NAME}") }
                item { TextButton(onClick = { nav.navigate("licenses") }) { Text("تراخيص الخطوط") } }
            } }
            composable("licenses") {
                val context = LocalContext.current
                val text = remember { context.resources.openRawResource(R.raw.font_licenses).bufferedReader().use { it.readText() } }
                LazyColumn(contentPadding = PaddingValues(20.dp)) { item { SelectionContainer { Text(text) } } }
            }
            composable("article/{slug}") { entry ->
                val slug = entry.arguments?.getString("slug").orEmpty()
                LaunchedEffect(slug) { vm.open(slug) }
                ArticleScreen(vm, slug, prefs.fontScale)
            }
        }
    } }
}

@Composable private fun MenuButton(text: String, icon: ImageVector, action: () -> Unit) {
    OutlinedButton(onClick = action, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Icon(icon, null); Spacer(Modifier.width(12.dp)); Text(text) }
}
@Composable fun StatusPanel(text: String, retry: (() -> Unit)? = null) {
    Surface(Modifier.fillMaxWidth().padding(vertical = 12.dp), color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.large) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { Text(text); retry?.let { Button(onClick = it) { Text("إعادة المحاولة") } } }
    }
}
@Composable private fun FeedScreen(vm: ReaderViewModel, title: String, open: (Post) -> Unit) {
    val state by vm.feed.collectAsStateWithLifecycle()
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(title, style = MaterialTheme.typography.headlineSmall); IconButton(onClick = vm::refresh) { Icon(Icons.Default.Refresh, "تحديث") } } }
        if (state.loading && state.posts.isEmpty()) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        state.error?.let { error -> item { StatusPanel(error, vm::refresh) } }
        if (!state.loading && state.error == null && state.posts.isEmpty()) item { StatusPanel("لا توجد مقالات منشورة للعرض حالياً.") }
        items(state.posts, key = Post::id) { post -> PostCard(post) { open(post) } }
        if (state.posts.size < state.total) item { Button(vm::nextPage, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) { Text(if (state.loading) "جارٍ التحميل…" else "تحميل المزيد") } }
    }
}
@Composable private fun PostCard(post: Post, open: () -> Unit) {
    ElevatedCard(onClick = open, modifier = Modifier.fillMaxWidth()) {
        post.imageUrl?.let { AsyncImage(it, "غلاف: ${post.title}", Modifier.fillMaxWidth().height(190.dp), contentScale = ContentScale.Crop) }
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(post.title, style = MaterialTheme.typography.titleLarge)
            post.excerpt?.takeIf(String::isNotBlank)?.let { Text(it, maxLines = 3) }
            Text(listOfNotNull(post.authors?.display_name, publicationDate(post.published_at).takeIf(String::isNotBlank)).joinToString(" — "), style = MaterialTheme.typography.labelMedium)
        }
    }
}
@OptIn(FlowPreview::class)
@Composable private fun ArticleScreen(vm: ReaderViewModel, slug: String, scale: Float) {
    val state by vm.article.collectAsStateWithLifecycle()
    val saved by vm.saved.collectAsStateWithLifecycle()
    val comments by vm.comments.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    val clipboard = LocalClipboardManager.current
    val position = rememberLazyListState()
    val post = state.post
    LaunchedEffect(slug, post?.id) {
        if (post != null) {
            vm.position(slug)?.let { position.scrollToItem(it.item, it.offset) }
            snapshotFlow { position.firstVisibleItemIndex to position.firstVisibleItemScrollOffset }.distinctUntilChanged().debounce(500).collect { (item, offset) -> vm.rememberPosition(slug, item, offset) }
        }
    }
    LazyColumn(state = position, contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        state.error?.let { error -> item { StatusPanel(error) { vm.open(slug) } } }
        if (post != null) {
            if (state.offline) item { StatusPanel("تعذر الاتصال. تقرأ النسخة المحفوظة على جهازك.") }
            item { Text(post.title, style = MaterialTheme.typography.headlineLarge) }
            post.subtitle?.let { item { Text(it, style = MaterialTheme.typography.titleLarge) } }
            item { Text(listOfNotNull(post.authors?.display_name, publicationDate(post.published_at).takeIf(String::isNotBlank), post.reading_minutes?.let { "$it دقيقة قراءة" }).joinToString(" — "), style = MaterialTheme.typography.labelLarge) }
            post.imageUrl?.let { url -> item { AsyncImage(url, "غلاف المقال", Modifier.fillMaxWidth().heightIn(min = 120.dp, max = 360.dp), contentScale = ContentScale.Fit) } }
            item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(onClick = { vm.bookmark(post) }) { Icon(if (saved.any { it.id == post.id }) Icons.Default.Bookmark else Icons.Default.BookmarkBorder, "حفظ المقال أو إزالته") }
                if (post.sharing["webshare"] != false) IconButton(onClick = { runCatching { context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, post.title + "\n" + post.shareUrl) }, "مشاركة المقال")) } }) { Icon(Icons.Default.Share, "مشاركة") }
                if (post.sharing["copy"] != false) IconButton(onClick = { clipboard.setText(AnnotatedString(post.shareUrl)) }) { Icon(Icons.Default.Link, "نسخ رابط المقال") }
            } }
            post.excerpt?.takeIf(String::isNotBlank)?.let { item { Text(it, style = MaterialTheme.typography.titleMedium) } }
            val document = post.content_json
            if (document != null) items(document.content) { node -> SelectionContainer { RichArticleNode(node, scale) } }
            else item { SelectionContainer { Text(Html.fromHtml(post.content.orEmpty(), Html.FROM_HTML_MODE_LEGACY).toString(), fontSize = (19 * scale).sp, lineHeight = (34 * scale).sp) } }
            if (post.sources.isNotEmpty()) item { Text("المصادر والمراجع", style = MaterialTheme.typography.titleLarge) }
            items(post.sources) { source -> Column {
                Text(listOfNotNull(source.title, source.author, source.page?.let { "ص $it" }).filter(String::isNotBlank).joinToString(" — "))
                safeHttps(source.url)?.let { url -> TextButton(onClick = { runCatching { uri.openUri(url) } }) { Text("فتح المصدر") } }
            } }
            if (!state.offline) {
                item { HorizontalDivider(); Text("التعليقات", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 12.dp)) }
                if (comments.loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                comments.error?.let { message -> item { StatusPanel(message) { vm.comments(post.id) } } }
                if (!comments.loading && comments.error == null && comments.rows.isEmpty()) item { Text("لا توجد تعليقات مقبولة حتى الآن.") }
                items(comments.rows, key = PublicComment::id) { comment -> OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(comment.guest_name, fontWeight = FontWeight.Bold)
                    Text(comment.body)
                    Text(comment.created_at.take(10), style = MaterialTheme.typography.labelSmall)
                } } }
                if (comments.rows.size < comments.total) item { TextButton(onClick = { vm.comments(post.id, comments.page + 1) }, enabled = !comments.loading) { Text("تحميل تعليقات أخرى") } }
            }
            item { HorizontalDivider(); Text("حقوق هذا المحتوى محفوظة لكاتبه ومصادره.", Modifier.padding(vertical = 12.dp), style = MaterialTheme.typography.bodySmall) }
            item { Text(PLATFORM_COPYRIGHT, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
