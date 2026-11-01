"use client";
import { ArrowUpRight } from "lucide-react";
import { INTERNAL_ALIGNMENT, INTERNAL_FULL_ARCH } from "@/lib/generation/availability";
import { QUICK_GOALS, type QuickGoal } from "@/lib/quickSmile";
import type { QuickPreset } from "@/lib/quickPreset";
import { QuickPresetTile } from "./QuickPreset";

/** Quick Smile goals on the photo step: each tap is a finished design in one step. My preset comes first when offered. */
export function QuickSmile({ onGoal, onPreset, busy }: { onGoal: (goal: QuickGoal) => void; onPreset?: (preset: QuickPreset) => void; busy: boolean }) {
  const goals = QUICK_GOALS.filter(g => (g.goal !== "straighten" || INTERNAL_ALIGNMENT) && (g.goal !== "full-arch" || INTERNAL_FULL_ARCH));
  return (
    <div className={`quick-smile${onPreset ? " has-preset" : ""}`} role="group" aria-label="Quick Smile goals">
      {onPreset && <QuickPresetTile busy={busy} onGenerate={onPreset} />}
      {goals.map(g => (
        <button key={g.goal} type="button" className="quick-smile-goal" disabled={busy} onClick={() => onGoal(g.goal)}>
          <span><strong>{g.title}</strong><small>{g.detail}</small></span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
