"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { readAppearance, setAppearance, type AppearancePreference } from "@/lib/appearance";
import { Group } from "./settingsParts";

const OPTIONS: { value: AppearancePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** Settings › Appearance: follow the system, or choose Light or Dark. Applies immediately. */
export function AppearanceSection() {
  const [choice, setChoice] = useState<AppearancePreference>("system");
  useEffect(() => { setChoice(readAppearance()); }, []);

  function choose(value: AppearancePreference) {
    setChoice(value);
    setAppearance(value);
  }

  return (
    <Group id="settings-appearance" title="Appearance"
      footer={choice === "system" ? "SmileCompose follows your device’s Light or Dark setting." : `SmileCompose stays in ${choice === "light" ? "Light" : "Dark"} Mode on this device.`}>
      <div className="appearance-picker" role="radiogroup" aria-label="Theme">
        {OPTIONS.map(({ value, label, Icon }) => (
          <button key={value} type="button" role="radio" aria-checked={choice === value} className="appearance-option" onClick={() => choose(value)}>
            <span className={`appearance-swatch ${value}`} aria-hidden="true"><Icon size={16} strokeWidth={1.7} /></span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </Group>
  );
}
