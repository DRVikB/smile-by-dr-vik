import { generationSchema } from "@/lib/generation/schema";
import {
  generateSmile,
  getSmileProvider,
  type ProviderEnvironment,
} from "@/lib/generation/provider";
export async function handleGenerationRequest(
  request: Request,
  env?: ProviderEnvironment,
) {
  const headers = { "Cache-Control": "no-store" };
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json(
      { error: "Send a photo and settings as JSON." },
      { status: 415, headers },
    );
  const origin = request.headers.get("origin");
  // Next may use its bind address internally; the browser-facing Host remains authoritative.
  let sameOrigin = !origin;
  if (origin) {
    try {
      const source = new URL(origin);
      sameOrigin =
        source.origin === new URL(request.url).origin ||
        source.host === request.headers.get("host");
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json(
      { error: "This request could not be verified." },
      { status: 403, headers },
    );
  // Cap the body before decoding to avoid buffering an arbitrarily large upload.
  let raw = "";
  let bytes = 0;
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader)
    return Response.json(
      { error: "A photo is required." },
      { status: 400, headers },
    );
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8_100_000) {
        await reader.cancel();
        return Response.json(
          { error: "Photo is too large. Please try a smaller image." },
          { status: 413, headers },
        );
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch {
    return Response.json(
      { error: "The photo could not be received. Please try again." },
      { status: 400, headers },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "The request could not be read." },
      { status: 400, headers },
    );
  }
  const parsed = generationSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Check the photo and design selections, then try again." },
      { status: 400, headers },
    );
  try {
    return Response.json(
      await generateSmile(parsed.data, request.signal, getSmileProvider(env)),
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          "We couldn’t create your preview. Your photo and selections are safe — please try again.",
      },
      { status: 502, headers },
    );
  }
}
