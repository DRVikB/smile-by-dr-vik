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

/** Registered before/after pair of the established demo; full frames on every device. */
export const EXAMPLE_COMPARISON = {
  before: "/examples/demo-portrait-before-v1.webp",
  after: "/examples/demo-portrait-after-v1.webp",
} as const;
