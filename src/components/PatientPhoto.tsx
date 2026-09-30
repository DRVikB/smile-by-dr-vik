import type { Photo } from "@/lib/types";
import { ZoomPan } from "./ZoomPan";
export function PatientPhoto({
  photo,
  children,
  overlay,
  focus,
}: {
  photo: Photo;
  /** Zoom to this region (normalised), e.g. the teeth on the Teeth step. */
  focus?: { x: number; y: number; width: number; height: number } | null;
  children?: React.ReactNode;
  /** Drawn over the photo inside the zoom, so it zooms and pans with it (e.g. the tooth map). */
  overlay?: (zoom: number) => React.ReactNode;
}) {
  return (
    <div className="patient-photo">
      <img className="photo-backdrop" src={photo.dataUrl} alt="" aria-hidden="true" />
      <div className="photo-frame">
        <ZoomPan className="photo-zoom" resetKey={photo.dataUrl} focus={focus}>
          {({ scale }) => <>
            <img src={photo.dataUrl} alt="Original smiling patient photograph" />
            {overlay?.(scale)}
          </>}
        </ZoomPan>
      </div>
      <div className="photo-vignette" aria-hidden="true" />
      <div className="photo-label">Original photograph</div>
      {photo.isSample && <div className="sample-photo-label">Sample photo</div>}
      {children}
    </div>
  );
}
