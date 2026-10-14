// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
/**
 * What-If Life Simulator — offline demo generator ("Chronicler-lite").
 *
 * When the server has no AI key (or the AI request fails), the app can
 * still show how a timeline works by composing one locally from
 * hand-written sentence beats. This is a DEMO, not the AI storyteller:
 * every offline chapter is assembled from generic beats, is clearly
 * labeled "Offline demo" in the UI, and never pretends to be AI-written.
 *
 * All beats below are original writing for this project. Generation is
 * seeded (see js/rng.js) so the same scenario + tone + seed always
 * yields the same demo timeline — handy for sharing and for tests.
 *
 * Pure ES module: no DOM, no network.
 */

import { createRng } from "./rng.js";

const STAGES = ["early", "middle", "late"];

function stageFor(year, years) {
  if (year <= Math.max(1, Math.ceil(years / 3))) return "early";
  if (year <= Math.max(2, Math.ceil((2 * years) / 3))) return "middle";
  return "late";
}

/* Openers set the scene for the year. {s} = the scenario, {y} = year number. */
const OPENERS = {
  early: [
    "Year {y} begins with the strange lightness of a decision finally made — you went ahead and {s}, and the world quietly rearranges itself around that choice.",
    "In year {y}, the new life you chose when you decided to {s} stops feeling like an experiment and starts feeling like an address you actually live at.",
    "Year {y} opens on a morning that looks ordinary until you remember: you chose to {s}, and ordinary was never going to look the same again.",
    "The first real test of your choice to {s} arrives in year {y}, wearing the disguise of an ordinary Tuesday.",
  ],
  middle: [
    "By year {y}, the choice to {s} has grown roots — routines, regulars, and a version of you that would surprise the person you were before.",
    "Year {y} finds you mid-stride: the decision to {s} is no longer the story you tell at parties, it is simply the life you are living.",
    "In year {y}, the novelty of having chosen to {s} has worn off, and what is left is better than novelty — it is momentum.",
    "Year {y} arrives with the settled confidence of someone whose gamble — to {s} — has become a foundation instead of a question.",
  ],
  late: [
    "Year {y} looks back at the fork in the road where you chose to {s}, and the distance between that person and you is measured in whole lifetimes.",
    "In year {y}, you catch yourself telling a stranger the story of how you decided to {s}, and it sounds like someone else's legend now.",
    "Year {y} carries the long shadow of that first choice to {s} — not as a weight, but as proof of how far a single decision can travel.",
    "By year {y}, the decision to {s} has become family lore, the kind of story told at tables with laughter and a little disbelief.",
  ],
};

/* Tone-specific middles: two are drawn per chapter. */
const MIDDLES = {
  realistic: [
    "Not everything goes to plan — a bill lands at the worst moment, a plan falls through — but you adjust, the way people do, and the year bends instead of breaking.",
    "There are small wins and smaller setbacks in equal measure: a promotion that comes with harder hours, a friendship that deepens because you finally have time for it.",
    "Money is sometimes tight and sometimes fine; the difference, you learn, is less about luck than about which month you remember to check the budget.",
    "A mentor appears in an unlikely place and gives you one piece of advice that saves you a year of trial and error.",
    "You lose something you valued and gain something you did not know you needed, and for a while both feelings live in the same room.",
    "An old friend visits and says you seem different — calmer, more deliberate — and you realize they are right.",
  ],
  optimistic: [
    "A door you had stopped knocking on swings open, and behind it is an opportunity shaped almost exactly like the one you had been hoping for.",
    "Your courage becomes contagious: two friends make their own bold moves, and your little circle starts to feel like a movement.",
    "The work you poured yourself into gets noticed by exactly the right person, at exactly the right moment, and everything accelerates.",
    "A windfall — part luck, part the groundwork you laid — lets you help someone you love in a way you will never forget.",
    "You wake up one morning to good news that feels too generous to be real, and then a second piece of good news arrives before lunch.",
    "Strangers start seeking your advice, and you discover you have become the person you once wished you could meet.",
  ],
  dark: [
    "The universe, sensing you were getting comfortable, delivers a plot twist with the timing of a comedian and the subtlety of a brick.",
    "Your grand plan survives contact with reality the way a snowman survives contact with a flamethrower — heroically, briefly, and with great comic timing.",
    "A bureaucrat with the empathy of a parking meter loses your paperwork twice, and you learn a new vocabulary of sighs.",
    "The thing you were most proud of breaks in front of an audience, and your recovery becomes a story people retell for years — at your expense.",
    "Murphy's law files for overtime: the printer jams, the backup fails, and the meeting could have been an email, in that order.",
    "You achieve a lifelong dream and immediately discover the fine print, which is written in the universe's least favorite font.",
  ],
};

/* Closers land the year's emotional beat. */
const CLOSERS = {
  early: [
    "You end the year knowing the hardest part — starting — is already behind you.",
    "By December, the question is no longer whether the choice was right, but what you will build on top of it.",
    "The year closes with you steadier than you started, and quietly proud of that.",
    "You finish the year with fewer certainties and more courage, which turns out to be the better trade.",
  ],
  middle: [
    "The year ends with a quiet toast to the person you were when you chose this — they would be proud.",
    "By year's end, the life you imagined and the life you have are close enough to shake hands.",
    "You close the year with a full calendar, a fuller heart, and a list of plans that finally feels like yours.",
    "December finds you exactly where the choice pointed you, which is to say: somewhere worth being.",
  ],
  late: [
    "You close the year knowing that one decision, made on an ordinary day, rewrote everything after it.",
    "The year ends the way the best stories do — not with an ending, but with a horizon.",
    "You end the year grateful for the gamble, the grit, and the long road that started with a single what-if.",
    "December arrives like a benediction: the life you built from one brave choice, standing tall around you.",
  ],
};

/**
 * Compose one offline chapter. `seed` disambiguates re-rolls; `ban` is an
 * optional string the new text must differ from (used for branches).
 */
function composeChapter(rng, scenario, tone, year, years, ban) {
  const stage = stageFor(year, years);
  const fill = (t) => t.replaceAll("{s}", scenario).replaceAll("{y}", String(year));
  const middles = MIDDLES[tone] || MIDDLES.realistic;
  for (let attempt = 0; attempt < 12; attempt++) {
    const opener = fill(rng.pick(OPENERS[stage]));
    const first = rng.pick(middles);
    let second = rng.pick(middles);
    let guard = 0;
    while (second === first && guard++ < 8) second = rng.pick(middles);
    const closer = fill(rng.pick(CLOSERS[stage]));
    const text = `${opener} ${first} ${second} ${closer}`;
    if (!ban || text !== ban) return text;
  }
  // Last resort: still differ from the banned text by appending a coda.
  const closer = fill(rng.pick(CLOSERS[stage]));
  return `${fill(rng.pick(OPENERS[stage]))} ${rng.pick(middles)} ${closer} This time, though, the year takes a visibly different turn.`;
}

/**
 * Build a full offline demo timeline.
 * @returns {Array<{year:number, text:string}>}
 */
export function generateOfflineTimeline({ scenario, years, tone, seed }) {
  const clean = String(scenario ?? "").trim();
  const n = Math.max(1, Math.min(10, Math.floor(Number(years)) || 1));
  const rng = createRng(`whatif-offline|${clean}|${tone}|${n}|${seed ?? 0}`);
  const chapters = [];
  for (let year = 1; year <= n; year++) {
    chapters.push({ year, text: composeChapter(rng, clean, tone, year, n) });
  }
  return chapters;
}

/** Build one offline alternative chapter for a given year. */
export function generateOfflineBranch({ scenario, tone, year, years, chapterText, seed }) {
  const rng = createRng(
    `whatif-offline-branch|${String(scenario ?? "").trim()}|${tone}|${year}|${seed ?? 0}`
  );
  return composeChapter(rng, String(scenario ?? "").trim(), tone, year, years || year, chapterText);
}

/** The canonical seed string for a demo timeline (shown in the UI). */
export function offlineSeedFor({ scenario, tone, years, salt }) {
  return `demo-${String(scenario ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "untitled"}-${tone}-${years}-s${salt ?? 0}`;
}

export { STAGES };
