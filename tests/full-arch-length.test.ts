import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings } from "../src/lib/types";
import { chooseFullArch } from "../src/lib/fullArch";
import { buildCanonicalPrompt, buildSunburstPrompt } from "../src/lib/generation/contract";

test("full-arch teeth keep a conservative length with a gap above the lower lip", () => {
  for (const smileArc of ["Preserve existing", "Follow lower lip"] as const) {
    const s = chooseFullArch({ ...defaultSettings, smileArc });
    const canonical = buildCanonicalPrompt(s);
    assert.match(canonical, /FULL-ARCH LENGTH/);
    assert.match(canonical, /never touch, rest on or cover the lower lip/);
    assert.doesNotMatch(canonical, /curve that follows the lower lip/);
    assert.match(canonical, /keep the photographed split between the arches/);
    assert.match(canonical, /no new band of gum appears/);
    assert.match(buildSunburstPrompt(s), /edges never touch or cover the lip/);
  }
});
