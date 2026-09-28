# Cloudflare deployment

SmileCompose is hosted at https://smile-by-dr-vik.drvik.workers.dev in the DrVik Cloudflare account.

## Deployment

```sh
npm ci
npx wrangler login
npm run deploy:cloudflare
```

The deploy command builds the current source before uploading it. A deployment does not push changes to GitHub or automatically deploy later Git commits. Netlify remains configured as a separate hosting option.

For Cloudflare Workers Builds connected to GitHub, use this project folder as the root, `npm run build:cloudflare` as the build command, and `npx wrangler deploy` as the deploy command. Select the branch containing these changes. Runtime secrets belong in Worker settings, not browser variables or Git.

## Runtime configuration

Already configured for the first Cloudflare deployment:

| Variable | Location | Value |
| --- | --- | --- |
| `SMILE_PROVIDER` | `wrangler.jsonc` | `gemini` |
| `GEMINI_IMAGE_MODEL` | `wrangler.jsonc` | `gemini-3.1-flash-image` |
| `SMILE_GEMINI_API_KEY` | Encrypted Cloudflare Worker secret | Your Google API key; no value in this repository |

To rotate the server key, run this and enter it at the prompt:

```sh
npx wrangler secret put SMILE_GEMINI_API_KEY
```

Never prefix a key with `NEXT_PUBLIC_`. `.env*`, `.dev.vars*` and `.wrangler/` are ignored by Git. `.env.example` contains names only. The existing optional OpenAI and HTTP adapters are unchanged; they are not selected on Cloudflare.

## Architecture

- Next.js still builds the app. Its current workflow is a prerendered client application on one URL.
- Cloudflare serves the browser files and runs the same generation and pricing handlers used by the Next.js API routes, at `/api/generate-smile` and `/api/generation-cost`.
- This reuses the existing edge deployment bridge rather than running a full Next.js server. If future work adds dynamic server-rendered routes, Server Actions, or Next Image optimization, adopt a full Cloudflare Next.js adapter or extend and test the bridge.
- `scripts/cloudflare-worker.ts` adds atomic duplicate-request protection. A SQLite Durable Object stores only a claimed timestamp for a random request ID, with an alarm to delete it after 24 hours. A failed guard blocks generation rather than risking another paid request.
- The Worker does not persist patient images or log request/response bodies. It forwards generation inputs to the selected AI provider. Browser case storage retains its existing behaviour.
- The service worker is served with `Cache-Control: no-cache`; it does not cache patient photographs or generated results.

## Local checks without AI charges

```sh
npm run preview:cloudflare
# In another terminal:
npm run test:cloudflare
```

Preview explicitly uses `SMILE_PROVIDER=mock`. The runtime checker refuses to generate unless the pricing endpoint confirms mock mode. It verifies the page, assets, PWA files, methods, cross-origin rejection, and concurrent duplicate submissions. Normal source checks remain `npm run lint`, `npm test`, and `npm run typecheck`.

## Moving from Netlify on an iPad or iPhone

Open the new Cloudflare address in Safari and add that address to the Home Screen. An existing Netlify Home Screen icon will continue opening Netlify.

Browser storage is separate for each website address. Existing Netlify cases and the current photo are not automatically transferred. Keep the old site available while moving anything needed. The reference case library has Export/Import controls for transferring your own finished cases; save any needed patient reports from the old site's case log separately.

No custom-domain DNS or existing Netlify deployment was changed.

## Deployment verification — 25 September 2026

- Production build, lint, 170 unit tests and production asset/secret checks passed.
- Cloudflare runtime checks passed, including concurrent duplicate-request protection.
- The live site and pricing API returned HTTP 200; the encrypted Gemini secret is present.
- One paid 512px generation using the bundled sample photo returned a live image successfully through Cloudflare. No patient photograph was used for verification.
- Hosted WebKit checks passed at 390×844, 844×390, 820×1180 and 1180×820: demo generation, Slide/Overlay, consultation open/close, no horizontal overflow and case restoration after refresh.
- Physical iOS camera, sharing and installed Home Screen behaviour still require on-device testing.
