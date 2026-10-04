import { NATIVE_API_ORIGIN } from "@/config/app";
import { isNativeApp } from "@/native/platform";
import { onWorkspaceDetach } from "@/lib/workspace";
import { imageSchema } from "@/lib/generation/schema";

const STAGING = "https://smile-by-dr-vik-staging.drvik.workers.dev";
export const diagnosticViewingAllowed = (c: { harness?: string; diagnostics?: string; native: boolean; staging: boolean }) =>
  c.harness === "1" && c.diagnostics === "1" && c.native && c.staging;
type Dimensions = { width: number; height: number };
type Ticket = { revision: number; current: () => boolean };
type Inspection = { requestId: string; original: string; raw: string; dimensions: Dimensions; normalized?: string; final?: string;
  rejected: boolean; stage?: string; reason?: string };

/** Ephemeral inspection only: deliberately has no storage, network, case or result API. */
export class UnvalidatedOutputStore {
  // This store is mounted only in the owner's private diagnostic build.
  // Inspection stays on across source/case changes and app relaunches.
  private optedIn = true;
  private revision = 0;
  private active?: { ticket: Ticket; requestId: string; original: string; started: number };
  private images: Inspection | null = null;
  private currentContext?: { caseId: string; source: string };
  changed: () => void = () => {};
  constructor(private decode: (image: string) => Promise<Dimensions>, private now = Date.now) {}
  context(next: { caseId: string; source: string }) {
    if (this.currentContext?.caseId !== next.caseId || this.currentContext?.source !== next.source) this.clear();
    this.currentContext = next;
  }
  enable(value: boolean) { this.optedIn = value; this.clear(); }
  clear() { this.revision++; this.active = undefined; this.images = null; this.changed(); }
  begin(requestId: string, original: string, current: () => boolean): Ticket | null {
    if (!this.optedIn || !this.currentContext || !current()) return null;
    this.clear(); const ticket = { revision: this.revision, current };
    this.active = { ticket, requestId, original, started: this.now() }; return ticket;
  }
  private valid(ticket: Ticket) {
    return this.active?.ticket === ticket && ticket.revision === this.revision && ticket.current() && this.now() - this.active.started <= 600000;
  }
  async raw(ticket: Ticket, image: string): Promise<boolean> {
    if (!this.valid(ticket) || !imageSchema.safeParse(image).success) return false;
    let dimensions: Dimensions;
    try { dimensions = await this.decode(image); } catch { return false; }
    if (!this.valid(ticket) || dimensions.width <= 0 || dimensions.height <= 0 || dimensions.width * dimensions.height > 40000000) return false;
    this.images = { requestId: this.active!.requestId, original: this.active!.original, raw: image, dimensions, rejected: false };
    this.changed(); return true;
  }
  normalized(ticket: Ticket, image: string) {
    if (this.valid(ticket) && this.images) { this.images.normalized = image; this.changed(); }
  }
  final(ticket: Ticket, image: string) {
    if (this.valid(ticket) && this.images && !this.images.rejected) { this.images.final = image; this.changed(); }
  }
  reject(ticket: Ticket, failure: { stage?: string; reason?: string }) {
    if (!this.valid(ticket) || !this.images) return;
    this.images.rejected = true; delete this.images.final;
    this.images.stage = failure.stage; this.images.reason = failure.reason;
    this.changed();
  }
  snapshot(): Inspection | null {
    if (this.active && !this.valid(this.active.ticket)) this.clear();
    return this.images ? { ...this.images, dimensions: { ...this.images.dimensions } } : null;
  }
}

let inspector: UnvalidatedOutputStore | null = null;
export const getUnvalidatedOutputInspector = () => inspector;
export const updateUnvalidatedOutputContext = (caseId: string, source: string) => inspector?.context({ caseId, source });

/** Added to the existing private QA panel; never mounted in ordinary/distribution builds. */
export function installUnvalidatedOutputControls(panel: HTMLElement): () => void {
  if (!diagnosticViewingAllowed({ harness: process.env.NEXT_PUBLIC_SMILE_QA_PHYSICAL_HARNESS,
    diagnostics: process.env.NEXT_PUBLIC_SMILE_QA_DIAGNOSTICS, native: isNativeApp(), staging: NATIVE_API_ORIGIN === STAGING })) return () => {};
  const store = new UnvalidatedOutputStore(async value => {
    const image = new Image(); image.src = value; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  inspector = store;
  const controls = document.createElement("div"), label = document.createElement("label"), optIn = document.createElement("input"), view = document.createElement("button");
  optIn.type = "checkbox"; optIn.checked = true; optIn.setAttribute("aria-label", "Inspect unvalidated output in memory");
  label.append(optIn, " Inspect returned images for every photo (private diagnostics only)");
  Object.assign(label.style, { display: "inline-flex", alignItems: "center", minHeight: "44px", gap: "8px" });
  view.type = "button"; view.textContent = "View unvalidated output"; view.hidden = true;
  Object.assign(view.style, { minHeight: "44px", padding: "8px", margin: "3px", border: "1px solid #876e41", borderRadius: "8px" });
  controls.append(label, view); panel.append(controls);
  let dialog: HTMLDialogElement | undefined, expiry: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (dialog) { for (const img of dialog.querySelectorAll("img")) img.removeAttribute("src"); dialog.remove(); dialog = undefined; }
  };
  store.changed = () => {
    const entry = store.snapshot();
    view.hidden = !entry;
    if (view.hidden) close();
    // Show the actual rejected response immediately, before another action can
    // replace it. It remains diagnostic-only; the normal rejection still throws.
    else if (entry?.rejected && !dialog) view.click();
    if (expiry) clearTimeout(expiry);
    if (!view.hidden) expiry = setTimeout(() => store.clear(), 600000);
  };
  optIn.onchange = () => store.enable(optIn.checked);
  view.onclick = () => {
    const entry = store.snapshot(); if (!entry) return;
    close(); dialog = document.createElement("dialog"); dialog.setAttribute("aria-label", "Unvalidated output — debugging only");
    Object.assign(dialog.style, { position: "fixed", inset: "12px", width: "calc(100% - 24px)", maxWidth: "none", maxHeight: "calc(100% - 24px)", margin: "auto", padding: "16px", border: "2px solid #876e41", background: "#fff", color: "#111", zIndex: "100001", overflow: "auto" });
    const title = document.createElement("h2"); title.textContent = "Unvalidated output — debugging only. Not a treatment preview.";
    const receipt = document.createElement("p"); receipt.textContent = `Request ${entry.requestId} · ${entry.stage ?? "validation completed"} · ${entry.reason ?? "No rejection recorded"}`;
    const dismiss = document.createElement("button"); dismiss.textContent = "Close and clear images"; dismiss.type = "button";
    Object.assign(dismiss.style, { minHeight: "44px", padding: "8px" });
    dismiss.onclick = () => store.clear();
    dialog.addEventListener("cancel", e => { e.preventDefault(); store.clear(); });
    dialog.append(title, receipt, dismiss);
    const grid = document.createElement("div"); Object.assign(grid.style, { display: "flex", flexWrap: "wrap", gap: "16px" });
    const images = [["Original photograph", entry.original], ["Raw provider output", entry.raw],
      ...(entry.normalized ? [["Normalised output", entry.normalized]] : []), ...(entry.final ? [["Final composite (validation passed)", entry.final]] : [])];
    for (const [name, url] of images) {
      const figure = document.createElement("figure"); Object.assign(figure.style, { flex: "1 1 280px", minWidth: "0", margin: "0" });
      const caption = document.createElement("figcaption"); caption.textContent = name;
      const viewport = document.createElement("div"); Object.assign(viewport.style, { overflow: "auto", maxHeight: "65vh", background: "#202020" });
      const image = document.createElement("img"); image.src = url; image.alt = name;
      Object.assign(image.style, { display: "block", width: "100%", height: "auto", maxWidth: "none", objectFit: "contain" });
      viewport.append(image); figure.append(caption);
      let zoom = 1;
      for (const [text, delta] of [["Zoom out", -0.5], ["Zoom in", 0.5]] as const) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.setAttribute("aria-label", `${text}: ${name}`);
        Object.assign(button.style, { minHeight: "44px", padding: "8px", margin: "4px" });
        button.onclick = () => { zoom = Math.max(1, Math.min(4, zoom + delta)); image.style.width = `${zoom * 100}%`; };
        figure.append(button);
      }
      figure.append(viewport); grid.append(figure);
    }
    dialog.append(grid); document.body.append(dialog); dialog.showModal();
  };
  const detach = onWorkspaceDetach(() => store.clear());
  return () => { detach(); store.clear(); if (expiry) clearTimeout(expiry); controls.remove(); if (inspector === store) inspector = null; };
}
