import assert from "node:assert/strict";
import { parseGoogleFormUrl } from "./google-form-config";

const cases: [string | null | undefined, string | null][] = [
  [null, null],
  ["", null],
  ["  ", null],
  ["https://docs.google.com/forms/d/abc/viewform", "https://docs.google.com/forms/d/abc/viewform"],
  ["not-a-url", null],
];

for (const [input, expected] of cases) {
  assert.equal(parseGoogleFormUrl(input), expected, String(input));
}

console.log(`google-form-config: ${cases.length} patterns OK`);
