// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// Tests for js/story.js — run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { parseChapters, escapeHtml } from "../js/story.js";

test("parseChapters: parses YEAR markers", () => {
  const out = parseChapters("YEAR 1:\nFirst year text.\n\nYEAR 2:\nSecond year text.", 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].year, 1);
  assert.equal(out[0].text, "First year text.");
  assert.equal(out[1].year, 2);
});

test("parseChapters: tolerates partial streamed text", () => {
  const out = parseChapters("YEAR 1:\nHalf-written ch", 2);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "Half-written ch");
});

test("parseChapters: falls back to paragraph split without markers", () => {
  const out = parseChapters("Para one.\n\nPara two.", 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].year, 1);
});

test("parseChapters: caps at expected years", () => {
  const out = parseChapters("YEAR 1:\nA\nYEAR 2:\nB\nYEAR 3:\nC", 2);
  assert.equal(out.length, 2);
});

test("escapeHtml: neutralizes markup", () => {
  assert.equal(escapeHtml("<script>alert('x')</script>"), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
});
