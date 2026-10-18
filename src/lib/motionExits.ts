/**
 * Leaving animations for every sheet, panel and passing notice, in one place.
 *
 * React removes an overlay the moment its state closes it, which reads as a jump. When one of the
 * surfaces below is removed, the same element is put back where it was for a moment, inert and marked
 * `is-leaving`, so motion.css can play it out (a sheet slides down, a centred panel settles back, a notice
 * fades), and is then removed for good. It can't be clicked, focused or read while it leaves, so it never
 * reaches the component that owned it.
 *
 * Skipped with Reduce Motion, while SmileCompose is out of sight (patient photos must go at once, before
 * the app switcher's snapshot), for an element that already played its own exit (`data-no-exit`, e.g. a
 * sheet that hands over to the next one), and for anything inside a whole screen being replaced.
 */

const SURFACES = [
  ".sheet-backdrop", ".settings-backdrop", ".cl-backdrop", ".action-sheet-backdrop", ".log-detail-backdrop",
  // Floating notices only: one in the page's flow would hold its space while it fades and nudge the layout.
  ".settings-toast",
].join(", ");

/** How long a leaving surface stays (the longest exit in motion.css, plus a frame). */
const EXIT_MS = 320;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function playOut(node: HTMLElement, parent: Node, next: Node | null) {
  if (!parent.isConnected || node.dataset.noExit !== undefined || node.classList.contains("is-leaving")) return;
  node.setAttribute("inert", "");
  node.setAttribute("aria-hidden", "true");
  node.dataset.noExit = "";
  node.classList.add("is-leaving");
  try { parent.insertBefore(node, next && next.parentNode === parent ? next : null); }
  catch { return; }
  window.setTimeout(() => node.remove(), EXIT_MS);
}

let installed = false;

export function installExitAnimations(): void {
  if (installed || typeof MutationObserver === "undefined") return;
  installed = true;
  new MutationObserver(records => {
    if (document.visibilityState === "hidden" || reducedMotion()) return;
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node instanceof HTMLElement && node.matches(SURFACES) && !node.isConnected) playOut(node, record.target, record.nextSibling);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Thumbnails fade in once their pixels have arrived (motion.css), rather than popping in half-drawn.
  const loaded = (img: HTMLImageElement) => { img.dataset.loaded = ""; };
  document.addEventListener("load", event => { if (event.target instanceof HTMLImageElement) loaded(event.target); }, true);
  document.addEventListener("error", event => { if (event.target instanceof HTMLImageElement) loaded(event.target); }, true);
  document.querySelectorAll("img").forEach(img => { if (img.complete) loaded(img); });
}
