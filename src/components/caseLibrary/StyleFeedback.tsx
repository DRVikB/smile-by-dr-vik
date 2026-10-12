"use client";
import { useState } from "react";
import { useAccount } from "@/components/account/AccountProvider";
import type { GenerationResult } from "@/lib/types";
import { sendStyleFeedback } from "@/services/caseLibrary/caseLibraryApi";

/**
 * Optional: "Does this reflect your style?" Saved to the clinician's own
 * account to review how well references match. Never sent to the AI
 * provider and never used to train a model.
 */
export function StyleFeedback({ result }: { result: GenerationResult }) {
  const account = useAccount();
  // One card per design. The answer belongs to that design, so a new result starts by asking again
  // (tracked here rather than by remounting, which had left earlier cards behind in the panel).
  const design = result.requestId ?? result.variationId ?? "";
  const [answer_, setAnswer] = useState<{ design: string; state: "saving" | "done" | "hidden" } | null>(null);
  const state: "ask" | "saving" | "done" | "hidden" = answer_?.design === design ? answer_.state : "ask";
  const setState = (next: "saving" | "done" | "hidden") => setAnswer({ design, state: next });
  const count = result.preferences?.styleReferenceCount ?? result.styleReferencesUsed?.count ?? 0;
  if (state === "hidden" || !count) return null;

  async function answer(rating: "yes" | "not_quite") {
    setState("saving");
    try {
      const token = await account.getAccessToken();
      if (token && result.requestId) await sendStyleFeedback(token, result.requestId, rating, count);
      setState("done");
    } catch {
      setState("done"); // optional feedback never interrupts the clinician
    }
  }

  return (
    <div className="style-feedback" role="group" aria-label="Style feedback">
      <p><span>Your style</span>{count} Case Library {count === 1 ? "reference was" : "references were"} used for this design.</p>
      {state === "done"
        ? <p className="style-feedback-thanks" role="status">Thanks — noted.</p>
        : account.user && (
          <div className="style-feedback-row">
            <span>Does this reflect your style?</span>
            <button type="button" className="secondary-button" disabled={state === "saving"} onClick={() => void answer("yes")}>Yes</button>
            <button type="button" className="secondary-button" disabled={state === "saving"} onClick={() => void answer("not_quite")}>Not quite</button>
          </div>
        )}
    </div>
  );
}
