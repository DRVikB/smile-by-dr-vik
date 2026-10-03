/** Read only the orientation tag; never retain EXIF text or identifiers. */
export function jpegExifOrientation(bytes: Uint8Array): number | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint16(0) !== 0xffd8) return null;
    for (let p = 2; p + 4 <= bytes.length;) {
      if (bytes[p] !== 0xff || bytes[p + 1] === 0xda || bytes[p + 1] === 0xd9) return null;
      const length = view.getUint16(p + 2), end = p + 2 + length;
      if (length < 2 || end > bytes.length) return null;
      if (bytes[p + 1] === 0xe1 && length >= 16 && view.getUint32(p + 4) === 0x45786966 && view.getUint16(p + 8) === 0) {
        const tiff = p + 10, order = view.getUint16(tiff);
        if (order !== 0x4949 && order !== 0x4d4d) return null;
        const little = order === 0x4949;
        if (view.getUint16(tiff + 2, little) !== 42) return null;
        const offset = view.getUint32(tiff + 4, little), directory = tiff + offset;
        if (offset < 8 || directory + 2 > end) return null;
        const count = view.getUint16(directory, little);
        if (directory + 2 + count * 12 > end) return null;
        for (let i = 0; i < count; i++) {
          const entry = directory + 2 + i * 12;
          if (view.getUint16(entry, little) !== 0x112) continue;
          if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return null;
          const orientation = view.getUint16(entry + 8, little);
          return orientation >= 1 && orientation <= 8 ? orientation : null;
        }
      }
      p = end;
    }
  } catch { /* Malformed/truncated headers have no detectable orientation. */ }
  return null;
}

export function dataUrlOrientation(dataUrl: string): number | null {
  if (!dataUrl.startsWith("data:image/jpeg;base64,")) return null;
  try {
    // A bounded header read; do not copy the full image into diagnostics.
    const header = atob(dataUrl.slice(23, 23 + 87380));
    return jpegExifOrientation(Uint8Array.from(header, c => c.charCodeAt(0)));
  } catch { return null; }
}
