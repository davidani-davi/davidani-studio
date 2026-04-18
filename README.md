# Davi & Dani Photo Studio

An internal web app that turns iPhone product photos into Zara-style product shots using AI image-editing models. Built for a small team — single shared password, one-click Vercel deploy, pay-per-image pricing.

## What it does

1. Team member logs in with a shared password.
2. Uploads iPhone reference photos (garment, back view, swatches, etc.).
3. Picks which references to use, picks a model / aspect ratio / resolution.
4. Writes a prompt (or uses a preset like "Zara product shot") and hits **Start Generation**.
5. Downloads one or all variants.

All generations are logged to the user's browser history (localStorage) and cached on fal.ai's CDN.

## Stack

- **Next.js 14** (App Router, TypeScript, Tailwind)
- **fal.ai** as the image-generation backend — single API for Nano Banana (Google Gemini edit), Seedream 4.5, and GPT Image
- **Edge-runtime cookie auth** (no database; shared password → HMAC-signed cookie)
- **Vercel** for hosting (free tier is plenty for a small team)

## Cost

All generation costs are pass-through from fal.ai. Typical rates (check [fal pricing](https://fal.ai/pricing) for current):
- Nano Banana edit — ~$0.03 / image
- Seedream 4.5 edit — ~$0.03 / image
- GPT Image (BYOK) — uses *your* OpenAI key, billed on OpenAI

Vercel hobby plan + shared password = $0 hosting.

## Local setup

```bash
cp .env.example .env.local
# fill in:
#   APP_PASSWORD    → pick anything your team will remember
#   AUTH_SECRET     → any 32+ char random string (e.g. `openssl rand -hex 32`)
#   FAL_KEY         → from https://fal.ai/dashboard/keys

npm install
npm run dev
```

Visit http://localhost:3000 → login → start generating.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com), click **New Project** → import the repo.
3. Under **Environment Variables** add all three from `.env.example`:
   - `APP_PASSWORD`
   - `AUTH_SECRET`
   - `FAL_KEY`
4. Click **Deploy**. Share the URL + password with your team.

## Adding / swapping models

All model configuration lives in `lib/models.ts`. To add a new fal.ai model:

```ts
"my-new-model": {
  id: "my-new-model",
  label: "My New Model",
  badge: "V1",
  endpoint: "fal-ai/some/other/endpoint",
  inputShape: "image_urls", // or "image_urls_seedream" | "gpt"
  description: "…",
},
```

Then add rendering logic in `lib/fal.ts` if the new endpoint expects a different input shape.

## Rotating the team password

Set a new `APP_PASSWORD` in Vercel → **Settings → Environment Variables** → redeploy. All existing sessions continue to work until the cookie expires (30 days) because the signing secret (`AUTH_SECRET`) is unchanged. Rotating `AUTH_SECRET` invalidates all sessions immediately.

## File structure

```
app/
  api/auth/route.ts       ← login (POST password) / logout (DELETE)
  api/upload/route.ts     ← uploads iPhone photos → fal.ai storage
  api/generate/route.ts   ← calls fal.ai with prompt + references
  login/page.tsx          ← password page
  page.tsx                ← main Studio UI
components/
  Sidebar.tsx             ← model / aspect / resolution / reference chips
  PromptPanel.tsx         ← prompt editor + presets + generate button
  OutputPanel.tsx         ← gallery + history + download
lib/
  auth.ts                 ← HMAC cookie helpers
  fal.ts                  ← fal.ai client + upload + generate
  models.ts               ← model catalog
middleware.ts             ← redirects unauthed users to /login
```

## Security notes

- The team password is compared server-side only, never exposed to the client.
- The fal.ai key is never sent to the browser; all generation requests are proxied through `/api/generate`.
- Rate limiting is not built in — if the password leaks, anyone could rack up fal.ai usage. Keep it off public surfaces and rotate if needed.
