# AI and Telegram privacy

The public `/privacy` page now describes comments/views, optional AI processing and optional Telegram administration. Do not enable a provider until its terms, regional processing and retention settings have been reviewed and disclosed as appropriate.

Public questions and selected public article excerpts go to the configured provider. Private editorial text is disabled by default and requires the explicit allow_private_editorial owner policy plus current post-update permission and an intentional editor action. Suggestions do not replace the original or publish automatically. Browser messages are component-memory only; each request has no stored conversation history. Closing the window clears them. There is no transcript deletion endpoint because no transcript database is created.

Operational metadata uses hashed temporary subjects and 90-day retention. Public summaries may cache for one day, keyed to source version/model/type and removed on source changes. Telegram linking stores the verified user/session-to-Telegram relationship; unlink is available. Draft state/update/delivery records have a seven-day policy, with processed payloads/sent bodies scrubbed immediately. Link codes are hashed before durable queue storage and expire after five minutes. Telegram has its own cloud retention outside platform control.

Secrets/passwords/PINs/tokens are excluded from application logs, usage and model contexts. Provider/upstream exception bodies are not echoed to visitors. Operational hosting logs can have different retention and must be configured separately. No analytics/tracking claims are made for data that is not measured.
