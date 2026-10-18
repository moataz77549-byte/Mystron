# Media management

The editorial bucket is private. Uploading is authenticated and role-checked; it accepts at most 5 MiB per image and validates magic bytes plus Sharp decoding, dimensions/pixel limits. JPEG, PNG, WebP, AVIF and GIF are accepted when the decoder supports them. SVG/executable content is rejected, regardless of filename or submitted MIME. User filenames are descriptive metadata, not object paths.

Objects use owner UUID / asset UUID / variant. Server registration constrains that namespace; metadata records dimensions, byte size, checksum, animation, alt text, caption and logical folder. Static images receive optimized WebP, thumbnail and social variants. Originals are retained. GIF animation is retained in original/optimized/thumbnail paths; it is not silently flattened, and animated crop is explicitly unavailable.

The browser crop UI supports focus position, zoom, rotation, output size and 16:9, 4:3, 1:1, 9:16 and 1.91:1 ratios. The server revalidates crop bounds and uses Sharp. Each crop creates a separate asset, preserving the source. Maximum output dimension is 4096; extreme ratios may require lowering output width.

Static editorial templates use the Arabic logo, title, section label, source image, identity color and gradient. Canvas exports PNG locally or uploads it as a new asset. Outputs are static even if the source is animated. Animated templates remain deferred.

Authenticated media proxies use the user's RLS-visible metadata. Public proxies require a published reference or visible public catalog/ticker reference and inspect bytes again. Clients never receive a service-role key or a private signed URL for drafts. Public image endpoints currently require a server service-role key for the actual download.

Used assets cannot be deleted: the database checks posts, inline references, authors, categories and ticker records. Unused assets are soft-deleted and immediately hidden by proxy lookup. Stored object bytes are retained for operator recovery; physical purging is deliberately not automatic in this stage. A logical folder changes metadata, not an object's security namespace.

The application limit does not override hosting transport limits. Verify Vercel's actual plan/body limits before enabling the maximum 5 MiB upload; a lower transport limit may require smaller uploads or a future authenticated direct-upload protocol with server inspection. No Vercel upload limit was verified in this session.
