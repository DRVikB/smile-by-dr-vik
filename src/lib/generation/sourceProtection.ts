import type { Point } from "../face/geometry";
import type { Photo } from "../types";

/** Boundary review is a local next step, never an automatic paid retry. */
export class EditAreaRequiredError extends Error {
  readonly code = "edit_area_required";
  constructor() {
    super("Mark the dental edit area before generating this photo. No generation request was sent.");
    this.name = "EditAreaRequiredError";
  }
}

/** Keep the existing face, painted-area and reviewed-tooth protection paths.
 * Mouth-only crops cannot supply facial landmarks; request an explicit area
 * instead of guessing a mouth contour or removing protection. */
export async function sourceProtectionPoints(
  photo: Pick<Photo, "dataUrl" | "editMask">,
  preciseTooth: boolean,
  detect: (source: string, signal?: AbortSignal) => Promise<Point[] | null>,
  signal?: AbortSignal,
): Promise<Point[] | null> {
  signal?.throwIfAborted();
  if (photo.editMask || preciseTooth) return null;
  const points = await detect(photo.dataUrl, signal);
  signal?.throwIfAborted();
  if (!points) throw new EditAreaRequiredError();
  return points;
}
