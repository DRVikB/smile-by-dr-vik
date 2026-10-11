"use client";
import { SheetClose } from "@/components/sideRail/SideRail";
import { ProPlans } from "./ProPlans";
import { ProValueVisual } from "@/components/onboarding/OnboardingVisuals";

export function Paywall({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop account-backdrop" role="dialog" aria-modal="true" aria-labelledby="paywall-title" onClick={onClose}>
      <div className="sheet account-sheet paywall" onClick={e => e.stopPropagation()}>
        <div className="sheet-heading">
          <div>
            <h2 id="paywall-title">SmileCompose Pro</h2>
          </div>
          <SheetClose onClose={onClose} />
        </div>
        <ProValueVisual compact />
        <ProPlans />
      </div>
    </div>
  );
}
