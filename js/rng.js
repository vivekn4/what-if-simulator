// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
/**
 * What-If Life Simulator — seeded random number generator.
 *
 * Deterministic PRNG so the offline demo mode produces the same timeline
 * for the same seed (shareable, debuggable, testable). The core step is
 * the classic mulberry32 recurrence — a well-known tiny PRNG algorithm —
 * with a string-seed hash written for this project. Nothing here is
 * copied from any other app's source: only the public-domain-style
 * recurrence shape is reused, as is standard for this algorithm.
 *
 * Pure ES module: no DOM, no Math.random, runs in browser and Node.
 */

/** Hash an arbitrary string seed into an unsigned 32-bit integer. */
export function hashSeed(seed) {
  let h = 1779033703 ^ String(seed).length;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Create a seeded RNG. `next()` returns a float in [0, 1).
 * Same seed string => identical sequence, forever.
 */
export function createRng(seed) {
  let a = hashSeed(seed);
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    /** Float in [0, 1). */
    next,
    /** Integer in [min, max], inclusive. */
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    /** True with probability p (0..1). */
    chance(p) {
      return next() < p;
    },
    /** A random element of a non-empty array. */
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    /**
     * Weighted pick. Items carry their weight in `w` (default 1).
     * Falls back to a uniform pick when total weight is 0.
     */
    weighted(items) {
      let total = 0;
      for (const it of items) total += Math.max(0, it?.w ?? 1);
      if (total <= 0) return this.pick(items);
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, it?.w ?? 1);
        if (r < 0) return it;
      }
      return items[items.length - 1];
    },
    /** A shuffled copy of an array (Fisher–Yates). */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
