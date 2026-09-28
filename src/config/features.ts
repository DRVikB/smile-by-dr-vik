/**
 * Product feature flags. A disabled feature must not render any UI — no
 * placeholder screens or "coming soon" entries. Flip a flag only when the
 * feature is actually implemented and tested.
 */
export const features = {
  photoGeneration: true,
  smileMotion: false,
  stlImport: false,
  faceCapture: false,
  threeDDesign: false,
  jawMotion: false,
  labExport: false,
} as const;

export type FeatureName = keyof typeof features;

export function isFeatureEnabled(name: FeatureName): boolean {
  return features[name];
}
