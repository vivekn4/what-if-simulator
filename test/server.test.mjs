// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// Tests for server.js pure helpers — run with: npm test
// WHATIF_NO_LISTEN=1 keeps the import side-effect-free (no port bind).
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateChatBody,
  normalizeMessages,
  chatCompletionsUrl,
  extractChatDelta,
} from "../server.js";

test("server: validateChatBody rejects bad bodies", () => {
  assert.ok(validateChatBody({}));
  assert.ok(validateChatBody({ messages: [] }));
  assert.ok(validateChatBody({ messages: [{ role: "user", content: "x".repeat(4001) }] }));
  assert.equal(validateChatBody({ messages: [{ role: "user", content: "hello" }] }), null);
});

test("server: normalizeMessages trims and coerces roles", () => {
  const out = normalizeMessages([
    { role: "system", content: "  hi  " },
    { role: "assistant", content: [{ text: "a" }, { text: "b" }] },
  ]);
  assert.deepEqual(out, [
    { role: "user", content: "hi" },
    { role: "assistant", content: "a\nb" },
  ]);
});

test("server: chatCompletionsUrl appends path once", () => {
  assert.equal(
    chatCompletionsUrl("https://example.com/v1beta/openai"),
    "https://example.com/v1beta/openai/chat/completions"
  );
  assert.equal(
    chatCompletionsUrl("https://example.com/v1beta/openai/chat/completions/"),
    "https://example.com/v1beta/openai/chat/completions"
  );
});

test("server: extractChatDelta handles delta + message + empty chunks", () => {
  assert.equal(
    extractChatDelta({ choices: [{ delta: { content: "hello" } }] }),
    "hello"
  );
  assert.equal(
    extractChatDelta({ choices: [{ message: { content: "full" } }] }),
    "full"
  );
  assert.equal(extractChatDelta({ choices: [{ delta: {} }] }), "");
  assert.equal(extractChatDelta({}), "");
  assert.equal(extractChatDelta(null), "");
});
