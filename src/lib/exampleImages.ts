/** Fictional editorial samples only. Never used as patient inputs or style references. */
export const EXAMPLE_PORTRAITS = {
  man: {
    src: "/examples/portrait-man-v2-768.webp",
    srcSet: "/examples/portrait-man-v2-384.webp 384w, /examples/portrait-man-v2-768.webp 768w, /examples/portrait-man-v2-1024.webp 1024w",
    width: 1024,
    height: 1365,
  },
  /** The sample case's patient (the "Explore a sample case" photo), reused as a picture. */
  demo: {
    src: "/demo-storyboard-before.webp",
    width: 1200,
    height: 1600,
  },
  woman: {
    src: "/examples/portrait-woman-v1-768.webp",
    srcSet: "/examples/portrait-woman-v1-384.webp 384w, /examples/portrait-woman-v1-768.webp 768w, /examples/portrait-woman-v1-1024.webp 1024w",
    width: 1024,
    height: 1536,
  },
} as const;

/** Fictional matched before/concept illustration; not evidence of a live generation or clinical outcome. */
export const EXAMPLE_COMPARISON = {
  before: "/examples/demo-portrait-before-v2.webp",
  after: "/examples/demo-portrait-after-v2.webp",
} as const;

/** Fictional male sample (AI-generated portrait); the concept is a real SmileCompose result from staging, 2 Nov 2026. Not a clinical before/after. */
export const SUBSCRIPTION_COMPARISON = {
  before: "/examples/subscription-fictional-man-before-v3.webp",
  after: "/examples/subscription-fictional-man-after-v3.webp",
} as const;

/** The "Take a photo" card: a fictional sample, levelled and cropped 16:9.2 like the camera picture. `smile` is the
 * camera's smile frame around her lips (the lips widened 12% and heightened 18% each way), in image pixels. */
export const CAMERA_SAMPLE = {
  src: "/examples/camera-sample-woman-v1.webp",
  width: 1488,
  height: 856,
  smile: { x: 428, y: 536, width: 552, height: 279 },
} as const;
