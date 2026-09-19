/**
 * Turns what the clinician actually lined up on screen — the live video's
 * "cover" crop, plus any digital zoom/pan they applied to get the patient's
 * smile into the guide box — into the exact rectangle of native camera
 * pixels to export.
 *
 * The front camera on an iPad is wide enough that a patient held at a
 * natural distance reads as small in frame; the back camera is the
 * opposite, needing the clinician to get uncomfortably close. Digital zoom
 * lets either camera be framed the same way, so the guide box the model is
 * told about always matches what was actually captured.
 */

export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface ZoomLike {
  scale: number;
  x: number;
  y: number;
}

/** The native-pixel rectangle an `object-fit: cover` box shows, centred. */
export function coverCrop(
  videoWidth: number,
  videoHeight: number,
  boxAspect: number,
): SourceRect {
  let sw = videoWidth;
  let sh = videoHeight;
  let sx = 0;
  let sy = 0;
  if (videoWidth / videoHeight > boxAspect) {
    sw = videoHeight * boxAspect;
    sx = (videoWidth - sw) / 2;
  } else {
    sh = videoWidth / boxAspect;
    sy = (videoHeight - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

/**
 * The cover crop further narrowed by an on-screen digital zoom/pan
 * (`translate(x, y) scale(scale)` on content the size of the box, origin at
 * its centre — the same convention `ZoomPan` uses), so the exported photo
 * is exactly what was visible in the guide, at any zoom level.
 */
export function zoomedCrop(
  videoWidth: number,
  videoHeight: number,
  boxWidth: number,
  boxHeight: number,
  zoom: ZoomLike,
): SourceRect {
  const base = coverCrop(videoWidth, videoHeight, boxWidth / boxHeight);
  if (!boxWidth || !boxHeight) return base;
  const scale = Math.max(1, zoom.scale);
  const cx = boxWidth / 2;
  const cy = boxHeight / 2;
  // Visible viewport corners (0..boxWidth, 0..boxHeight), mapped back through
  // the zoom transform into the same untransformed box space the cover crop
  // was computed in.
  const left = cx + (0 - cx - zoom.x) / scale;
  const right = cx + (boxWidth - cx - zoom.x) / scale;
  const top = cy + (0 - cy - zoom.y) / scale;
  const bottom = cy + (boxHeight - cy - zoom.y) / scale;
  const kx = base.sw / boxWidth;
  const ky = base.sh / boxHeight;
  const sx = base.sx + left * kx;
  const sy = base.sy + top * ky;
  const sw = (right - left) * kx;
  const sh = (bottom - top) * ky;
  // Clamp defensively against floating-point drift at the frame edges —
  // clampPan should already keep the viewport inside the content, but a
  // crop that reaches past the real frame would throw at capture time.
  const boundedSx = Math.max(0, Math.min(videoWidth, sx));
  const boundedSy = Math.max(0, Math.min(videoHeight, sy));
  return {
    sx: boundedSx,
    sy: boundedSy,
    sw: Math.max(1, Math.min(videoWidth - boundedSx, sw)),
    sh: Math.max(1, Math.min(videoHeight - boundedSy, sh)),
  };
}
