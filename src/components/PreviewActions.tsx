import { SMILECOMPOSE } from "@/lib/brand";
import { Download, Pencil, Plus, Sparkles } from "lucide-react";
export function BottomActionBar({
  onAnother,
  onEdit,
  onSave,
  onNew,
  busy,
  saving,
  anotherCost,
}: {
  onAnother: () => void;
  onEdit: () => void;
  onSave: () => void;
  onNew: () => void;
  busy: boolean;
  saving: boolean;
  anotherCost?: string;
}) {
  return (
    <div className="bottom-action-bar">
      <button className="action-button" disabled={busy} onClick={onAnother}>
        <Sparkles size={19} strokeWidth={1.5} />
        Three more options
        {anotherCost && <small className="action-cost">{anotherCost}</small>}
      </button>
      <button className="action-button" disabled={busy} onClick={onEdit}>
        <Pencil size={19} strokeWidth={1.5} />
        Edit
      </button>
      <button
        className="action-button"
        disabled={busy || saving}
        onClick={onSave}
      >
        <Download size={19} strokeWidth={1.5} />
        {saving ? "Saving…" : "Save Image"}
      </button>
      <button className="action-button" disabled={busy} onClick={onNew}>
        <Plus size={19} strokeWidth={1.5} />
        New Design
      </button>
    </div>
  );
}
export function Disclaimer() {
  return (
    <p className="disclaimer">
      {SMILECOMPOSE.disclaimer}
    </p>
  );
}
