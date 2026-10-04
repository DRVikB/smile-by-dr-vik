/** Fictional editorial samples only. Never used as patient inputs or style references. */
export const EXAMPLE_PORTRAITS = {
  man: {
    src: "/examples/portrait-man-v1-768.webp",
    srcSet: "/examples/portrait-man-v1-384.webp 384w, /examples/portrait-man-v1-768.webp 768w, /examples/portrait-man-v1-1024.webp 1024w",
    width: 1024,
    height: 1536,
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

/** Fictional male sample with illustrative edited teeth; not a clinical before/after. */
export const SUBSCRIPTION_COMPARISON = {
  before: "/examples/subscription-fictional-man-before-v2.webp",
  after: "/examples/subscription-fictional-man-after-v2.webp",
} as const;
