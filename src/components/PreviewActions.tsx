import { Download, Pencil, Plus, RotateCw } from "lucide-react";
export function BottomActionBar({
  onEdit,
  onRegenerate,
  onSave,
  onNew,
  busy,
  saving,
}: {
  onEdit: () => void;
  onRegenerate: () => void;
  onSave: () => void;
  onNew: () => void;
  busy: boolean;
  saving: boolean;
}) {
  return (
    <div className="bottom-action-bar">
      <button className="secondary-button" disabled={busy} onClick={onEdit}>
        <Pencil size={16} />
        Edit
      </button>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={onRegenerate}
      >
        <RotateCw size={16} />
        Regenerate
      </button>
      <button
        className="primary-button save-button"
        disabled={busy || saving}
        onClick={onSave}
      >
        <Download size={17} />
        {saving ? "Saving…" : "Save Image"}
      </button>
      <span className="action-separator" />
      <button className="text-button" disabled={busy} onClick={onNew}>
        <Plus size={17} />
        New Smile
      </button>
    </div>
  );
}
export function Disclaimer() {
  return (
    <p className="disclaimer">
      Digital smile simulation for visual communication only. The final clinical
      result may differ following assessment, treatment planning and material
      selection.
    </p>
  );
}
