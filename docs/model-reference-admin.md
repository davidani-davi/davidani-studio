# Model & pose reference admin

Open `/admin/models` on the Studio site and sign in with the Studio password. The Model & pose picker in the extension and phone Daily app links here through **Manage references**.

## Add a model and its poses

1. Choose **Add model**, enter a name and optional group (Celine, Vision, or a new identity).
2. Choose **Add pose set**, name the pose, and select the framing of its front, side and back photos.
3. Upload each image into its **Front**, **Side**, **Back** or **Full** slot. Full is the full-body reference.
4. For photos showing a face, place the protection line below the entire face and above the garment, check the review box, and save. Simple garment swap preserves the original pixels above that line. Back/pants-only images can leave this unchecked; a back image with a visible profile can also enable protection.
5. Return to Model Studio. Its catalog refreshes on focus; the extension/Daily picker also has **Refresh models**.

New poses can be added independently to existing models. A pose enters the public picker once it has a photo. Missing views remain unavailable; another angle is never substituted. The existing built-in sets also have **Tops**, **Pants**, and **Full body** framing variants. Select the framing before replacing a photo. Replacing the Full slot always updates the full-body reference.

## Replace or remove

**Replace photo** updates one slot without changing the other angles. Original opens the stored source image. **Remove** clears that slot. A replacement uses a fresh URL, so old browser caches cannot display the previous file. If another session has already changed the slot, refresh before saving.

**Delete pose** retires that pose; select it in the pose menu and choose **Restore pose** to recover it. **Delete model** moves the model into **Trash**; select it there and choose **Restore model**. Existing generated images are retained. Deletion is reversible: original source files and change records are retained, not physically erased.

## Storage and validation

Production uses the existing Vercel Blob store. Individual immutable change records merge updates to different slots without overwriting the whole catalog. The admin API requires a Studio session, checks request origin for writes, and accepts only uploads belonging to this store. Files must decode as a still PNG/JPEG/WebP, at most 20 MB, 4096 pixels per edge and 20 megapixels. Sources are not resized or sharpened. Face boundaries are bound to the decoded source dimensions and pixel SHA-256.

With no Blob token, development stores changes in `.data/model-admin` and photos in `public/user-assets/model-admin/photos`; neither belongs in a production deployment. The local-only `scripts/test-model-admin.cjs` exercises the real API and UI; its header describes the test server and input variables. `npm test` covers catalog merging, routing, authorization, stale updates, invalid uploads, and reviewed protection.

## Library navigation

Tops, Bottoms and All references filter the sidebar. The curated pants/shorts
collection and custom waist-down pose sets appear in Bottoms. Cropped and full
body model references appear in Tops. A custom model with both pose types can
appear in both, with the matching pose selected. Classification uses reference
framing, never the garment a full-body model happens to wear.

Bottoms have Front, Side and Back slots. Tops retain all four views. Search is
scoped to the selected category; Trash is separate. Select Edit model details
or Edit pose details to rename, delete or restore an entry. Adding a waist-down
pose automatically opens Bottoms. Model IDs, photos and generation stay intact.

The sidebar uses fixed minimum row heights with its own scrolling list, keeping
thumbnails, wrapped names, search and actions readable on desktop and phone.
`npm test`, `npm run build`, `scripts/test-model-library.cjs` (Chromium/WebKit)
and `scripts/test-model-admin.cjs` validate filtering and editing behavior.
