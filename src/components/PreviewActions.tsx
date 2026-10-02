import { AI_CONCEPT_SUMMARY, SMILECOMPOSE } from "@/lib/brand";
import { Pencil, Plus, Share2 } from "lucide-react";
import { VisualiseSymbol } from "@/components/icons/SmileIcons";
export function BottomActionBar({
  onAnother,
  onEdit,
  onShare,
  onNew,
  busy,
  anotherCost,
}: {
  onAnother: () => void;
  onEdit: () => void;
  /** Share with patient: the Smile Preview or the Consultation Report. */
  onShare: () => void;
  onNew: () => void;
  busy: boolean;
  anotherCost?: string;
}) {
  return (
    <div className="bottom-action-bar">
      <button className="action-button" disabled={busy} onClick={onAnother}>
        <VisualiseSymbol size={20} />
        Three more options
        {anotherCost && <small className="action-cost">{anotherCost}</small>}
      </button>
      <button className="action-button" disabled={busy} onClick={onEdit}>
        <Pencil size={19} strokeWidth={1.5} />
        Edit
      </button>
      <button className="action-button" disabled={busy} onClick={onShare}>
        <Share2 size={19} strokeWidth={1.5} />
        Share
      </button>
      <button className="action-button" disabled={busy} onClick={onNew}>
        <Plus size={19} strokeWidth={1.5} />
        New Design
      </button>
      <p className="desktop-concept-note">{AI_CONCEPT_SUMMARY}</p>
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
