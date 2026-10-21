# Telegram editorial submissions — integration boundary

The existing Railway bot and secure account-linking workflow remain authoritative.
No second bot service, Android bot token, guessed recipient or owner-ID bypass is
introduced. The current reader offers an external public bot link only.

The pending in-app submission workflow must first commit the submission to the
private database queue, then deliver through the existing authorized Telegram
gateway/outbox. Telegram delivery failure must leave the reviewable submission
intact; it must not roll back successful persistence or falsely claim delivery.
Only configured opted-in administrative chats may receive private notifications.
Acceptance creates a draft for an authorized editor; it never publishes directly.
