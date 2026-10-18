# Central settings

`src/lib/control/settings-schema.ts` defines strict Zod settings, database validation independently enforces allowlists/types/bounds and `site_settings.version` prevents stale writes. Updates are transactional and audited by changed key/version rather than whole documents. Existing publishing settings are retained. Restoring defaults changes the form only; saving still needs permission/PIN where applicable.

- identity: name, description, footer, logo/favicon/share media IDs, validated hex palette/dark palette, two approved local fonts, default theme and HTTPS social links.
- home: ordered enabled hero/featured/latest/popular/category/manual sections, bounded counts, published-only curated IDs, empty-section policy. Keyboard-accessible move buttons avoid drag-only interaction.
- publishing: existing Stage 2 defaults, Asia/Aden and fixed 30-day raw view retention.
- comments: enabled, premoderation, replies/depth, rate window/limit, blocked words/emails. Private; public_comment_options returns only display booleans/depth/close policy.
- seo: title suffix and description; per-post metadata still takes precedence.
- security: administrative session maximum age and event/audit retention; OWNER protected.
- maintenance: enabled/message/optional UTC deadline; OWNER protected.

Only identity/home/seo/maintenance settings are public. Secrets are not accepted into settings. Identity asset references also prevent ordinary media deletion. No arbitrary CSS, JavaScript, HTML snippets, remote fonts or executable advertising is accepted. Appearance changes are previewed before approval.

Menus are separate menu_items records with Header/Mobile/Footer/Secondary placement, parent links, ordering and visibility. Internal pages are allowlisted, categories resolve by current slug, external links require HTTPS. Cycles/depth over three are rejected; remove child links before a parent. If no custom menu is configured for a location, existing category navigation remains the fallback.

Media settings expose bounded upload and derivative-quality policy; allowed decoders and absolute pixel/file ceilings remain server protections. Integrations and announcements have their own authorized control pages. Public layouts read validated settings per request; failed reads use known safe identity defaults and do not invent content.

General and visual identity have separate navigation tabs over the same validated/versioned identity document. Media settings now control the application's upload byte ceiling (256 KiB–5 MiB), GIF acceptance and WebP derivative quality (40–95). The private Storage bucket retains its absolute 5 MiB/image-type ceiling; these settings do not permit executable formats or arbitrary processing code. Image decoding, magic inspection and pixel caps remain fixed server protections. The settings are private; a service-only RPC reads the processing policy.
