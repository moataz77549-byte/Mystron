# Guest submissions — pending implementation

There is currently no guest submission queue API or native submission form.
The public Telegram button opens `https://t.me/Moatazbotai4bot`; it does not save
an editorial request and must not be presented as the in-app submission workflow.

Required implementation remains: a private RLS-protected queue, limited public
creation transport, cryptographic receipt/idempotency, honeypot and rate limiting,
validated private attachments, contact-data access permissions and retention,
review states with optimistic concurrency, and a transactional conversion to an
unpublished CMS draft through the existing publishing boundary. Public clients
must never change review status or read other senders' contact data.

Any queue migration belongs to this feature branch's own tested migration release;
it must not be silently added to PR #4's armed six-migration production batch.
