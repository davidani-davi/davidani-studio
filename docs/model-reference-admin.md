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
