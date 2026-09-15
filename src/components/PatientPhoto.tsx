import type { Photo } from "@/lib/types";
export function PatientPhoto({
  photo,
  children,
}: {
  photo: Photo;
  children?: React.ReactNode;
}) {
  return (
    <div className="patient-photo">
      <img src={photo.dataUrl} alt="Original smiling patient photograph" />
      <div className="photo-label">Original photograph</div>
      {photo.isSample && <div className="sample-photo-label">Sample photo</div>}
      {children}
    </div>
  );
}
