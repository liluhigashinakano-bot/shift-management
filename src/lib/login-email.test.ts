import assert from "node:assert/strict";
import { normalizeCommonLoginEmail } from "./login-email";

const cases: [string, string][] = [
  ["admin@shift.loca", "admin@shift.local"],
  ["  admin@SHIFT.Loca  ", "admin@shift.local"],
  ["吉田@shift.loca", "吉田@shift.local"],
  ["りりむ@cast.loca", "りりむ@cast.local"],
  ["admin@shift.local", "admin@shift.local"],
  ["user@example.com", "user@example.com"],
  ["", ""],
];

for (const [input, expected] of cases) {
  assert.equal(
    normalizeCommonLoginEmail(input),
    expected,
    `normalize(${JSON.stringify(input)})`,
  );
}

console.log(`login-email: ${cases.length} patterns OK`);
