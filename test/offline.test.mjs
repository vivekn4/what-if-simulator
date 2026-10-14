// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// Tests for js/rng.js and js/offline.js — run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { createRng, hashSeed } from "../js/rng.js";
import { generateOfflineTimeline, generateOfflineBranch, offlineSeedFor } from "../js/offline.js";

test("rng: same seed => identical sequence", () => {
  const a = createRng("demo-seed");
  const b = createRng("demo-seed");
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
});

test("rng: different seeds => different sequences", () => {
  const a = createRng("seed-one");
  const b = createRng("seed-two");
  let diff = false;
  for (let i = 0; i < 20; i++) if (a.next() !== b.next()) diff = true;
  assert.ok(diff);
});

test("rng: int stays in range, pick stays in array, shuffle is a permutation", () => {
  const rng = createRng("range-check");
  for (let i = 0; i < 200; i++) {
    const v = rng.int(3, 7);
    assert.ok(v >= 3 && v <= 7);
  }
  const arr = ["a", "b", "c", "d"];
  assert.ok(arr.includes(rng.pick(arr)));
  assert.deepEqual(rng.shuffle(arr).sort(), arr);
});

test("rng: weighted honors zero weights", () => {
  const rng = createRng("weighted");
  const items = [
    { w: 0, name: "never" },
    { w: 1, name: "always" },
  ];
  for (let i = 0; i < 20; i++) assert.equal(rng.weighted(items).name, "always");
});

test("rng: hashSeed is stable", () => {
  assert.equal(hashSeed("abc"), hashSeed("abc"));
});

const BASE = { scenario: "quit my job to travel the world", years: 5, tone: "realistic" };

test("offline: generates exactly the requested chapters", () => {
  const chapters = generateOfflineTimeline({ ...BASE, seed: 1 });
  assert.equal(chapters.length, 5);
  assert.deepEqual(chapters.map((c) => c.year), [1, 2, 3, 4, 5]);
  for (const c of chapters) {
    assert.ok(c.text.length > 100, "chapter should read like a paragraph");
    assert.ok(!/YEAR \d+:/.test(c.text), "chapter text must not leak markers");
    const words = c.text.split(/\s+/).length;
    assert.ok(words >= 50 && words <= 130, `chapter word count ${words} out of range`);
  }
});

test("offline: deterministic for same seed", () => {
  const a = generateOfflineTimeline({ ...BASE, seed: 7 });
  const b = generateOfflineTimeline({ ...BASE, seed: 7 });
  assert.deepEqual(a, b);
});

test("offline: different tone => different text", () => {
  const a = generateOfflineTimeline({ ...BASE, tone: "realistic", seed: 3 });
  const b = generateOfflineTimeline({ ...BASE, tone: "dark", seed: 3 });
  assert.notDeepEqual(a, b);
});

test("offline: different salt => different timeline (re-roll works)", () => {
  const a = generateOfflineTimeline({ ...BASE, seed: 1 });
  const b = generateOfflineTimeline({ ...BASE, seed: 2 });
  assert.notDeepEqual(a, b);
});

test("offline: branch differs from the original chapter", () => {
  const chapters = generateOfflineTimeline({ ...BASE, seed: 1 });
  const branch = generateOfflineBranch({
    ...BASE,
    year: 2,
    years: 5,
    chapterText: chapters[1].text,
    seed: 1,
  });
  assert.notEqual(branch, chapters[1].text);
  assert.ok(branch.length > 50);
});

test("offline: seed label is URL/file safe", () => {
  const s = offlineSeedFor({ scenario: "moved to Toronto!", tone: "dark", years: 10, salt: 2 });
  assert.match(s, /^[a-z0-9-]+$/);
});
