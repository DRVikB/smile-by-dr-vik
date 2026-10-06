"use client";
import { ArrowUpRight } from "lucide-react";
import { INTERNAL_ALIGNMENT, INTERNAL_FULL_ARCH } from "@/lib/generation/availability";
import { QUICK_GOALS, type QuickGoal } from "@/lib/quickSmile";

/** Quick Smile goals on the photo step: each tap is a finished design in one step. */
export function QuickSmile({ onGoal, busy }: { onGoal: (goal: QuickGoal) => void; busy: boolean }) {
  const goals = QUICK_GOALS.filter(g => (g.goal !== "straighten" || INTERNAL_ALIGNMENT) && (g.goal !== "full-arch" || INTERNAL_FULL_ARCH));
  return (
    <div className="quick-smile" role="group" aria-label="Quick Smile goals">
      {goals.map(g => (
        <button key={g.goal} type="button" className="quick-smile-goal" disabled={busy} onClick={() => onGoal(g.goal)}>
          <span><strong>{g.title}</strong><small>{g.detail}</small></span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
