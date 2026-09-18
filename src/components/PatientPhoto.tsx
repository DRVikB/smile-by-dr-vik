import type { Photo } from "@/lib/types";
import { ZoomPan } from "./ZoomPan";
export function PatientPhoto({
  photo,
  children,
}: {
  photo: Photo;
  children?: React.ReactNode;
}) {
  return (
    <div className="patient-photo">
      <img className="photo-backdrop" src={photo.dataUrl} alt="" aria-hidden="true" />
      <ZoomPan className="photo-zoom">
        <img src={photo.dataUrl} alt="Original smiling patient photograph" />
      </ZoomPan>
      <div className="photo-label">Original photograph</div>
      {photo.isSample && <div className="sample-photo-label">Sample photo</div>}
      {children}
    </div>
  );
}
