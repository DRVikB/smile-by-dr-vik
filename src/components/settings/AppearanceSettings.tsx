"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, SunMoon } from "lucide-react";
import { readAppearance, setAppearance, type AppearancePreference } from "@/lib/appearance";
import { Group } from "./settingsParts";

const OPTIONS: { value: AppearancePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** Settings › Preferences: follow the system, or choose Light or Dark. Applies immediately. */
export function AppearanceSection() {
  const [choice, setChoice] = useState<AppearancePreference>("system");
  useEffect(() => { setChoice(readAppearance()); }, []);

  function choose(value: AppearancePreference) {
    setChoice(value);
    setAppearance(value);
  }

  return (
    <Group id="settings-appearance" title="Preferences">
      <div className="settings-row appearance-row">
        <span className="settings-row-icon" aria-hidden="true"><SunMoon size={17} strokeWidth={1.6} /></span>
        <span className="settings-row-text"><span className="settings-row-label" id="appearance-label">Appearance</span></span>
        <div className="appearance-picker" role="radiogroup" aria-labelledby="appearance-label">
          {OPTIONS.map(({ value, label, Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={choice === value} className="appearance-option" onClick={() => choose(value)}>
              <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </Group>
  );
}
