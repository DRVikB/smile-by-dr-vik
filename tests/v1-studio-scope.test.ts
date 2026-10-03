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
      if (child.type === "button" && child.props.role === "radio" && renderToStaticMarkup(child).includes(`<strong>${title}</strong>`)) child.props.onClick?.();
      else visit(child.props.children);
    });
  }
  visit(tree);
  assert.ok(changed, `Treatment ${title} must have a working selection action`);
  return changed;
}

test("V1 Alignment starts a shared position-only contract independent of remembered veneer morphology", () => {
  const selected = clickTreatment({ ...defaultSettings, shape: "Square", targetShade: "BL1", texture: "Textured" }, "Alignment");
  assert.deepEqual(selected.alignment, { arches: "Both", only: true });
  const contract = normalizeGenerationContract(selected);
  assert.equal(contract.mode, "alignment");
  assert.equal(contract.shape, undefined);
  assert.equal(contract.texture, undefined);
  assert.equal(contract.targetShade, "The same");
});

test("choosing Whitening from Alignment clears positioning permissions", () => {
  const selected = clickTreatment(chooseAlignment(defaultSettings), "Whitening");
  assert.equal(selected.alignment, undefined);
  assert.equal(normalizeGenerationContract(selected).mode, "whitening");
  assert.equal(selected.treatment, "Whitening");
});

test("Veneers restores existing material controls without leaving Full Arch or Alignment active", () => {
  for (const settings of [chooseAlignment({ ...defaultSettings, treatment: "Porcelain" }), chooseFullArch({ ...defaultSettings, treatment: "Single-shade composite" })]) {
    const selected = clickTreatment(settings, "Veneers");
    assert.equal(selected.treatmentMode, "standard");
    assert.equal(selected.alignment, undefined);
    assert.equal(selected.treatment, settings.treatment);
    assert.equal(normalizeGenerationContract(selected).mode, "restorative");
    const html = renderToStaticMarkup(createElement(TreatmentOptions, { settings: selected, onChange() {} }));
    for (const label of ["Composite bonding", "Layered composite", "Porcelain veneers"]) assert.ok(html.includes(`<strong>${label}</strong>`));
  }
});

test("Full Arch selection keeps the shared mode and explicit gingival permission", () => {
  const selected = clickTreatment(defaultSettings, "Full Arch / All-on-X");
  assert.equal(selected.treatmentMode, "full_arch");
  assert.equal(selected.alignment, undefined);
  assert.equal(selected.fullArch?.restorationType, "zirconia");
  assert.equal(normalizeGenerationContract(selected).fullArch?.prostheticGingiva, "exclude");
});

test("only one main treatment is checked and Alignment exposes no disabled restoration choices", () => {
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

function toggleAlignment(settings: SmileSettings) {
  let changed: SmileSettings | undefined;
  const tree = TreatmentOptions({ settings, onChange: value => { changed = value; } });
  function visit(node: ReactNode): void {
    Children.forEach(node, child => {
      if (!isValidElement<{ children?: ReactNode; onClick?: () => void; role?: string }>(child)) return;
      if (child.type === "button" && child.props.role === "switch" && renderToStaticMarkup(child).includes("Include alignment")) child.props.onClick?.();
      else visit(child.props.children);
    });
  }
  visit(tree); assert.ok(changed, "Restorative alignment must have a working toggle"); return changed;
}

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
  assert.equal((html.split('aria-label="Veneer material"')[0].split('</div>')[0].match(/aria-checked="true"/g) ?? []).length, 1);
  assert.equal(toggleAlignment(combined).alignment, undefined);
});

test("changing composite to porcelain retains the separately selected alignment add-on", () => {
  const combined = toggleAlignment({ ...defaultSettings, treatment: "Single-shade composite" });
  const porcelain = clickTreatment(combined, "Porcelain veneers");
  assert.deepEqual(porcelain.alignment, { arches: "Both" });
  assert.equal(porcelain.treatment, "Porcelain");
  assert.equal(normalizeGenerationContract(porcelain).mode, "restorative");
  assert.equal(clickTreatment(porcelain, "Full Arch / All-on-X").alignment, undefined);
  for (const s of [chooseAlignment(defaultSettings), chooseFullArch(defaultSettings)]) {
    const html = renderToStaticMarkup(createElement(TreatmentOptions, { settings: s, onChange() {} }));
    assert.doesNotMatch(html, /Include alignment/);
  }
});
