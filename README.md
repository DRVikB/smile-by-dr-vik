# Smile

An iPad-first cosmetic dentistry visualisation prototype built with Next.js, TypeScript, React and Tailwind CSS.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3006. Without configuration the app uses the labelled demo flow. For AI editing, configure OpenAI below. Use the sample portrait or upload a JPG, PNG or HEIC photo. Camera capture requires permission and HTTPS outside localhost.

## Workflow

Photo → Design → Generate → Compare. The app stores one temporary case in IndexedDB on the current browser. Edit preserves settings; regeneration creates a fresh request; New Smile deletes the local case. Images are resized to a maximum of 2048 pixels and converted to JPEG in the browser, removing original metadata. HEIC uses a lazy-loaded browser decoder. Input files are limited to 25 MB.

There is no patient database, analytics, authentication system or saved server upload. Browser storage persists across sessions until New Smile clears it. The API processes the photo in memory. The supplied sample portrait is AI-generated and does not depict a real patient.

## Demo behaviour

When no provider or OpenAI key is configured, the mock provider returns the original image **unchanged**. Both the comparison and the downloaded image clearly identify demo mode. It does not perform whitening, dental segmentation, shape alteration, clinical assessment or shade detection. Each regeneration has a fresh variation identifier but no pixel change in mock mode. This is deliberate: a generic filter would misleadingly modify skin, lips and untreated teeth.

Downloads include a communication-only disclaimer. Save Image uses browser download behaviour; Safari may show its image/save sheet.

## Connect image editing

`POST /api/generate-smile` accepts:

```ts
{
  originalImage: "data:image/jpeg;base64,...",
  settings: {
    teeth: 8,
    selectedTeeth: [14, 13, 12, 11, 21, 22, 23, 24], // FDI, symmetric
    treatment: "Composite",
    currentShade: "A2",
    targetShade: "B1",
    shape: "Soft Square",
    intensity: 35
  }
}
```

The response contains `{ image, mode, variationId }`. Inputs are validated, requests are size-limited, cross-origin submissions are rejected and responses use `Cache-Control: no-store`.

### Google Gemini — "Nano Banana" (recommended)

The app calls Gemini's `generateContent` image API from the server. Gemini is
the best fit for chairside mockups because it makes precise local edits — it
keeps the patient's real face, lips, skin and untreated teeth and changes only
the selected upper teeth, rather than regenerating the whole face.

Set these **server-only** variables in `.env.local` (or as runtime secrets in
Sites). Get a key at https://aistudio.google.com/apikey.

```ini
SMILE_PROVIDER=gemini
GEMINI_API_KEY=your-secret
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
```

Model / cost options (per image, Sept 2026): `gemini-3.1-flash-image` (default,
~$0.067), `gemini-2.5-flash-image` (cheapest, ~$0.039), `gemini-3-pro-image`
(premium, ~$0.134). Change the model with one env var — no code change.

**Patient-data note.** Smile photos are special-category health data. Use a
**paid / billed** Google Cloud project — do **not** use the free Gemini tier,
which Google may use to improve its products. A `GEMINI_API_KEY` on its own
selects Gemini automatically unless `SMILE_PROVIDER` is set otherwise.

### OpenAI (implemented)

The app now calls OpenAI's `POST https://api.openai.com/v1/images/edits` directly from the server. The default model is `gpt-image-2` (set `gpt-image-1-mini` for the cheapest option), following OpenAI's [image-generation guide](https://platform.openai.com/docs/guides/images). It sends one original image and the dental settings as an editing instruction, requests a high-quality JPEG, and preserves the source aspect ratio using supported image-size increments. The original photograph is always retained separately.

Set these **server-only** variables in `.env.local`, or as runtime settings in Sites:

```ini
SMILE_PROVIDER=openai
OPENAI_API_KEY=your-secret
OPENAI_IMAGE_MODEL=gpt-image-2
```

Mark `OPENAI_API_KEY` as a secret in Sites and deploy to apply it. Never use a `NEXT_PUBLIC_` key. A key by itself also selects OpenAI automatically unless `SMILE_PROVIDER` is explicitly set. Use `SMILE_PROVIDER=mock` to deliberately return to offline demonstration mode.

The connected OpenAI account needs access to the model and API billing/credits; organization verification may be required. The endpoint returns clear errors for missing/invalid credentials, model access, insufficient API credits, rate limits and unavailable images. A failed live request **never** silently substitutes the original photograph or a mock. Requests are not automatically retried, to avoid repeat charges. The upstream timeout is four minutes; cancelling aborts the local request but cannot guarantee an already-running provider job incurs no charge.

During live generation the photo is sent to OpenAI for processing. This app does not save server uploads; local case storage and OpenAI's data-handling terms are distinct. Test with the supplied synthetic sample before patient use. Prompts aim to preserve identity and untreated anatomy but do not guarantee pixel-exact or clinical fidelity.

Before/after display compensates for small output-size rounding. Substantially changed aspect ratios are rejected instead of stretching the face to fit.

### Alternative provider

Implement `SmileImageProvider` in `src/lib/generation/provider.ts`, or use the optional generic HTTP adapter with `SMILE_PROVIDER=http`, `SMILE_PROVIDER_URL` and `SMILE_PROVIDER_API_KEY`. It posts `{ originalImage, settings, instruction, variationId }` with a bearer token and expects `{ image: "data:image/jpeg;base64,..." }`.

`src/lib/generation/prompt.ts` requests identity, lips, skin, gingiva, lighting, framing, background and untreated-teeth preservation. It only targets the symmetric selected upper teeth. These are provider instructions, not a verified guarantee of anatomical preservation. A live provider must be evaluated for fidelity, appropriate image handling and clinical communication before use with patients.

## Project structure

- `src/app/page.tsx`: three-screen workflow and request lifecycle.
- `src/components/`: AppShell, PhotoUploader, PatientPhoto, SegmentedControl, ShadeSelector, ShapeSelector, ResultIntensitySlider, GenerateButton, GenerationState, BeforeAfterSlider, BottomActionBar and Disclaimer.
- `src/lib/photos.ts`: browser conversion and image preparation.
- `src/lib/storage.ts`: serialised IndexedDB persistence.
- `src/lib/generation/`: input schema, provider interface, preservation prompt and shared Web API handler.
- `src/lib/download.ts`: downloadable image with disclaimer.
- `src/lib/useSmileTools.ts`: optional, feature-detected WebMCP read/configure tools. No photograph is exposed through these tools.

## Validate and build

```sh
npm test
npm run typecheck
npm run build
```

The production build creates a normal Next.js build and a small Sites-compatible Worker bundle in `dist/`. The hosted build serves Next's prerendered client page and browser assets, and runs the same generation handler at the edge. Next.js development and `npm start` use the native API route. This bridge fits the current single-page client workflow; adding dynamic server-rendered pages would require a full Next.js hosting adapter.

For a standalone Next.js deployment use `npm run build:next` and `npm start`.

## Verification of OpenAI integration

Automated adapter tests use a fake HTTP transport and never spend API credits. They verify multipart image uploads, model settings, prompt content, result handling, access/billing errors and cancellation. A real generated-image fidelity test is pending secure API-key configuration.

## Scope

A visual communication MVP only. No authentication screens, clinical CAD, patient records, gingival editing, billing, lab workflows or practice-management integration.
