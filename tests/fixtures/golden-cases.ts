/** Approved local inputs only. Images stay in the ignored `test images/` folder. */
export const GOLDEN_CASES = [
  { id: "G01", file: "IMG_3166 2.HEIC", shot: "Full face", coverage: ["high-resolution HEIC"], humanReview: true },
  { id: "G02", file: "IMG_3241.jpg", shot: "Full face", coverage: ["full face", "irregular alignment", "visible spacing"], humanReview: true },
  { id: "G03", file: "IMG_3291.jpg", shot: "Full face", coverage: ["darker visual shade", "crowding", "rotations"], humanReview: true },
  { id: "G04", file: "IMG_3293.jpg", shot: "Full face", coverage: ["straightforward smile", "limited lower-tooth exposure"], humanReview: true },
  { id: "G05", file: "IMG_3296.jpg", shot: "Close-up", coverage: ["close-up", "wide aspect", "visible gingival margins"], humanReview: true },
  { id: "G06", file: "IMG_3297.jpg", shot: "Full face", coverage: ["missing-tooth region", "visible spacing", "darker visual shade"], humanReview: true },
] as const;
// Visual test categories, not diagnoses. A clinician must confirm suitability.
export const GOLDEN_COVERAGE_GAPS = ["clinician-confirmed isolated diastema", "gummy smile", "retracted photograph"];
export const GOLDEN_SELECTIONS = [[11], [12,11,21,22], [13,12,11,21,22,23], [14,13,12,11,21,22,23,24]];
export const GOLDEN_MATERIALS = ["Single-shade composite", "Layered composite", "Porcelain"] as const;
export const GOLDEN_EXPECTATIONS = {
  crop: "Keep every source edge; provider padding is temporary and removed on return.",
  dimensions: "Prepared longest side <= 2048; concept dimensions match the prepared original.",
  selection: "Exactly the requested teeth; individual tooth edits require a reviewed map.",
  mask: "Finite normalised coordinates; reject invalid or empty edit regions.",
  protection: "Protected pixels remain original before encoding; actual anatomical boundaries require human review.",
  corruption: "Reject grey/blank or placeholder output; never use a cosmetic appearance as automated ground truth.",
};
