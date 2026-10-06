import test from "node:test";
import assert from "node:assert/strict";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountProvider } from "../src/components/account/AccountProvider";
import { DesignStudio, TreatmentOptions } from "../src/components/studio/DesignStudio";
import { useToothMap } from "../src/components/toothMap/useToothMap";
import { emptyCaseCosts } from "../src/lib/generation/cost";
import { defaultSettings, type SmileSettings } from "../src/lib/types";
import { chooseAlignment, chooseFullArch } from "../src/lib/fullArch";
import { normalizeGenerationContract } from "../src/lib/generation/contract";
import type { ToothMap } from "../src/lib/toothMap/types";

function studio(settings: SmileSettings = defaultSettings, savedMap?: ToothMap) {
  function Subject() {
    const controller = useToothMap({ photo: null, settings, active: false, setPhoto() {}, onChange() {} });
    return createElement(DesignStudio, {
      settings, stage: "Photograph", caseBar: null, busy: false, reference: null,
      onChange() {}, onGenerate() {}, onCompare() {}, onCompareMaterials() {}, onHarmonise() {},
      onEditArea() {}, hasEditArea: false, onAddReference() {}, onClearReference() {}, toothMap: savedMap ? { ...controller, map: savedMap } : controller,
      costs: { pricing: null, resolution: "1K", onResolution() {}, costs: emptyCaseCosts(), testMode: true, busy: false, open: false, onOpen() {} },
    });
  }
  return renderToStaticMarkup(createElement(AccountProvider, null, createElement(Subject)));
}

test("V1 studio presets are usable without exposing Custom or the optional Tooth Map", () => {
  const html = studio();
  for (const count of [4, 6, 8, 10]) assert.match(html, new RegExp(`>${count}</button>`));
  assert.doesNotMatch(html, />Custom<|Tooth map|Tooth Map|Tooth map · optional|Precision Mode/);
});

test("a saved optional map does not give normal V1 users instructions to use hidden map editing", () => {
  const html = studio(defaultSettings, { photoId: "synthetic", arch: "upper", teeth: [], confirmedByClinician: false, version: 1, method: "manual" });
  assert.doesNotMatch(html, /tooth map|Add .* in Edit if visible/i);
});

test("V1 reopening legacy individual plans does not expose their hidden tooth chart", () => {
  const html = studio({ ...defaultSettings, selectedTeeth: [11], toothPlans: [{ tooth: 11, condition: "Natural", intent: "Reshape" }] });
  assert.doesNotMatch(html, /Tooth chart|>Custom<|Individual teeth|tooth-chart/);
});

function clickTreatment(settings: SmileSettings, title: string) {
  let changed: SmileSettings | undefined;
  const tree = TreatmentOptions({ settings, onChange: value => { changed = value; } });
  function visit(node: ReactNode): void {
    Children.forEach(node, child => {
      if (!isValidElement<{ children?: ReactNode; onClick?: () => void; role?: string }>(child)) return;
      const markup = child.type === "button" ? renderToStaticMarkup(child) : "";
      // Treatments are cards with a bold title; the material is a compact switch of short names.
      if ((child.props.role === "checkbox" && markup.includes(`<strong>${title}</strong>`)) || (child.props.role === "radio" && markup.endsWith(`>${title}</button>`))) child.props.onClick?.();
      else visit(child.props.children);
    });
  }
  visit(tree);
  assert.ok(changed, `Treatment ${title} must have a working selection action`);
  return changed;
}

test("V1 Alignment starts a shared position-only contract independent of remembered veneer morphology", () => {
  const selected = clickTreatment(clickTreatment(clickTreatment({ ...defaultSettings, shape: "Square", targetShade: "BL1", texture: "Textured" }, "Alignment"), "Veneers"), "Alignment");
  // Last remaining choice stays selected. Removing Veneers leaves alignment only.
  assert.deepEqual(selected.alignment, { arches: "Both", only: true });
  const contract = normalizeGenerationContract(selected);
  assert.equal(contract.mode, "alignment");
  assert.equal(contract.shape, undefined);
  assert.equal(contract.texture, undefined);
  assert.equal(contract.targetShade, "The same");
});

test("choosing Whitening from Alignment combines colour with positioning permissions", () => {
  const selected = clickTreatment(chooseAlignment(defaultSettings), "Whitening");
  assert.deepEqual(selected.alignment, { arches: "Both" });
  assert.equal(normalizeGenerationContract(selected).mode, "whitening");
  assert.equal(selected.treatment, "Whitening");
});

test("Veneers restores material controls and combines with Alignment while leaving Full Arch", () => {
  for (const settings of [chooseAlignment({ ...defaultSettings, treatment: "Porcelain" }), chooseFullArch({ ...defaultSettings, treatment: "Single-shade composite" })]) {
    const selected = clickTreatment(settings, "Veneers");
    assert.equal(selected.treatmentMode, "standard");
    assert.deepEqual(selected.alignment, settings.alignment ? { arches: "Both" } : undefined);
    assert.equal(selected.treatment, settings.treatment);
    assert.equal(normalizeGenerationContract(selected).mode, "restorative");
    const html = renderToStaticMarkup(createElement(TreatmentOptions, { settings: selected, onChange() {} }));
    for (const label of ["Bonding", "Layered", "Porcelain"]) assert.ok(html.includes(`>${label}</button>`));
  }
});

test("Full Arch selection keeps the shared mode and explicit gingival permission", () => {
  const selected = clickTreatment(defaultSettings, "Full Arch / All-on-X");
  assert.equal(selected.treatmentMode, "full_arch");
  assert.equal(selected.alignment, undefined);
  assert.equal(selected.fullArch?.restorationType, "zirconia");
  assert.equal(normalizeGenerationContract(selected).fullArch?.prostheticGingiva, "exclude");
});

test("legacy single-mode cases show one checked treatment without disabled restoration choices", () => {
  for (const settings of [defaultSettings, { ...defaultSettings, treatment: "Whitening" as const }, chooseAlignment(defaultSettings), chooseFullArch(defaultSettings)]) {
    const html = renderToStaticMarkup(createElement(TreatmentOptions, { settings, onChange() {} }));
    const main = html.split('aria-label="Veneer material"')[0];
    // Material choices live in their own group after the main treatment group.
    const treatmentGroup = main.slice(0, main.indexOf('</div>'));
    assert.equal((treatmentGroup.match(/aria-checked="true"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /disabled=/);
  }
});

test("Alignment shows both arches instead of upper restorative tooth-count choices", () => {
  const html = studio(chooseAlignment(defaultSettings));
  assert.match(html, /Both visible arches/);
  assert.doesNotMatch(html, /aria-label="Upper teeth to design"|aria-label="Upper teeth"/);
});

test("All-on-X offers both zirconia without an arch or material decision", () => {
  const html = studio(chooseFullArch(defaultSettings));
  assert.match(html, /Both visible arches/);
  assert.match(html, /Zirconia/);
  assert.doesNotMatch(html, /aria-label="Arch to restore"|aria-label="Arch"|aria-label="Restoration"|>Provisional<|>Upper<|>Lower</);
});

const toggleAlignment = (settings: SmileSettings) => clickTreatment(settings, "Alignment");

test("bonding plus Alignment keeps the selected dental design and remains restorative", () => {
  const original = { ...defaultSettings, treatment: "Single-shade composite" as const, targetShade: "B1" as const, shape: "Square" as const, texture: "Textured" as const };
  const combined = toggleAlignment(original);
  assert.deepEqual(combined.alignment, { arches: "Both" });
  assert.equal(combined.treatment, original.treatment);
  assert.deepEqual(combined.selectedTeeth, original.selectedTeeth);
  assert.equal(combined.targetShade, original.targetShade);
  assert.equal(combined.shape, original.shape);
  const contract = normalizeGenerationContract(combined);
  assert.equal(contract.mode, "restorative"); assert.equal(contract.alignment?.only, undefined);
  const html = renderToStaticMarkup(createElement(TreatmentOptions, { settings: combined, onChange() {} }));
  assert.match(html, /aria-label="Veneer material"/);
  assert.equal((html.split('aria-label="Veneer material"')[0].split('</div>')[0].match(/aria-checked="true"/g) ?? []).length, 2);
  assert.equal(toggleAlignment(combined).alignment, undefined);
});

test("changing composite to porcelain retains the separately selected alignment add-on", () => {
  const combined = toggleAlignment({ ...defaultSettings, treatment: "Single-shade composite" });
  const porcelain = clickTreatment(combined, "Porcelain");
  assert.deepEqual(porcelain.alignment, { arches: "Both" });
  assert.equal(porcelain.treatment, "Porcelain");
  assert.equal(normalizeGenerationContract(porcelain).mode, "restorative");
  assert.equal(clickTreatment(porcelain, "Full Arch / All-on-X").alignment, undefined);
  for (const s of [chooseAlignment(defaultSettings), chooseFullArch(defaultSettings)]) {
    const html = renderToStaticMarkup(createElement(TreatmentOptions, { settings: s, onChange() {} }));
    assert.doesNotMatch(html, /Include alignment/);
  }
});

// Every allowed combination is selected through the actual UI handlers.
function checkedTreatments(settings: SmileSettings): string[] {
  const html = renderToStaticMarkup(createElement(TreatmentOptions, { settings, onChange() {} })).split('aria-label="Veneer material"')[0].split('</div>')[0];
  return [...html.matchAll(/<button[^>]*aria-checked="true"[^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/g)].map(m => m[1]);
}
test("top treatment checkboxes support all seven standard combinations and no separate alignment switch", () => {
  const onlyAlignment = chooseAlignment({ ...defaultSettings, treatment: "Porcelain" });
  const combos = [
    ["Alignment"], ["Whitening"], ["Veneers"],
    ["Whitening", "Alignment"], ["Veneers", "Alignment"], ["Whitening", "Veneers"],
    ["Whitening", "Veneers", "Alignment"],
  ];
  for (const requested of combos) {
    let settings = onlyAlignment;
    for (const title of requested.filter(t => t !== "Alignment")) settings = clickTreatment(settings, title);
    if (!requested.includes("Alignment")) settings = clickTreatment(settings, "Alignment");
    assert.deepEqual(checkedTreatments(settings), ["Whitening", "Veneers", "Alignment"].filter(t => requested.includes(t)), requested.join(" + "));
    assert.equal(settings.treatmentMode, "standard");
    assert.deepEqual(settings.selectedTeeth, defaultSettings.selectedTeeth);
    const html = renderToStaticMarkup(createElement(TreatmentOptions, { settings, onChange() {} }));
    assert.match(html, /role="checkbox"/); assert.doesNotMatch(html, /Include alignment|role="switch"/);
    assert.equal(html.includes('aria-label="Veneer material"'), requested.includes("Veneers"));
  }
});
test("All-on-X clears combined treatment permissions and each standard choice leaves it exclusively", () => {
  let settings = clickTreatment(clickTreatment(defaultSettings, "Whitening"), "Alignment");
  assert.deepEqual(checkedTreatments(settings), ["Whitening", "Veneers", "Alignment"]);
  settings = clickTreatment(settings, "Full Arch / All-on-X");
  assert.deepEqual(checkedTreatments(settings), ["Full Arch / All-on-X"]);
  assert.equal(settings.whitening, undefined); assert.equal(settings.alignment, undefined);
  for (const title of ["Whitening", "Veneers", "Alignment"]) {
    const selected = clickTreatment(settings, title);
    assert.deepEqual(checkedTreatments(selected), [title]);
  }
});
test("material change and deselecting Alignment retain Whitening and veneer choices", () => {
  const combined = clickTreatment(clickTreatment(defaultSettings, "Whitening"), "Alignment");
  const porcelain = clickTreatment(combined, "Porcelain");
  assert.deepEqual(checkedTreatments(porcelain), ["Whitening", "Veneers", "Alignment"]);
  assert.equal(porcelain.treatment, "Porcelain");
  assert.equal(porcelain.targetShade, defaultSettings.targetShade);
  assert.deepEqual(checkedTreatments(clickTreatment(porcelain, "Alignment")), ["Whitening", "Veneers"]);
  assert.deepEqual(checkedTreatments(clickTreatment(clickTreatment(porcelain, "Veneers"), "Whitening")), ["Alignment"]);
});
