# 🔮 What If — Life Simulator

## Screenshot

![Screenshot](assets/screenshot.png)
![What If banner](assets/banner.jpg)

![Made by VN](https://img.shields.io/badge/made%20by-VN-blue)

Type any life decision — *"What if I quit my job to travel the world?"* — and watch the next ten years unfold as an AI-written branching story. Every year becomes a chapter on a beautiful timeline, and any chapter can be rewritten with **"↳ explore an alternative"** to see how else it could have gone.

100% free to run: Node backend + zero-build static frontend + a free Gemini API key. No paid services, no signup walls.

## ✨ Features

- **Year-by-year timelines** — pick 1, 5, or 10 years; The Chronicler (AI storyteller) writes one vivid chapter per year
- **Streaming generation** — chapters appear as the storyteller writes them (`POST /api/chat/stream`, SSE), with automatic fallback to the one-shot endpoint
- **Offline demo mode** — no AI key? "Try the offline demo" composes a seeded sample timeline locally from story beats (clearly labeled, never pretending to be AI), with re-roll, branches, continue, and extend all working offline
- **Three tones** — Realistic, Optimistic, or Darkly comic
- **Branching alternatives** — rewrite any chapter to explore a different path; add as many branches as you like
- **Continue from a branch** — promote any alternative to canon and rewrite every later year from that new path (time travel)
- **Extend the story** — add 5 more years at a time, up to 30 total
- **Achievements** — 8 milestones (First Timeline, Decade Dreamer, Branch Explorer, Time Traveler, …) with toast + fanfare + confetti
- **Copy timeline** as plain text (clipboard with fallback)
- **Share card** — copy a short teaser text for chats/posts
- **Export / import** — download a versioned JSON file of any timeline and import it back (validated)
- **Save timelines** to your browser (localStorage) — reopen or delete them anytime
- **Warm editorial design** — serif storytelling aesthetic, mobile-responsive, reduced-motion friendly
- **Synthesized SFX** — zero-asset WebAudio sound engine: whooshes on generation, chimes on timeline completion, branch and save jingles (mutable, persisted)
- **Canvas VFX** — ambient golden dust motes, confetti when your decade is written, sparkles on new branches, shimmering timeline spine; auto-quality scaling + `prefers-reduced-motion` support
- **Hardened API** — helmet, CORS allowlist, per-IP rate limiting, 60s upstream timeout with retries, structured JSON logging, graceful JSON errors (never stack traces)

## 🚀 Quickstart

**1. Clone and install**

```bash
git clone https://github.com/vivekn4/what-if-simulator.git
cd what-if-simulator
npm install
```

**2. Get a free API key**

Grab a free Gemini API key from Google AI Studio (no credit card):

👉 https://aistudio.google.com/apikey

**3. Configure**

```bash
cp .env.example .env
# then edit .env and set AI_API_KEY=your-key-here
```

**4. Run**

```bash
npm start
```

Open http://localhost:3000 — type a what-if, hit **Generate my timeline**.

> Without `AI_API_KEY`, the UI loads fine but `/api/chat` returns a clean JSON 500 explaining the key is missing. Nothing crashes.

## ☁️ Deploy to Render (free)

1. Push this repo to GitHub.
2. In Render: **New → Web Service →** select the repo.
3. Render reads `render.yaml` automatically (build: `npm install`, start: `npm start`).
4. In the service's **Environment** tab, add `AI_API_KEY` with your free Gemini key.
5. Deploy — the frontend and API share one origin, so no CORS config is needed. (If you host the frontend elsewhere, set `FRONTEND_URL` to your site's origin.)

## 🔌 API

### `GET /api/health`

```bash
curl http://localhost:3000/api/health
# {"ok":true,"app":"what-if-simulator","version":"1.0.0","status":"running"}
```

### `GET /ready`

Returns `200 {"ready":true}` when `AI_API_KEY` is configured, otherwise `503`.

### `POST /api/chat`

```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"What if I moved to Toronto? Write exactly 2 chapters, one per year, each starting with YEAR n:"}]}'
```

Response: `{"reply": "YEAR 1:\n..."}`. Errors are always JSON: `{"error": "..."}`.

### `POST /api/chat/stream`

Same body as `/api/chat`, but the response is a server-sent-events stream:
`data: {"delta": "..."}` chunks followed by `data: {"done": true}` (or
`data: {"error": "..."}`). If streaming is unavailable, the client falls
back to `/api/chat`. No retries on the stream — a retry would duplicate
already-rendered output.

## 🧠 How the story contract works

The backend's system prompt forces a strict, parseable format:

- Every chapter begins on its own line with exactly `YEAR n:` followed by 60–100 words of prose
- Plain text only — no markdown, no headings, no epilogue

The frontend (`js/story.js`) parses on those markers, and falls back gracefully: if the model ever skips the markers, the response is split into paragraphs and labeled sequentially. Branch requests ask the model for a single alternative chapter, which is inserted as an indented branch card under the original.

## 📁 Project structure

```
what-if-simulator/
├── server.js          # Express API: /api/chat + /api/chat/stream (SSE) + static frontend hosting
├── index.html         # App shell (landing + timeline views)
├── css/style.css      # Warm editorial styling, responsive
├── js/
│   ├── config.js      # Runtime API_URL config (default: same-origin /api/chat)
│   ├── story.js       # Pure chapter parser + HTML escaper (unit-testable, no DOM)
│   ├── rng.js         # Seeded PRNG for deterministic offline demos
│   ├── offline.js     # "Chronicler-lite": seeded local demo timeline composer
│   ├── achievements.js# Milestone defs + localStorage stats
│   ├── share.js       # Export/import validation + share-card text
│   └── app.js         # UI logic: generate (streaming), branch, continue, extend, copy, share, export/import, save, load
├── test/              # node:test suite (npm test)
├── PLAN.md            # Living plan + teardown sources + deliberately-not-built list
├── package.json
├── .env.example       # All config knobs, documented
├── render.yaml        # One-click Render deploy
├── LICENSE            # MIT
└── README.md
```

## 🔒 Security notes

- The API key lives **only** in the `AI_API_KEY` env var — never in code, logs, or client responses.
- All AI-generated text is injected via `textContent`, never raw `innerHTML` (the one exception, toast messages, passes through an HTML escaper first).
- Rate limiting: 120 chat requests per IP per 15 minutes (tunable via env).
- Set `FRONTEND_URL` to lock CORS to your domain before going live.

## 📄 License

MIT — see [LICENSE](LICENSE). Built by Vivek Nair.

---

**Crafted by [Vivek Nair](https://github.com/vivekn4) · VN**
