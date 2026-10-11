// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
/**
 * What-If Life Simulator — API
 * ------------------------------
 * Minimal Express backend for the What-If Life Simulator frontend.
 *
 * POST /api/chat proxies a messages array to an OpenAI-compatible
 * /v1/chat/completions endpoint. Out of the box it points at Google's FREE
 * Gemini OpenAI-compatible endpoint, so the app runs at $0 with a free
 * API key from https://aistudio.google.com/apikey
 *
 * The key lives ONLY in the AI_API_KEY environment variable — never in code,
 * never in logs, never in client responses.
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const PORT = Number(process.env.PORT) || 3000;
const AI_API_KEY = (process.env.AI_API_KEY || "").trim();
const AI_BASE_URL = (
  process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai"
).replace(/\/+$/, "");
const AI_MODEL = process.env.AI_MODEL || "gemini-3.8-flash";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 60_000;
const AI_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 2000;
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE) || 0.85;
const FRONTEND_URL = (process.env.FRONTEND_URL || "").trim();
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 120;
const TRUST_PROXY = process.env.TRUST_PROXY ?? "1"; // set "1" on Render/Heroku-style hosts

const VERSION = "1.0.0";

/* ------------------------------------------------------------------ */
/* Structured logger (JSON lines; never logs message contents or keys) */
/* ------------------------------------------------------------------ */

function log(level, fields = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: "what-if-simulator",
    version: VERSION,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/* ------------------------------------------------------------------ */
/* System prompt — the story contract (review changes carefully)       */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are "The Chronicler" — a warm, vivid storyteller who writes alternate life histories. You feel like a wise, well-traveled friend spinning out the most fascinating version of "what could have been."

VOICE
- Second person ("you"), intimate and cinematic. Concrete, specific, human details: names, places, small sensory moments. Never generic filler.
- No moralizing, no advice, no therapy-speak, no productivity tips. You are a storyteller, not a coach.
- Never mention that you are an AI or a language model. Never break character.

FORMAT CONTRACT — mandatory, no exceptions
- Every chapter you write begins on its own line with exactly "YEAR k:" (k is the year number, e.g. "YEAR 1:"), then a space, then the chapter text.
- Each chapter is 60-100 words of narrative prose.
- Plain text only. No markdown, no bold or italics, no bullet points, no headings other than the YEAR markers, no code fences.
- Write exactly the number of chapters requested, then stop. No epilogue, no summary, no questions to the reader.`;

/* ------------------------------------------------------------------ */
/* Provider layer (OpenAI-compatible)                                  */
/* ------------------------------------------------------------------ */

function chatCompletionsUrl(baseUrl) {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new UpstreamError(`AI request timed out after ${timeoutMs}ms`, 504);
    }
    throw new UpstreamError(`AI request failed: ${err?.message || "network error"}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAICompatible(messages) {
  if (!AI_API_KEY) {
    throw new UpstreamError("Server is not configured with an AI API key.", 500);
  }
  const url = chatCompletionsUrl(AI_BASE_URL);
  const body = JSON.stringify({
    model: AI_MODEL,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    temperature: AI_TEMPERATURE,
    max_tokens: AI_MAX_TOKENS,
  });

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body,
    },
    AI_TIMEOUT_MS
  );

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new UpstreamError(`AI endpoint returned non-JSON (HTTP ${res.status})`, 502);
  }

  if (!res.ok) {
    const detail = data?.error?.message || data?.error || `HTTP ${res.status}`;
    // 5xx -> 502 (our problem to absorb). 429/402 pass through untouched so
    // the client can show the right "busy, try again" UX instead of a
    // generic error.
    const status = res.status >= 500 ? 502 : res.status;
    throw new UpstreamError(`AI endpoint error: ${detail}`, status);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new UpstreamError("AI endpoint returned an empty reply.", 502);
  }
  return text;
}

/**
 * Resilient completion with retries and backoff.
 * - 502/504 (transient): longer retries, likely to clear on their own.
 * - 429/402 (throttle/quota): brief retries only — sustained throttling
 *   surfaces as a proper 429 so the client shows "busy, try again".
 */
async function callAIWithRetry(messages) {
  const transientDelays = [1500, 6000, 18000];
  const throttleDelays = [2000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOpenAICompatible(messages);
    } catch (err) {
      const retryable =
        err instanceof UpstreamError &&
        (err.status === 502 || err.status === 504 || err.status === 429 || err.status === 402);
      if (!retryable) throw err;
      const throttled = err.status === 429 || err.status === 402;
      const delays = throttled ? throttleDelays : transientDelays;
      if (attempt >= delays.length) throw err;
      const wait = delays[attempt];
      log("warn", {
        event: "ai_retry",
        attempt: attempt + 1,
        waitMs: wait,
        status: err.status,
      });
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Request validation                                                  */
/* ------------------------------------------------------------------ */

const MAX_MESSAGES = 50;
const MAX_CHARS_PER_MESSAGE = 4000;
const MAX_TOTAL_CHARS = 20000;

function normalizeMessages(input) {
  return (input || [])
    .filter(Boolean)
    .map((msg) => {
      const role = msg.role === "assistant" ? "assistant" : "user";
      let content = "";
      if (Array.isArray(msg.content)) {
        content = msg.content
          .map((part) => (typeof part === "string" ? part : part?.text || ""))
          .join("\n");
      } else {
        content = String(msg.content ?? "");
      }
      return { role, content: content.trim() || " " };
    });
}

function validateChatBody(body) {
  const { messages } = body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return "messages must be a non-empty array";
  }
  if (messages.length > MAX_MESSAGES) {
    return `messages must contain at most ${MAX_MESSAGES} entries`;
  }
  let total = 0;
  for (const m of messages) {
    const text = Array.isArray(m?.content)
      ? m.content.map((p) => (typeof p === "string" ? p : p?.text || "")).join("\n")
      : String(m?.content ?? "");
    if (text.length > MAX_CHARS_PER_MESSAGE) {
      return `a single message must be at most ${MAX_CHARS_PER_MESSAGE} characters`;
    }
    total += text.length;
  }
  if (total > MAX_TOTAL_CHARS) {
    return `messages must total at most ${MAX_TOTAL_CHARS} characters`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */

const app = express();

if (TRUST_PROXY) app.set("trust proxy", TRUST_PROXY);

app.use(helmet());
app.use(express.json({ limit: "256kb" }));

// CORS allowlist via FRONTEND_URL (comma-separated). Default is open, with a
// loud startup warning so nobody ships that by accident.
const allowedOrigins = FRONTEND_URL.split(",").map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  })
);

// Per-IP rate limiting on the chat endpoint.
const chatLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment and try again." },
});

// Request-id + structured access log (counts only, never message contents).
app.use((req, res, next) => {
  req.id = crypto.randomUUID().slice(0, 8);
  const start = Date.now();
  res.on("finish", () => {
    log(res.statusCode >= 500 ? "error" : "info", {
      event: "request",
      reqId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
});

const bootTime = Date.now();

// Static frontend (single-service deploy: API + UI share one origin).
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "what-if-simulator", version: VERSION, status: "running" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: Math.floor((Date.now() - bootTime) / 1000) });
});

app.get("/ready", (_req, res) => {
  if (!AI_API_KEY) {
    return res.status(503).json({ ready: false, reason: "AI_API_KEY is not configured" });
  }
  res.json({ ready: true, model: AI_MODEL });
});

app.post("/api/chat", chatLimiter, async (req, res) => {
  const problem = validateChatBody(req.body);
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  try {
    const messages = normalizeMessages(req.body.messages);
    const reply = await callAIWithRetry(messages);
    return res.json({ reply });
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 500;
    log("error", {
      event: "chat_failed",
      reqId: req.id,
      model: AI_MODEL,
      error: err?.message,
    });
    // Never leak upstream internals or keys to the client.
    const busy = status === 429 || status === 402; // 402 = free-tier quota exhausted upstream
    const safe = busy
      ? "The storyteller is busy right now — please wait a moment and try again."
      : status === 500 && !AI_API_KEY
        ? "This server has no AI API key configured. The owner needs to set AI_API_KEY."
        : "Something went wrong asking the storyteller. Please try again in a moment.";
    return res.status(status).json({ error: safe });
  }
});

// 404 for anything else.
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// JSON error handler — body-parser failures (malformed JSON, oversized
// bodies) must not fall through to Express's default HTML error page,
// which leaks stack traces and absolute paths to API clients.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  log("error", { event: "unhandled_error", error: err?.message });
  return res.status(500).json({ error: "Something went wrong. Try again in a moment." });
});

/* ------------------------------------------------------------------ */
/* Boot + graceful shutdown                                            */
/* ------------------------------------------------------------------ */

const server = process.env.WHATIF_NO_LISTEN === "1" ? null : app.listen(PORT, () => {
  log("info", {
    event: "boot",
    port: PORT,
    model: AI_MODEL,
    baseUrl: AI_BASE_URL,
    keyConfigured: Boolean(AI_API_KEY),
    cors: allowedOrigins.length > 0 ? allowedOrigins : "open (FRONTEND_URL not set)",
  });
  if (!allowedOrigins.length) {
    log("warn", { event: "cors_open", hint: "Set FRONTEND_URL to lock the API to your site." });
  }
  if (!AI_API_KEY) {
    log("warn", { event: "missing_key", hint: "Set AI_API_KEY — /api/chat will return 500 until you do." });
  }
});

function shutdown(signal) {
  log("info", { event: "shutdown", signal });
  if (!server) {
    process.exit(0);
    return;
  }
  server.close(() => {
    log("info", { event: "shutdown_complete" });
    process.exit(0);
  });
  setTimeout(() => {
    log("warn", { event: "shutdown_forced" });
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;

// Named exports for unit testing (import with WHATIF_NO_LISTEN=1).
export { validateChatBody, normalizeMessages, chatCompletionsUrl };
