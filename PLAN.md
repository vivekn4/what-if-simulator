# What If — Life Simulator · PLAN.md

<!-- Crafted by Vivek Nair (VN) — https://github.com/vivekn4 -->

Living plan for the repo: what the app is, what changed in each version,
and what is deliberately NOT being built.

## What it is

Type any life decision — *"What if I quit my job to travel the world?"* —
and watch the next ten years unfold as an AI-written branching story.
100% free to run: Node backend + zero-build static frontend + a free
Gemini API key. No paid services, no signup walls.

## Architecture (v1.1.0)

- `server.js` — Express API: `/api/chat` (one-shot) + `/api/chat/stream`
  (SSE streaming) proxies to an OpenAI-compatible endpoint, plus static
  frontend hosting. Key lives only in `AI_API_KEY`.
- `index.html` — app shell (landing + timeline views).
- `css/style.css` — warm editorial styling, responsive.
- `js/`
  - `config.js` — runtime API_URL config.
  - `story.js` — pure chapter parser + HTML escaper (unit-testable).
  - `rng.js` — seeded PRNG (deterministic demo generation + tests).
  - `offline.js` — "Chronicler-lite": seeded local demo timeline
    composer from hand-written beats. Clearly labeled demo, never AI.
  - `achievements.js` — milestone defs + localStorage stats.
  - `share.js` — export/import validation + share-card text.
  - `app.js` — UI logic: generate (streaming), branch, continue-from-branch,
    extend, copy, share, export/import, save, load, achievements.
  - `sfx.js` / `vfx.js` — synthesized SFX + canvas VFX (zero assets).
- `test/` — `node --test` suite (`npm test`): story, rng, offline,
  achievements/share, server helpers.

## v1.1.0 — teardown upgrade (2026-10-14)

Researched three similar real apps (mechanisms only — all new code below
is original; see "Teardown sources") and implemented the five highest-value
non-infringing learnings:

1. **Streaming generation** — `POST /api/chat/stream` (SSE) forwards
   upstream deltas; the frontend renders chapters as they arrive with a
   blinking cursor on the in-progress chapter. Falls back to `/api/chat`
   if streaming is unavailable. No retries on the stream (a retry would
   duplicate already-rendered output).
2. **Offline demo mode** — when the AI is unavailable (no key, quota,
   outage), "Try the offline demo" composes a seeded timeline locally
   from hand-written beats. Deterministic per seed; "Re-roll demo"
   generates a fresh one. Always labeled "Offline demo — written
   locally, not by AI." Branches and continue/extend also work offline.
3. **Continue-from-branch (time travel)** — any branch card has
   "▶ continue the story from here": the branch becomes canon and all
   later years are rewritten from it. Earlier chapters keep their
   branches; only the chosen year's alternates are dropped.
4. **Export / import / share card** — download a versioned JSON export,
   import it back (strict validation), or copy a short teaser "share card"
   for chats/posts. Exports carry an `offline` flag so a demo is never
   mistaken for an AI timeline.
5. **Achievements** — 8 localStorage milestones (First Timeline, Decade
   Dreamer, Branch Explorer, Time Traveler, Story Extender, Keeper,
   Sharer, Offline Explorer) announced with toast + fanfare + confetti.
   Plus **＋ Extend 5 years** (up to 30 total) for the retention loop.

Also new: `npm test` suite (26 tests, all passing at release).

## Teardown sources (mechanism-level study, 2026-10-14)

- **Rise to Power** (`mkgotbank/rise-to-power`, MIT) — commit
  `92e0fedb0996ce0b9197b7a65a0f581620cddb15`. Mechanisms studied:
  data-driven event deck (`{id, cond, eff, choices/outcomes}`),
  seeded PRNG for reproducible lives, versioned localStorage save,
  snapshot/time-travel restore, achievements, headless smoke tests.
- **AI-RPG** (`Infinityy1001/AI-RPG`, no LICENSE file — studied at
  mechanism level only, nothing copied) — commit
  `e4820c0b9a990e7303633c048a61b51e7643f4d7`. Mechanisms studied:
  streaming chat completions with typewriter rendering, strict
  scene-plus-choices output contract, accumulating story-history
  context, round cap as a session end-state.
- **what-if-simulator** (`onlyhimank/what-if-simulator`, no LICENSE file —
  studied at mechanism level only, nothing copied) — commit
  `db7780c2327f5e2e3f203860002b072066556780`. Mechanisms studied:
  JSON scenario data + rule-based fallback generation when no exact
  match exists, localStorage history capped at 12 entries.

REA (`analyze-javascript-application`) was run on all three artifacts for
structural inventory (module graph, storage calls, endpoints). REA on the
React/JSX repo failed to parse JSX — recorded, and that repo was studied
by direct source reading instead. No proprietary code, assets, strings,
brand names, or trademarks were copied from any of them.

## Deliberately NOT built

- **In-browser LLM (WebLLM-style local model)** — AI-RPG runs a model
  fully client-side. Skipped: multi-hundred-MB downloads, no commercial
  story quality guarantee on this app's free tier, and it would break
  the zero-config story. The offline beat-composer covers the
  no-key case at zero cost instead.
- **Full stats/choice sim (Rise to Power-style)** — health/happiness/
  money stats, careers, crimes, relationships. Skipped: it would turn
  an AI storytelling app into a different game. The continue-from-branch
  feature captures the branching depth without the stats machinery.
- **Login-gated attempts / paywalls** — the namesake repo gates
  generations behind a local login after free attempts. Skipped: this
  app is explicitly free with no signup walls.
- **Server-side persistence / accounts** — saves stay in the browser
  (localStorage) + portable JSON files. No database, no accounts, no
  new privacy surface.
- **Social share intents (X/Twitter/WhatsApp URLs)** — share card is
  clipboard text only. Platform share URLs would add tracking params
  and break the no-external-dependency stance.

## QA

- `npm test` — 26/26 pass (story, rng, offline, achievements/share, server).
- `node --check` on every `js/*.js`, `server.js`, `test/*.mjs` — clean.
- Live server vs a mock SSE upstream: `/api/health` 200,
  `/ready` 200 with key / 503 without, `/api/chat/stream` emits
  `data: {"delta": ...}` chunks + `data: {"done": true}`, bad body → 400
  JSON, no-key → 500 JSON with a safe message. Static files serve 200.
- Not yet verified in a real browser: streaming render + branch-continue
  + export/import click-through (no browser harness in this environment).
  The coordinator should spot-check those three flows once.
