# RBAC permissions

Eight roles: OWNER, SUPER_ADMIN, ADMIN, EDITOR_IN_CHIEF, EDITOR, AUTHOR, MODERATOR, VIEWER. Permissions live in permissions/role_permissions, with allow/deny user overrides in user_permissions. Explicit deny wins over role grants. OWNER is implicit all permissions and cannot be overridden. New permission grants never derive from JWT user_metadata.

| Role            | Default scope                                                           |
| --------------- | ----------------------------------------------------------------------- |
| OWNER           | All; protected from ordinary modification/disable/second-owner creation |
| SUPER_ADMIN     | Broad operations, except reserved owner controls                        |
| ADMIN           | Content, users/invites, settings, analytics/audit, menus/ads            |
| EDITOR_IN_CHIEF | Publishing, editorial catalog, media, moderation, analytics             |
| EDITOR          | Publishing, catalog, media and moderation, preserving Stage 2 behavior  |
| AUTHOR          | Own drafts/unpublished updates/deletion, own media, create/read         |
| MODERATOR       | Comments plus dashboard/notifications                                   |
| VIEWER          | Authorized post reading and dashboard                                   |

Permissions: posts.create/read/update/publish/delete/schedule; categories.manage; authors.manage; media.manage; comments.moderate; users.invite/manage; roles.manage; settings.read/update; security.manage; integrations.manage; analytics.read; audit.read; dashboard.read; notifications.read; menus.manage; announcements.manage; maintenance.manage; backups.read.

roles.manage, security.manage, integrations.manage and maintenance.manage are reserved to OWNER even if a database operator mistakenly adds such a grant to another role. Remaining role grants are configurable in `/admin/roles`; user overrides in `/admin/permissions`. Own/all scopes affect posts and media. Category restrictions require every associated category to be permitted; categoryless posts are allowed only to their creator. Restricted category managers cannot create a new unscoped category or modify outside their assigned categories. Independent author directory management is global when explicitly granted; it does not grant login rights.

A user cannot modify themselves, the OWNER, or a target/role with permissions above the actor. Restricted administrators cannot delegate all categories or categories outside their own scope. Invites assign no rights until confirmed recipient identity accepts the unexpired one-use token. Disabled identities and stored revoked session IDs fail on the next protected request, even if their Auth access JWT remains cryptographically valid. This is application administrative revocation, not a claim of globally terminating access tokens in every external service.
