import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { APPEARANCE_BOOT_SCRIPT, readAppearance, resolveTheme } from "../src/lib/appearance";

const css = readFileSync("src/app/theme.css", "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

const light = block(":root");
const dark = block(':root[data-theme="dark"]');

test("every colour role is defined for both Light and Dark", () => {
  const aliases = new Set(["--sc-panel", "--sc-panel-border", "--sc-text-muted", "--black", "--brand-blue", "--accent-strong"]);
  const missing = Object.keys(light).filter(name => !aliases.has(name) && !(name in dark) && name !== "--glass-blur");
  assert.deepEqual(missing, [], `Dark Mode is missing: ${missing.join(", ")}`);
  for (const role of ["--background", "--surface", "--surface-elevated", "--text-primary", "--text-secondary", "--border", "--separator", "--accent",
    "--destructive", "--success", "--warning", "--glass", "--input-background", "--toolbar-background", "--sidebar-background", "--card"])
    assert.ok(role in light && role in dark, role);
});

test("every CSS variable used by the stylesheets is defined", () => {
  const sheets = readdirSync("src/app").filter(f => f.endsWith(".css")).map(f => readFileSync(`src/app/${f}`, "utf8")).join("\n");
  const components = readdirSync("src/components", { recursive: true }).filter(f => String(f).endsWith(".tsx"))
    .map(f => readFileSync(`src/components/${f}`, "utf8")).join("\n") + readFileSync("src/app/page.tsx", "utf8");
  const defined = new Set([...sheets.matchAll(/(--[a-z0-9-]+)\s*:/g), ...components.matchAll(/"(--[a-z0-9-]+)"/g)].map(m => m[1]));
  // Tailwind's @theme and runtime-set layout variables.
  ["--font-sans", "--font-serif", "--font-display", "--range"].forEach(name => defined.add(name));
  const used = new Set([...sheets.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]));
  const undefinedVars = [...used].filter(name => !defined.has(name));
  assert.deepEqual(undefinedVars, []);
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test("text, accents and states meet WCAG AA contrast in both themes", () => {
  for (const [name, t] of [["light", light], ["dark", dark]] as const) {
    const pairs: [string, string, number][] = [
      ["--text-primary", "--background", 7], ["--text-primary", "--card", 7],
      ["--text-secondary", "--background", 4.5], ["--text-secondary", "--card", 4.5], ["--text-secondary", "--control-background", 4.5],
      ["--text-secondary", "--bg-grouped", 4.5],
      ["--accent-text", "--background", 4.5], ["--accent-text", "--card", 4.5],
      ["--on-accent", "--accent", 4.5], ["--on-selected", "--selected-fill", 4.5], ["--on-inverse", "--inverse-surface", 4.5],
      ["--destructive", "--card", 4.5], ["--on-destructive", "--destructive-fill", 4.5],
      ["--success", "--card", 4.5], ["--warning", "--card", 4.5],
    ];
    for (const [fg, bg, min] of pairs) {
      const ratio = contrast(t[fg], t[bg]);
      assert.ok(ratio >= min, `${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 (needs ${min}:1)`);
    }
  }
});

test("the appearance preference resolves System, Light and Dark", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  const storage = (value: string | null) => ({ getItem: () => value });
  assert.equal(readAppearance(storage("dark")), "dark");
  assert.equal(readAppearance(storage("sepia")), "system");
  assert.equal(readAppearance(storage(null)), "system");
});

test("the boot script sets the theme before first paint", () => {
  const run = (stored: string | null, systemDark: boolean) => {
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
    const context = {
      localStorage: { getItem: () => stored },
      window: { matchMedia: () => ({ matches: systemDark }) },
      document: { documentElement: root },
    };
    new Function("localStorage", "window", "document", APPEARANCE_BOOT_SCRIPT)(context.localStorage, context.window, context.document);
    return root;
  };
  assert.equal(run(null, true).dataset.theme, "dark");
  assert.equal(run(null, false).dataset.theme, "light");
  assert.equal(run("light", true).dataset.theme, "light");
  assert.equal(run("dark", false).style.colorScheme, "dark");
});
