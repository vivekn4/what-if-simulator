// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
/**
 * What-If Life Simulator — export / import / share-card helpers.
 *
 * Timelines are portable: export downloads a versioned JSON file, import
 * validates and restores one, and the share card is a short teaser text
 * designed for pasting into a chat or a post. Nothing here phones home —
 * export/import are pure local file operations in the UI layer.
 *
 * Pure ES module: no DOM, no network.
 */

export const EXPORT_VERSION = 1;

/** Serialize app state into a portable export object. */
export function serializeTimeline(state) {
  return {
    app: "what-if-simulator",
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scenario: state.scenario,
    years: state.years,
    tone: state.tone,
    offline: Boolean(state.offline),
    offlineSeed: state.offlineSeed || null,
    chapters: (state.chapters || []).map((c) => ({
      year: c.year,
      text: c.text,
      branches: Array.isArray(c.branches) ? c.branches.slice() : [],
    })),
  };
}

/**
 * Validate + normalize a parsed export object back into app state.
 * Throws an Error with a human-readable message on any problem.
 */
export function parseTimelineExport(input) {
  const fail = (msg) => {
    throw new Error(msg);
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("That file is not a What If timeline export.");
  }
  if (input.app !== "what-if-simulator") {
    fail("That file is not a What If timeline export.");
  }
  if (input.version !== EXPORT_VERSION) {
    fail(`Unsupported export version (${String(input.version)}).`);
  }
  if (typeof input.scenario !== "string" || !input.scenario.trim()) {
    fail("Export is missing a scenario.");
  }
  if (!Array.isArray(input.chapters) || input.chapters.length === 0) {
    fail("Export contains no chapters.");
  }
  if (input.chapters.length > 50) {
    fail("Export contains too many chapters.");
  }
  const chapters = input.chapters.map((c, i) => {
    if (!c || typeof c !== "object") fail(`Chapter ${i + 1} is malformed.`);
    if (typeof c.text !== "string" || !c.text.trim()) {
      fail(`Chapter ${i + 1} has no text.`);
    }
    if (c.text.length > 5000) fail(`Chapter ${i + 1} is too long.`);
    const branches = Array.isArray(c.branches) ? c.branches : [];
    for (const b of branches) {
      if (typeof b !== "string" || !b.trim() || b.length > 5000) {
        fail(`Chapter ${i + 1} has a malformed branch.`);
      }
    }
    return {
      year: Number.isFinite(c.year) ? c.year : i + 1,
      text: c.text,
      branches: branches.slice(0, 20),
    };
  });
  return {
    scenario: input.scenario,
    years: Number.isFinite(input.years) ? input.years : chapters.length,
    tone: ["realistic", "optimistic", "dark"].includes(input.tone) ? input.tone : "realistic",
    offline: Boolean(input.offline),
    offlineSeed: typeof input.offlineSeed === "string" ? input.offlineSeed : null,
    chapters,
  };
}

/** Short teaser text for sharing in a chat or post. */
export function buildShareCard(state) {
  const lines = [];
  lines.push(`🔮 What if I ${state.scenario}?`);
  const toneWord = { realistic: "Realistic", optimistic: "Optimistic", dark: "Darkly comic" }[state.tone] || "Realistic";
  lines.push(`A ${state.years}-year ${toneWord.toLowerCase()} timeline${state.offline ? " (offline demo)" : ""}.`);
  lines.push("");
  const teaser = (state.chapters || []).slice(0, 3);
  for (const c of teaser) {
    const first = c.text.split(/(?<=[.!?])\s/)[0] || c.text;
    lines.push(`Year ${c.year}: ${first.slice(0, 140)}`);
  }
  if ((state.chapters || []).length > 3) lines.push("…and more years to unfold.");
  lines.push("");
  lines.push("Made with What If — Life Simulator");
  return lines.join("\n");
}
