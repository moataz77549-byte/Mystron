# Android API mapping

© معتز العلقمي — اليمن، تعز — 2026م

| Native component             | Current API                      | Contract                   | Notes                                       |
| ---------------------------- | -------------------------------- | -------------------------- | ------------------------------------------- |
| Home/feed                    | GET posts                        | PostPage                   | No login or privileged key                  |
| Categories                   | GET categories                   | Envelope<List<Category>>   | Active catalog only                         |
| Filter                       | GET posts?category=              | PostPage                   | Slug encoded by Retrofit                    |
| Search                       | GET posts?q=                     | PostPage                   | Existing Arabic server search               |
| Article                      | GET posts/{slug}                 | Envelope<Post>             | 404 never falls back to cached article      |
| Authors                      | GET authors                      | data array                 | First-page UI currently; pagination pending |
| Author articles              | GET posts?author=                | PostPage                   | Existing shared service                     |
| Images                       | GET media/{id}?variant=optimized | Image bytes                | Coil; no private bucket credentials         |
| Bookmarks / reading position | Room                             | Local Post JSON / position | Explicit device-local persistence           |
| Preferences                  | DataStore                        | Dark mode / font scale     | No network needed                           |

New home/navigation/category-detail/related/author-post APIs are additive, and
require deployment of this branch before clients can rely on them. The current
native feed intentionally relies on the pre-existing published reader endpoints.
Administrative and submission APIs are not yet wired into Android.

Native site-link handoff: `/posts/{slug}` is matched to the HTTPS host in
AndroidManifest and navigated into Compose, with no WebView or authentication.
Canonical published content updates through the shared API as it is requested;
UI features require separate native implementation and new APK builds.
