// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
/**
 * What-If Life Simulator — pure story utilities.
 *
 * ES module with zero DOM access, so it runs unchanged in the browser
 * (imported by js/app.js) and in Node unit tests:
 *   import { parseChapters, escapeHtml } from "./js/story.js";
 */

/**
 * Escape a string for safe insertion into HTML.
 * The app renders AI text with textContent wherever possible; this is the
 * fallback for the few places that build HTML strings (toasts, etc.).
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A chapter marker is a line that starts with "YEAR <n>:".
const YEAR_MARKER_RE = /^YEAR\s+(\d+)\s*:\s*(.*)$/i;

/**
 * Parse raw storyteller output into [{ year, text }, ...].
 *
 * Primary contract: each chapter starts on its own line with "YEAR n:".
 * Tolerant fallback: when no markers are found, split the response into
 * paragraphs and label them sequentially (1..expectedYears).
 *
 * @param {string} text - raw model output
 * @param {number} expectedYears - how many chapters were requested
 * @returns {Array<{year:number, text:string}>}
 */
export function parseChapters(text, expectedYears) {
  const years = Number(expectedYears) > 0 ? Math.floor(Number(expectedYears)) : 0;
  const src = String(text ?? "");
  const chapters = [];

  let current = null;
  const flush = () => {
    if (current) {
      // Collapse 3+ blank lines, then trim — tolerates sloppy spacing.
      const body = current.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (body) chapters.push({ year: current.year, text: body });
      current = null;
    }
  };

  for (const rawLine of src.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const m = line.match(YEAR_MARKER_RE);
    if (m) {
      flush();
      current = { year: parseInt(m[1], 10), lines: [] };
      if (m[2].trim()) current.lines.push(m[2].trim());
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();

  if (chapters.length > 0) {
    return years > 0 ? chapters.slice(0, years) : chapters;
  }

  // Fallback: no markers — paragraph-split and label sequentially.
  const paras = src
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const count = years > 0 ? years : paras.length;
  return paras.slice(0, count).map((p, i) => ({ year: i + 1, text: p }));
}
