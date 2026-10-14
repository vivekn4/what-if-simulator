// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// Tests for js/achievements.js and js/share.js — run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { checkUnlocks, EMPTY_STATS, ACHIEVEMENT_DEFS } from "../js/achievements.js";
import { serializeTimeline, parseTimelineExport, buildShareCard } from "../js/share.js";

test("achievements: first timeline unlocks exactly one def", () => {
  const fresh = checkUnlocks({ ...EMPTY_STATS, timelines: 1 }, []);
  assert.deepEqual(fresh.map((d) => d.id), ["first-timeline"]);
});

test("achievements: already-unlocked defs are not re-reported", () => {
  const fresh = checkUnlocks({ ...EMPTY_STATS, timelines: 5 }, ["first-timeline"]);
  assert.equal(fresh.length, 0);
});

test("achievements: every def has title/desc/icon/test", () => {
  for (const d of ACHIEVEMENT_DEFS) {
    assert.ok(d.id && d.title && d.desc && d.icon && typeof d.test === "function");
  }
  const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
});

const STATE = {
  scenario: "moved to Toronto",
  years: 2,
  tone: "optimistic",
  offline: false,
  offlineSeed: null,
  chapters: [
    { year: 1, text: "First year. It went well!", branches: ["Alt first year."] },
    { year: 2, text: "Second year. Even better!", branches: [] },
  ],
};

test("share: export round-trips through parse", () => {
  const exported = serializeTimeline(STATE);
  assert.equal(exported.app, "what-if-simulator");
  assert.equal(exported.version, 1);
  const back = parseTimelineExport(JSON.parse(JSON.stringify(exported)));
  assert.equal(back.scenario, STATE.scenario);
  assert.equal(back.chapters.length, 2);
  assert.deepEqual(back.chapters[0].branches, ["Alt first year."]);
});

test("share: parse rejects bad exports", () => {
  assert.throws(() => parseTimelineExport(null), /not a What If/);
  assert.throws(() => parseTimelineExport({ app: "something-else", version: 1 }), /not a What If/);
  assert.throws(
    () => parseTimelineExport({ app: "what-if-simulator", version: 99, scenario: "x", chapters: [] }),
    /Unsupported export version/
  );
  assert.throws(
    () =>
      parseTimelineExport({
        app: "what-if-simulator",
        version: 1,
        scenario: "x",
        chapters: [{ year: 1, text: "" }],
      }),
    /no text/
  );
  assert.throws(
    () =>
      parseTimelineExport({
        app: "what-if-simulator",
        version: 1,
        scenario: "x",
        chapters: [{ year: 1, text: "ok", branches: [123] }],
      }),
    /malformed branch/
  );
});

test("share: card contains scenario + year teasers", () => {
  const card = buildShareCard(STATE);
  assert.ok(card.includes("What if I moved to Toronto?"));
  assert.ok(card.includes("Year 1:"));
  assert.ok(card.includes("What If"));
});
