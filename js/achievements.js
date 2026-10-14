// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
/**
 * What-If Life Simulator — achievements (retention hooks).
 *
 * Small, cheerful milestones that reward exploring the app: generating,
 * branching, continuing a branch, extending, saving, exporting, and
 * trying the offline demo. Unlocked achievements persist in localStorage
 * and are announced with a toast + confetti by the UI.
 *
 * The pure core (checkUnlocks) takes stats + already-unlocked ids and
 * returns newly unlocked definitions, so it is trivially unit-testable.
 * The storage wrapper (Achievements) is the only part that touches
 * localStorage, and it degrades to in-memory storage when blocked.
 *
 * Pure-ish ES module: no DOM.
 */

export const ACHIEVEMENT_DEFS = [
  {
    id: "first-timeline",
    title: "First Timeline",
    desc: "Generated your first alternate history.",
    icon: "🔮",
    test: (s) => s.timelines >= 1,
  },
  {
    id: "decade-dreamer",
    title: "Decade Dreamer",
    desc: "Generated a full 10-year timeline.",
    icon: "📅",
    test: (s) => s.decadeTimelines >= 1,
  },
  {
    id: "branch-explorer",
    title: "Branch Explorer",
    desc: "Dreamed up 3 alternative chapters.",
    icon: "🌿",
    test: (s) => s.branches >= 3,
  },
  {
    id: "time-traveler",
    title: "Time Traveler",
    desc: "Continued a story from one of its branches.",
    icon: "⏳",
    test: (s) => s.continues >= 1,
  },
  {
    id: "story-extender",
    title: "Story Extender",
    desc: "Extended a timeline beyond its original ending.",
    icon: "➕",
    test: (s) => s.extends >= 1,
  },
  {
    id: "keeper",
    title: "Keeper of Timelines",
    desc: "Saved a timeline to this browser.",
    icon: "💾",
    test: (s) => s.saves >= 1,
  },
  {
    id: "sharer",
    title: "Sharer of Worlds",
    desc: "Exported or copied a timeline to share.",
    icon: "📤",
    test: (s) => s.exports + s.shareCopies >= 1,
  },
  {
    id: "offline-explorer",
    title: "Offline Explorer",
    desc: "Tried the offline demo timeline.",
    icon: "📴",
    test: (s) => s.offlineDemos >= 1,
  },
];

export const EMPTY_STATS = {
  timelines: 0,
  decadeTimelines: 0,
  branches: 0,
  continues: 0,
  extends: 0,
  saves: 0,
  exports: 0,
  shareCopies: 0,
  offlineDemos: 0,
};

/** Pure: which defs newly unlock given stats + already-unlocked ids. */
export function checkUnlocks(stats, unlockedIds) {
  const have = new Set(unlockedIds || []);
  return ACHIEVEMENT_DEFS.filter((d) => !have.has(d.id) && d.test(stats || {}));
}

/* ---------------- storage wrapper ---------------- */

const STORE_KEY = "whatif.achievements.v1";

const memStore = { data: null };
function getStore() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* blocked storage */
  }
  return {
    getItem: (k) => (k === STORE_KEY ? memStore.data : null),
    setItem: (k, v) => {
      if (k === STORE_KEY) memStore.data = String(v);
    },
  };
}

function load() {
  try {
    const raw = getStore().getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      return {
        stats: { ...EMPTY_STATS, ...(parsed.stats || {}) },
        unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked.slice() : [],
      };
    }
  } catch {
    /* corrupt storage -> fresh */
  }
  return { stats: { ...EMPTY_STATS }, unlocked: [] };
}

function persist(state) {
  try {
    getStore().setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — stats just don't persist */
  }
}

export const Achievements = {
  /** Current state (stats + unlocked ids). */
  get() {
    return load();
  },
  /** Unlocked definition objects, in def order. */
  unlockedDefs() {
    const { unlocked } = load();
    const have = new Set(unlocked);
    return ACHIEVEMENT_DEFS.filter((d) => have.has(d.id));
  },
  /**
   * Record an event (e.g. "branches" +1) and return newly unlocked defs.
   * @param {string} event - a key of EMPTY_STATS
   * @param {number} [amount=1]
   */
  record(event, amount = 1) {
    const state = load();
    if (!(event in state.stats)) return [];
    state.stats[event] += amount;
    const fresh = checkUnlocks(state.stats, state.unlocked);
    for (const d of fresh) state.unlocked.push(d.id);
    persist(state);
    return fresh;
  },
};
