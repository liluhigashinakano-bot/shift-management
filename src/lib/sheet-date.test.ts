import assert from "node:assert/strict";
import { normalizeSheetDateToYmd } from "./sheet-date";

const cases: [unknown, string | null][] = [
  ["2026-04-17", "2026-04-17"],
  ["2026/4/7", "2026-04-07"],
  [" 2026/12/1 ", "2026-12-01"],
  [44927, "2023-01-01"],
  ["", null],
  [null, null],
  ["invalid", null],
];

for (const [input, expected] of cases) {
  assert.equal(normalizeSheetDateToYmd(input), expected, String(input));
}

console.log(`sheet-date: ${cases.length} patterns OK`);
