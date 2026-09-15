"use client";
import { useEffect, useRef } from "react";
import { settingsSchema } from "./generation/schema";
import {
  upperTeeth,
  type Screen,
  type SmileSettings,
  type TeethCount,
} from "./types";
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => unknown;
}
interface ModelContext {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
}
export function useSmileTools(
  state: {
    screen: Screen;
    hasPhoto: boolean;
    settings: SmileSettings;
    busy: boolean;
  },
  setSettings: (settings: SmileSettings) => void,
) {
  const latest = useRef({ state, setSettings });
  latest.current = { state, setSettings };
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: "read_smile_design",
        description:
          "Read the current Smile screen and design choices without exposing the patient photograph.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: () => latest.current.state,
      },
      {
        name: "configure_smile_design",
        description:
          "Change the visible design controls for the current photo. Does not generate or save a preview.",
        inputSchema: {
          type: "object",
          properties: {
            teeth: { enum: [4, 6, 8, 10] },
            treatment: { enum: ["Composite", "Porcelain"] },
            currentShade: { enum: ["A3", "A2", "A1", "B1"] },
            targetShade: { enum: ["The same", "Whiten", "Bleach", "A1", "B1", "BL3", "BL2", "BL1"] },
            shape: { enum: ["Square", "Rounded", "Triangular"] },
            texture: { enum: ["Smooth", "Natural", "Textured"] },
            shotType: { enum: ["Full face", "Close-up"] },
            intensity: { type: "integer", minimum: 0, maximum: 100 },
            notes: { type: "string", maxLength: 400 },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          const current = latest.current;
          if (
            current.state.screen !== "design" ||
            !current.state.hasPhoto ||
            current.state.busy
          )
            throw new Error(
              "Open Smile Design with a photo before changing selections.",
            );
          if (!input || typeof input !== "object" || Array.isArray(input))
            throw new Error("Provide design choices as an object.");
          const allowed = [
            "teeth",
            "treatment",
            "currentShade",
            "targetShade",
            "shape",
            "texture",
            "shotType",
            "intensity",
            "notes",
          ];
          if (Object.keys(input).some((k) => !allowed.includes(k)))
            throw new Error("Unknown design choice.");
          const patch = input as Partial<SmileSettings>;
          const count = patch.teeth ?? current.state.settings.teeth;
          const next = settingsSchema.parse({
            ...current.state.settings,
            ...patch,
            selectedTeeth: upperTeeth[count as TeethCount],
          });
          current.setSettings(next);
          await new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          );
          return { settings: latest.current.state.settings };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* The standard is optional; the regular UI remains fully functional. */
      }
    }
    return () => lifecycle.abort();
  }, []);
}
