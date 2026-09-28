/**
 * Generation accounting hooks. Every AI generation passes through
 * SmileImageService, which reports started / succeeded / failed here. Nothing
 * listens by default and nothing leaves the device: a future usage-accounting
 * or entitlement backend subscribes with onGenerationEvent().
 *
 * Events never contain photographs, patient names or settings.
 */
export type GenerationEventType = "started" | "succeeded" | "failed";

export interface GenerationEvent {
  type: GenerationEventType;
  requestId: string;
  caseId?: string;
  mode: "preview" | "final";
  timestamp: number;
  /** Set on success, from the server's generation metadata. */
  provider?: string;
  model?: string;
  /** Set on failure: a stable error code, never a raw provider message. */
  errorCode?: string;
}

type Listener = (event: GenerationEvent) => void;
const listeners = new Set<Listener>();

export function onGenerationEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitGenerationEvent(event: GenerationEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Accounting must never break a generation.
    }
  }
}
