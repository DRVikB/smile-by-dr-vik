import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  addLogEntry,
  clearLog,
  deleteLogEntry,
  listLog,
  logFileName,
  readLogMedia,
  searchLog,
} from "../src/lib/caseLog";
import type { CaseLogEntry, CaseLogMedia } from "../src/lib/types";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function entry(
  id: string,
  patientName: string,
  createdAt: number,
  extra: Partial<CaseLogEntry> = {},
): CaseLogEntry {
  return {
    id,
    patientName,
    createdAt,
    mode: "live",
    summary: "8 teeth · Composite · Whiten · Rounded",
    thumb: png,
    ...extra,
  };
}
const media = (id: string): CaseLogMedia => ({
  id,
  image: png,
  originalImage: png,
});

test("every generated preview is logged and listed newest first", async () => {
  await clearLog();
  await addLogEntry(entry("a", "Sarah Wells", 1000), media("a"));
  await addLogEntry(entry("b", "Tom Hardy", 3000), media("b"));
  await addLogEntry(entry("c", "Priya Shah", 2000), media("c"));
  assert.deepEqual(
    (await listLog()).map((e) => e.id),
    ["b", "c", "a"],
  );
  await clearLog();
  assert.equal((await listLog()).length, 0);
});

test("search matches patient name case-insensitively, by date and by treatment", async () => {
  await clearLog();
  const when = Date.UTC(2026, 8, 16, 10, 30);
  await addLogEntry(entry("a", "Sarah Wells", when), media("a"));
  await addLogEntry(
    entry("b", "Tom Hardy", when, {
      summary: "6 teeth · Porcelain · Bleach · Square",
    }),
    media("b"),
  );
  assert.deepEqual((await searchLog("sarah")).map((e) => e.id), ["a"]);
  assert.deepEqual((await searchLog("WELLS")).map((e) => e.id), ["a"]);
  assert.deepEqual((await searchLog("porcelain")).map((e) => e.id), ["b"]);
  assert.equal((await searchLog("2026-09-16")).length, 2);
  assert.equal((await searchLog("")).length, 2);
  assert.equal((await searchLog("nobody")).length, 0);
  await clearLog();
});

test("photos are stored apart from the searchable list and removed with the case", async () => {
  await clearLog();
  await addLogEntry(entry("a", "Sarah Wells", 1000), media("a"));
  const [listed] = await listLog();
  assert.equal("image" in listed, false);
  assert.equal((await readLogMedia("a"))?.originalImage, png);
  await deleteLogEntry("a");
  assert.equal((await listLog()).length, 0);
  assert.equal(await readLogMedia("a"), null);
});

test("saved file names carry the patient name with a sortable date and time", () => {
  assert.match(
    logFileName(entry("a", "Sarah Wells", Date.UTC(2026, 8, 16, 10, 30))),
    /^Sarah-Wells_2026-09-16_\d{4}$/,
  );
  assert.match(logFileName(entry("b", "   ", 0)), /^Unnamed_/);
});
