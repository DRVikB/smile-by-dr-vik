/** The uncropped photograph's viewport, excluding blurred letterboxing. */
export function containedPhotoRect(frameWidth: number, frameHeight: number, imageWidth: number, imageHeight: number) {
  if (![frameWidth, frameHeight, imageWidth, imageHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const width = imageWidth * scale, height = imageHeight * scale;
  return { left: (frameWidth - width) / 2, top: (frameHeight - height) / 2, width, height };
}
