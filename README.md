# Smile

An iPad-first cosmetic dentistry visualisation prototype built with Next.js, TypeScript, React and Tailwind CSS.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3006. No API key is required. Use the sample portrait or upload a JPG, PNG or HEIC photo. Camera capture requires permission and HTTPS outside localhost.

## Workflow

Photo → Design → Generate → Compare. The app stores one temporary case in IndexedDB on the current browser. Edit preserves settings; regeneration creates a fresh request; New Smile deletes the local case. Images are resized to a maximum of 2048 pixels and converted to JPEG in the browser, removing original metadata. HEIC uses a lazy-loaded browser decoder. Input files are limited to 25 MB.

There is no patient database, analytics, authentication system or saved server upload. Browser storage persists across sessions until New Smile clears it. The API processes the photo in memory. The supplied sample portrait is AI-generated and does not depict a real patient.

## Demo behaviour

The default mock provider returns the original image **unchanged**. Both the comparison and the downloaded image clearly identify demo mode. It does not perform whitening, dental segmentation, shape alteration, clinical assessment or shade detection. Each regeneration has a fresh variation identifier but no pixel change in mock mode. This is deliberate: a generic filter would misleadingly modify skin, lips and untreated teeth.

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

Implement `SmileImageProvider` in `src/lib/generation/provider.ts`, or enable the included HTTP adapter through server-only environment variables in `.env.local`:

```ini
SMILE_PROVIDER=http
SMILE_PROVIDER_URL=https://your-provider.example/api/edit
SMILE_PROVIDER_API_KEY=your-secret
```

The HTTP adapter posts `{ originalImage, settings, instruction, variationId }` with a bearer token and expects `{ image: "data:image/jpeg;base64,..." }`. It is an integration contract, not a direct adapter for a particular AI vendor. Keys must never be exposed through `NEXT_PUBLIC_` variables. An invalid configured provider returns a recoverable error rather than silently using the mock. Hosted secrets use Sites environment variables.

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

## Scope

A visual communication MVP only. No authentication screens, clinical CAD, patient records, gingival editing, billing, lab workflows or practice-management integration.
