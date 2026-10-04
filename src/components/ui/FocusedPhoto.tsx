"use client";
import { useEffect, useRef, useState } from "react";
import { edgeFadeMask, focusedPhotoRect, maskStyle, type FocusOptions } from "@/lib/photoViewport";
import { knownSmileRegion, smileRegion, type FocusSource } from "@/lib/photoFocus";

type Placement = { left: number; top: number; width: number; height: number; origin: string; mask?: string };

/**
 * A decorative full-bleed photograph positioned around its smile rather than
 * its centre. `layout` chooses the anchor and limits for the frame's current
 * shape, so each screen (and each orientation) frames the smile its own way.
 */
export function FocusedPhoto({ src, focus, layout, className = "" }: {
  src: string;
  /** What the photo carries about where the smile is. */
  focus?: FocusSource;
  layout: (frameWidth: number, frameHeight: number) => Omit<FocusOptions, "region">;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const latest = useRef({ focus, layout });
  latest.current = { focus, layout };
  useEffect(() => {
    const box = frame.current, img = image.current;
    if (!box || !img) return;
    const measure = () => {
      const w = box.clientWidth, h = box.clientHeight, nw = img.naturalWidth, nh = img.naturalHeight;
      const { focus: source, layout: layoutFor } = latest.current;
      const sized = { ...source, width: source?.width || nw, height: source?.height || nh };
      const region = smileRegion(sized);
      const options = layoutFor(w, h);
      // Enlarge towards the smile only when the photo says where it is; a guess stays at cover.
      const rect = focusedPhotoRect(w, h, nw, nh, { ...options, region, maxZoom: knownSmileRegion(sized) ? options.maxZoom : 1 });
      // A slow push towards the smile keeps the smile where it is.
      setPlacement(rect && { ...rect, origin: `${(region.x + region.width / 2) * 100}% ${(region.y + region.height / 2) * 100}%`, mask: edgeFadeMask(rect, w, h) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    img.addEventListener("load", measure);
    return () => { observer.disconnect(); img.removeEventListener("load", measure); };
  }, [src]);
  return (
    <div ref={frame} className={`focused-photo ${className}`.trim()} aria-hidden="true">
      <img ref={image} src={src} alt="" draggable={false}
        style={placement ? { left: placement.left, top: placement.top, width: placement.width, height: placement.height, transformOrigin: placement.origin,
          ...maskStyle(placement.mask) } : { visibility: "hidden" }} />
    </div>
  );
}
