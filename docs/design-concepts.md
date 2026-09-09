# Original garment concepts

`POST /api/design-concepts` accepts a persistent UUID, title, original designer
`direction`, and `targetMonth` (YYYY-MM). It creates a new garment presentation:
colored front/back flats and construction details, not a model wearing an
existing product. The caller is Faire Daily's authenticated design workspace.

The route requires X-DDTO-TOKEN matching MODEL_SHOTS_TOKEN or APP_PASSWORD.
Provider keys stay server-side. Inputs and result metadata are encrypted in
Blob; generated PNGs use opaque paths. AUTH_SECRET (or APP_PASSWORD fallback)
must remain stable to read earlier records. No changes to model-photo routes.

The fixed engine is fal-ai/nano-banana-pro, one image, 2:3, requested 2K PNG.
Provider output is saved unchanged; its actual dimensions are recorded. Schema
and queue behavior were checked against the [official model API](https://fal.ai/models/fal-ai/nano-banana-pro/api).

An immutable intent is reserved before a paid call. Exactly one caller submits;
replaying the same ID returns its existing state. Different content under that
ID is rejected. The submission uses raw fetch without automatic POST retries.
Unknown acceptance remains uncertain, never a reason to bill for another render.
Provider handles and results are separate immutable records. Failed polling is
not a failed generation. Image persistence can be retried without re-generating.

Production submissions include a completion callback. The callback URL carries
an HMAC capability scoped to that job. Incoming payloads are ignored: the server
polls its own saved provider handle and persists the verified result. This is a
wakeup mechanism, not trust in a caller-supplied image or status. Repeated callbacks
are idempotent. Nonterminal/unavailable states respond 503 so the provider retries.
Callback behavior follows the [official queue webhook protocol](https://fal.ai/docs/documentation/model-apis/inference/webhooks).

`GET /api/design-concepts?id=...` also polls/reconciles the same job. Terminal
records include `completionSource` so live callback persistence can be verified
without confusing it with browser-triggered persistence. Local requests omit the
production callback; their result is retrieved by polling. A prolonged Blob outage
right after provider acceptance can still leave an uncertain handle and needs
operator investigation; never blindly create a new generation in that case.

Validation: 738 tests plus production build pass. A real saved Faire Daily brief
created one real provider render through the local built route. Arc Quilt output
1696×2528 PNG is retained in the Faire repo at
`output/design-concepts/arc-quilt/`; this is independent exploration, not a
competitor-sales claim. It has coherent front/back garment views and details;
lining reveal and quilting still need designer/pattern-maker review.

Local gotcha: keep pulled production env files OUTSIDE the Next project and load
them into the process. Next's dotenv expansion altered a literal password when
a pulled .env.production.local lived inside the project. No secret value was
changed on Vercel. The failed local auth attempt was checked as 404 before the
same saved request was recovered; one paid render was submitted.

Production verified September9: PR7 merged7abf261. Arc Barrel
267d8bb9-d7da-4516-b7dc-8f4694c58934 saved a1696×2528 PNG at
2026-09-09T22:02:49.650Z with completionSource=callback. The result record was
read directly from encrypted storage before client polling, proving app-closed
completion. Faire Daily2.25.0 reads both real concepts successfully.
