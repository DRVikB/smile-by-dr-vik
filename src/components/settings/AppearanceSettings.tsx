"use client";
import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Sun, SunMoon } from "lucide-react";
import { readAppearance, setAppearance, type AppearancePreference } from "@/lib/appearance";
import { Group } from "./settingsParts";

const OPTIONS: { value: AppearancePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

const DETAILS: Record<AppearancePreference, string> = {
  system: "Matches this device, switching with it from day to night.",
  light: "White pages and charcoal text.",
  dark: "Charcoal pages, easier on the eyes in a dim room.",
};

/** A small drawing of the app in each appearance: the bar, a photograph, a line of text and the gold button. */
function AppearancePreview({ value }: { value: AppearancePreference }) {
  const screen = (tone: "light" | "dark") => (
    <span className={`appearance-preview-screen is-${tone}`}>
      <i className="ap-bar" /><i className="ap-photo" /><i className="ap-line" /><i className="ap-line is-short" /><i className="ap-button" />
    </span>
  );
  return (
    <span className={`appearance-preview is-${value}`} aria-hidden="true">
      {value === "system" ? <>{screen("light")}{screen("dark")}</> : screen(value)}
    </span>
  );
}

/**
 * Settings › Preferences: follow the system, or choose Light or Dark. Applies immediately. In the iPad
 * detail pane, where the page is about appearance alone, each choice is a row with a drawing of the app.
 */
export function AppearanceSection({ detailed = false }: { detailed?: boolean }) {
  const [choice, setChoice] = useState<AppearancePreference>("system");
  useEffect(() => { setChoice(readAppearance()); }, []);

  function choose(value: AppearancePreference) {
    setChoice(value);
    setAppearance(value);
  }

  if (detailed) return (
    <Group id="settings-appearance" title="Appearance" footer="Changes straight away, on this device.">
      <div className="appearance-rows" role="radiogroup" aria-labelledby="settings-appearance">
        {OPTIONS.map(({ value, label }) => (
          <button key={value} type="button" role="radio" aria-checked={choice === value} className="appearance-choice" onClick={() => choose(value)}>
            <AppearancePreview value={value} />
            <span className="appearance-choice-text"><strong>{label}</strong><span>{DETAILS[value]}</span></span>
            <span className="appearance-choice-check" aria-hidden="true">{choice === value && <Check size={15} strokeWidth={2.6} />}</span>
          </button>
        ))}
      </div>
    </Group>
  );

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
