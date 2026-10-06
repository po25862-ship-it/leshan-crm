import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTimeInput } from "./timeInput.js";

test("accepts typed appointment times and normalizes them", () => {
  assert.equal(normalizeTimeInput("10:30"), "10:30");
  assert.equal(normalizeTimeInput("1030"), "10:30");
  assert.equal(normalizeTimeInput("930"), "09:30");
  assert.equal(normalizeTimeInput("9"), "09:00");
  assert.equal(normalizeTimeInput("２３：５９"), "23:59");
});

test("rejects invalid appointment times", () => {
  assert.equal(normalizeTimeInput("24:00"), null);
  assert.equal(normalizeTimeInput("10:99"), null);
  assert.equal(normalizeTimeInput("hello"), null);
  assert.equal(normalizeTimeInput(""), null);
});
