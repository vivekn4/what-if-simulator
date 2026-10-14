// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
/**
 * What-If Life Simulator — frontend app logic.
 *
 * Views: landing (scenario form + saved timelines) and timeline (chapters).
 * All AI-provided text is injected via textContent — never raw innerHTML.
 * The only innerHTML usage is the toast, whose message goes through
 * escapeHtml() first.
 */
import { escapeHtml, parseChapters } from "./story.js";
import { Sfx } from "./sfx.js";
import { Vfx } from "./vfx.js";
import { generateOfflineTimeline, generateOfflineBranch, offlineSeedFor } from "./offline.js";
import { Achievements } from "./achievements.js";
import { serializeTimeline, parseTimelineExport, buildShareCard } from "./share.js";

  const API_URL =
    (window.WHATIF_CONFIG && window.WHATIF_CONFIG.API_URL) || "/api/chat";
  const CLIENT_TIMEOUT_MS = 75_000; // a little above the server's 60s upstream timeout
  const SAVE_KEY = "whatif.savedTimelines.v1";
  const MAX_SAVED = 20;

  const TONES = {
    realistic: "grounded and believable — good luck and setbacks in realistic measure",
    optimistic: "hopeful and uplifting — things mostly work out, setbacks become fuel",
    dark: "wry and darkly comic — Murphy's law with a wink, funny even when it stings",
  };
  const TONE_LABELS = {
    realistic: "Realistic",
    optimistic: "Optimistic",
    dark: "Darkly comic",
  };

  /* ---------------- element refs ---------------- */

  const $ = (id) => document.getElementById(id);

  const viewLanding = $("view-landing");
  const viewTimeline = $("view-timeline");
  const generateForm = $("generate-form");
  const scenarioInput = $("scenario-input");
  const yearsSelect = $("years-select");
  const toneSelect = $("tone-select");
  const generateBtn = $("generate-btn");
  const generateBtnLabel = $("generate-btn-label");
  const generateBtnSpinner = $("generate-btn-spinner");
  const formError = $("form-error");
  const savedList = $("saved-list");
  const savedEmpty = $("saved-empty");
  const timelineTitle = $("timeline-title");
  const timelineSubtitle = $("timeline-subtitle");
  const timelineEl = $("timeline");
  const timelineLoading = $("timeline-loading");
  const timelineError = $("timeline-error");
  const copyBtn = $("copy-btn");
  const shareBtn = $("share-btn");
  const exportBtn = $("export-btn");
  const importBtn = $("import-btn");
  const importFile = $("import-file");
  const extendBtn = $("extend-btn");
  const rerollBtn = $("reroll-btn");
  const saveBtn = $("save-btn");
  const startoverBtn = $("startover-btn");
  const offlineBtn = $("offline-btn");
  const offlineRetryBtn = $("offline-retry-btn");
  const achievementsList = $("achievements-list");
  const toast = $("toast");
  const sfxToggle = $("sfx-toggle");

  /* ---------------- state ---------------- */

  // { scenario, years, tone, chapters: [{ year, text, branches: [text] }],
  //   offline: bool, offlineSeed: string|null, offlineSalt: number }
  let state = null;
  let generating = false;

  /* ---------------- helpers ---------------- */

  function showError(el, message) {
    el.textContent = message;
    el.hidden = false;
  }

  function hideError(el) {
    el.hidden = true;
    el.textContent = "";
  }

  let toastTimer = null;
  function showToast(message, kind) {
    toast.innerHTML =
      '<span class="toast-icon" aria-hidden="true">' +
      (kind === "error" ? "⚠️" : "✨") +
      "</span><span>" +
      escapeHtml(message) +
      "</span>";
    toast.hidden = false;
    toast.classList.toggle("toast-error", kind === "error");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 4000);
  }

  function setGeneratingUI(on) {
    generateBtn.disabled = on;
    generateBtnLabel.textContent = on ? "Writing your timeline…" : "Generate my timeline";
    generateBtnSpinner.hidden = !on;
  }

  function showView(name) {
    const landing = name === "landing";
    viewLanding.hidden = !landing;
    viewTimeline.hidden = landing;
  }

  /* ---------------- achievements ---------------- */

  function announceUnlocks(defs) {
    if (!defs || !defs.length) return;
    for (const d of defs) {
      showToast(`${d.icon} Achievement unlocked: ${d.title} — ${d.desc}`);
    }
    Sfx.fanfare();
    Vfx.confetti(window.innerWidth / 2, 140);
    renderAchievements();
  }

  function renderAchievements() {
    if (!achievementsList) return;
    const unlocked = Achievements.unlockedDefs();
    achievementsList.innerHTML = "";
    if (!unlocked.length) {
      const li = document.createElement("li");
      li.className = "achievement-item muted";
      li.textContent = "No achievements yet — generate a timeline to start.";
      achievementsList.appendChild(li);
      return;
    }
    for (const d of unlocked) {
      const li = document.createElement("li");
      li.className = "achievement-item";
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = d.icon;
      const text = document.createElement("span");
      text.textContent = `${d.title} — ${d.desc}`;
      li.appendChild(icon);
      li.appendChild(text);
      achievementsList.appendChild(li);
    }
  }

  /* ---------------- AI prompts ---------------- */

  function buildTimelinePrompt(scenario, years, tone) {
    const toneDesc = TONES[tone] || TONES.realistic;
    return (
      "What if I " +
      scenario +
      "?\n\n" +
      "Write an alternate history of my life covering the next " +
      years +
      " year(s), starting in 2026. " +
      "Write exactly " +
      years +
      " chapter(s), one per year, following your format contract. " +
      "Overall tone: " +
      toneDesc +
      "."
    );
  }

  function buildBranchPrompt(scenario, tone, year, chapterText) {
    const toneDesc = TONES[tone] || TONES.realistic;
    return (
      'The life story so far — "What if I ' +
      scenario +
      '?" (' +
      toneDesc +
      ").\n\n" +
      "The chapter being rewritten (YEAR " +
      year +
      "):\n" +
      chapterText +
      "\n\n" +
      "Now write ONE alternative version of YEAR " +
      year +
      " — a genuinely different path from that same point in the story, not a small tweak. " +
      "60–100 words. " +
      'Begin with the line "YEAR ' +
      year +
      ':" and follow your format contract.'
    );
  }

  function buildContinuePrompt(scenario, tone, priorChapters, fromYear, toYear) {
    const toneDesc = TONES[tone] || TONES.realistic;
    const soFar = priorChapters
      .map((c) => `YEAR ${c.year}:\n${c.text}`)
      .join("\n\n");
    const count = toYear - fromYear;
    return (
      'The life story so far — "What if I ' +
      scenario +
      '?" (' +
      toneDesc +
      ").\n\n" +
      soFar +
      "\n\n" +
      "Continue the story from there. Write exactly " +
      count +
      " chapter(s), one per year, for YEARS " +
      (fromYear + 1) +
      " through " +
      toYear +
      ", following your format contract. " +
      "Keep continuity with the story so far: same people, places, and consequences."
    );
  }

  async function callChat(messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON error body — handled below via res.ok */
      }
      if (!res.ok) {
        throw new Error(data.error || "Request failed (HTTP " + res.status + ").");
      }
      if (!data.reply || typeof data.reply !== "string" || !data.reply.trim()) {
        throw new Error("The storyteller returned an empty reply. Please try again.");
      }
      return data.reply;
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("The storyteller took too long — please try again.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Streaming chat: consumes the server-sent-events endpoint, calling
   * onDelta(delta, full) as chunks arrive, and resolves with the full reply.
   * Throws on non-SSE responses (caller falls back to callChat) or on an
   * error event from the server.
   */
  async function callChatStream(messages, onDelta) {
    const res = await fetch(API_URL + "/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      let data = {};
      try {
        data = await res.json();
      } catch {
        /* fall through */
      }
      throw new Error(data.error || "Streaming unavailable (HTTP " + res.status + ").");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of event.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          let payload;
          try {
            payload = JSON.parse(trimmed.slice(5).trim());
          } catch {
            continue;
          }
          if (payload.error) throw new Error(payload.error);
          if (payload.delta) {
            full += payload.delta;
            if (onDelta) onDelta(payload.delta, full);
          }
          if (payload.done) return full;
        }
      }
    }
    if (!full.trim()) throw new Error("The storyteller returned an empty reply. Please try again.");
    return full;
  }

  /**
   * Prefer streaming (progressive reveal); fall back to the one-shot
   * endpoint when streaming is unavailable. Returns the full reply.
   */
  async function generateWithStreamOrFallback(messages, onDelta) {
    try {
      return await callChatStream(messages, onDelta);
    } catch {
      return await callChat(messages);
    }
  }

  /* ---------------- timeline rendering ---------------- */

  function buildChapterCard(chapter, idx, interactive = true) {
    const article = document.createElement("article");
    article.className = "chapter";

    const marker = document.createElement("div");
    marker.className = "chapter-marker";
    const badge = document.createElement("span");
    badge.className = "year-badge";
    badge.textContent = "Year " + chapter.year;
    marker.appendChild(badge);

    const body = document.createElement("div");
    body.className = "chapter-body";

    const text = document.createElement("p");
    text.className = "chapter-text";
    text.textContent = chapter.text; // textContent: AI output can never become HTML
    body.appendChild(text);

    const branchList = document.createElement("div");
    branchList.className = "branch-list";
    chapter.branches.forEach((branchText, bIdx) => {
      branchList.appendChild(
        buildBranchCard(branchText, interactive ? () => handleContinueFromBranch(idx, bIdx) : null)
      );
    });
    body.appendChild(branchList);

    if (interactive) {
      const branchBtn = document.createElement("button");
      branchBtn.type = "button";
      branchBtn.className = "branch-btn";
      branchBtn.textContent = "↳ explore an alternative";
      branchBtn.addEventListener("click", () => handleBranch(idx, branchBtn, branchList));
      body.appendChild(branchBtn);
    }

    article.appendChild(marker);
    article.appendChild(body);
    return article;
  }

  function buildBranchCard(branchText, onContinue) {
    const card = document.createElement("div");
    card.className = "branch-card";

    const label = document.createElement("span");
    label.className = "branch-label";
    label.textContent = "Alternative path";

    const text = document.createElement("p");
    text.className = "branch-text";
    text.textContent = branchText; // textContent: AI output can never become HTML

    card.appendChild(label);
    card.appendChild(text);
    if (onContinue) {
      const contBtn = document.createElement("button");
      contBtn.type = "button";
      contBtn.className = "branch-continue-btn";
      contBtn.textContent = "▶ continue the story from here";
      contBtn.addEventListener("click", onContinue);
      card.appendChild(contBtn);
    }
    return card;
  }

  function renderTimeline(interactive = true) {
    timelineEl.innerHTML = "";
    if (state && state.offline) {
      const badge = document.createElement("p");
      badge.className = "offline-badge";
      badge.textContent =
        "📴 Offline demo — written locally from story beats, not by AI. Seed: " +
        (state.offlineSeed || "demo");
      timelineEl.appendChild(badge);
    }
    state.chapters.forEach((chapter, idx) => {
      const card = buildChapterCard(chapter, idx, interactive);
      card.style.animationDelay = Math.min(idx * 70, 700) + "ms";
      timelineEl.appendChild(card);
    });
    if (rerollBtn) rerollBtn.hidden = !(state && state.offline);
  }

  async function handleBranch(idx, btn, branchList) {
    if (btn.disabled) return;
    const chapter = state.chapters[idx];
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "Dreaming up an alternative…";

    const loadingCard = document.createElement("div");
    loadingCard.className = "branch-card branch-card-loading";
    const loadingText = document.createElement("p");
    loadingText.className = "branch-text";
    loadingText.textContent = "The Chronicler is imagining how else it could have gone…";
    loadingCard.appendChild(loadingText);
    branchList.appendChild(loadingCard);

    try {
      let alt;
      if (state.offline) {
        // Offline demo: compose the alternative locally, no network.
        alt = generateOfflineBranch({
          scenario: state.scenario,
          tone: state.tone,
          year: chapter.year,
          years: state.years,
          chapterText: chapter.text,
          seed: (state.offlineSalt || 0) + chapter.branches.length + 1,
        });
      } else {
        const reply = await callChat([
          {
            role: "user",
            content: buildBranchPrompt(state.scenario, state.tone, chapter.year, chapter.text),
          },
        ]);
        const parsed = parseChapters(reply, chapter.year);
        alt = parsed.length ? parsed[0].text : reply.trim();
      }
      if (!alt) throw new Error("The storyteller returned an empty reply. Please try again.");
      chapter.branches.push(alt);
      loadingCard.remove();
      const newBranchIdx = chapter.branches.length - 1;
      const newCard = buildBranchCard(alt, () => handleContinueFromBranch(idx, newBranchIdx));
      branchList.appendChild(newCard);
      announceUnlocks(Achievements.record("branches"));
      Sfx.successChime();
      const r = btn.getBoundingClientRect();
      Vfx.sparkle(r.left + r.width / 2, r.top);
    } catch (err) {
      loadingCard.remove();
      Sfx.errorBuzz();
      showToast(err.message || "Could not dream up an alternative.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  /**
   * Time-travel: promote a branch to canon for its year, drop the other
   * alternates for that year, and rewrite every later year so the story
   * continues from the new path. Offline timelines regenerate locally.
   */
  async function handleContinueFromBranch(idx, branchIdx) {
    if (generating) return;
    const chapter = state.chapters[idx];
    const alt = chapter.branches[branchIdx];
    if (!alt) return;
    if (idx === state.chapters.length - 1) {
      // Last chapter: nothing after it to rewrite — just promote it.
      chapter.text = alt;
      chapter.branches = [];
      renderTimeline();
      announceUnlocks(Achievements.record("continues"));
      Sfx.successChime();
      showToast("That alternative is now the story.");
      return;
    }
    if (
      !window.confirm(
        "Continue from this alternative? Year " +
          chapter.year +
          " will become the main story and every later year will be rewritten."
      )
    ) {
      return;
    }
    generating = true;
    Sfx.whoosh();
    timelineLoading.hidden = false;
    try {
      const newChapters = state.chapters.slice(0, idx + 1).map((c) => ({
        year: c.year,
        text: c.text,
        branches: c.branches ? c.branches.slice() : [],
      }));
      newChapters[idx].text = alt;
      newChapters[idx].branches = [];
      const fromYear = chapter.year;
      const toYear = state.years;
      let fresh;
      if (state.offline) {
        fresh = generateOfflineTimeline({
          scenario: state.scenario,
          years: toYear,
          tone: state.tone,
          seed: `continue-${state.offlineSalt || 0}-${fromYear}`,
        })
          .filter((c) => c.year > fromYear)
          .map((c) => ({ year: c.year, text: c.text, branches: [] }));
      } else {
        const reply = await generateWithStreamOrFallback([
          {
            role: "user",
            content: buildContinuePrompt(state.scenario, state.tone, newChapters, fromYear, toYear),
          },
        ]);
        fresh = parseChapters(reply, toYear - fromYear).map((c) => ({
          year: c.year,
          text: c.text,
          branches: [],
        }));
        // The model returns years 1..N for the continuation; relabel to real years.
        fresh.forEach((c, i) => {
          c.year = fromYear + 1 + i;
        });
      }
      if (!fresh.length) throw new Error("The storyteller returned an empty reply. Please try again.");
      state.chapters = [...newChapters, ...fresh];
      renderTimeline();
      announceUnlocks(Achievements.record("continues"));
      Sfx.successChime();
      Vfx.confetti(window.innerWidth / 2, 160);
      showToast("Timeline rewritten from Year " + fromYear + ".");
    } catch (err) {
      Sfx.errorBuzz();
      showToast(err.message || "Could not continue from that branch.", "error");
    } finally {
      timelineLoading.hidden = true;
      generating = false;
    }
  }

  /** Extend the timeline by 5 more years from where it ends. */
  async function handleExtend() {
    if (generating || !state || !state.chapters.length) return;
    if (state.years >= 30) {
      showToast("30 years is the longest timeline — time to start a new what-if.", "error");
      return;
    }
    generating = true;
    Sfx.whoosh();
    timelineLoading.hidden = false;
    const fromYear = state.years;
    const toYear = Math.min(30, fromYear + 5);
    try {
      let fresh;
      if (state.offline) {
        fresh = generateOfflineTimeline({
          scenario: state.scenario,
          years: toYear,
          tone: state.tone,
          seed: `extend-${state.offlineSalt || 0}-${fromYear}`,
        })
          .filter((c) => c.year > fromYear)
          .map((c) => ({ year: c.year, text: c.text, branches: [] }));
      } else {
        const reply = await generateWithStreamOrFallback([
          {
            role: "user",
            content: buildContinuePrompt(state.scenario, state.tone, state.chapters, fromYear, toYear),
          },
        ]);
        fresh = parseChapters(reply, toYear - fromYear).map((c) => ({
          year: c.year,
          text: c.text,
          branches: [],
        }));
        fresh.forEach((c, i) => {
          c.year = fromYear + 1 + i;
        });
      }
      if (!fresh.length) throw new Error("The storyteller returned an empty reply. Please try again.");
      state.chapters = [...state.chapters, ...fresh];
      state.years = toYear;
      timelineSubtitle.textContent =
        "A " + toYear + "-year " + TONE_LABELS[state.tone].toLowerCase() + " timeline · written by The Chronicler";
      renderTimeline();
      announceUnlocks(Achievements.record("extends"));
      Sfx.successChime();
      Vfx.confetti(window.innerWidth / 2, 160);
      showToast("Extended to " + toYear + " years.");
    } catch (err) {
      Sfx.errorBuzz();
      showToast(err.message || "Could not extend the timeline.", "error");
    } finally {
      timelineLoading.hidden = true;
      generating = false;
    }
  }

  /** Build an offline demo timeline from the current form values. */
  function handleOfflineDemo() {
    const scenario = scenarioInput.value.trim();
    if (!scenario) {
      Sfx.errorBuzz();
      showError(formError, "Tell me your what-if first — even a few words will do.");
      scenarioInput.focus();
      return;
    }
    const years = parseInt(yearsSelect.value, 10) || 10;
    const tone = toneSelect.value in TONES ? toneSelect.value : "realistic";
    const salt = (state && state.offline ? state.offlineSalt || 0 : 0) + 1;
    const seed = offlineSeedFor({ scenario, tone, years, salt });
    const chapters = generateOfflineTimeline({ scenario, years, tone, seed: salt }).map((c) => ({
      year: c.year,
      text: c.text,
      branches: [],
    }));
    state = { scenario, years, tone, chapters, offline: true, offlineSeed: seed, offlineSalt: salt };
    timelineTitle.textContent = "What if I " + scenario + "?";
    timelineSubtitle.textContent =
      "A " + years + "-year " + TONE_LABELS[tone].toLowerCase() + " timeline · offline demo";
    hideError(timelineError);
    showView("timeline");
    timelineLoading.hidden = true;
    renderTimeline();
    announceUnlocks(Achievements.record("offlineDemos"));
    Sfx.successChime();
    Vfx.confetti(window.innerWidth / 2, 160);
    window.scrollTo({ top: 0 });
  }

  /* ---------------- generate flow ---------------- */

  async function handleGenerate(event) {
    event.preventDefault();
    if (generating) return;

    const scenario = scenarioInput.value.trim();
    hideError(formError);
    if (!scenario) {
      Sfx.errorBuzz();
      showError(formError, "Tell me your what-if first — even a few words will do.");
      scenarioInput.focus();
      return;
    }
    const years = parseInt(yearsSelect.value, 10) || 10;
    const tone = toneSelect.value in TONES ? toneSelect.value : "realistic";

    generating = true;
    setGeneratingUI(true);
    Sfx.whoosh();
    state = { scenario, years, tone, chapters: [], offline: false, offlineSeed: null, offlineSalt: 0 };

    timelineTitle.textContent = "What if I " + scenario + "?";
    timelineSubtitle.textContent =
      "A " + years + "-year " + TONE_LABELS[tone].toLowerCase() + " timeline · written by The Chronicler";
    timelineEl.innerHTML = "";
    hideError(timelineError);
    if (offlineRetryBtn) offlineRetryBtn.hidden = true;
    showView("timeline");
    timelineLoading.hidden = false;

    try {
      // Streaming: chapters appear as the storyteller writes them.
      let lastRender = 0;
      const reply = await generateWithStreamOrFallback(
        [{ role: "user", content: buildTimelinePrompt(scenario, years, tone) }],
        (_delta, full) => {
          const now = Date.now();
          if (now - lastRender < 300) return;
          lastRender = now;
          const partial = parseChapters(full, years).map((c) => ({
            year: c.year,
            text: c.text,
            branches: [],
          }));
          if (partial.length) {
            state.chapters = partial;
            renderTimeline(false);
            const last = timelineEl.lastElementChild;
            if (last) last.classList.add("chapter-streaming");
            timelineLoading.hidden = true;
          }
        }
      );
      const chapters = parseChapters(reply, years).map((c) => ({
        year: c.year,
        text: c.text,
        branches: [],
      }));
      if (!chapters.length) {
        throw new Error("The storyteller returned an empty reply. Please try again.");
      }
      state.chapters = chapters;
      renderTimeline();
      announceUnlocks(Achievements.record("timelines"));
      if (years >= 10) announceUnlocks(Achievements.record("decadeTimelines"));
      Sfx.successChime();
      Vfx.confetti(window.innerWidth / 2, 160);
      timelineEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      Sfx.errorBuzz();
      showError(timelineError, err.message || "Something went wrong. Please try again.");
      // The AI is unavailable (often: no key configured) — offer the demo.
      if (offlineRetryBtn) offlineRetryBtn.hidden = false;
    } finally {
      // Loading state can never get stuck: this finally always runs.
      timelineLoading.hidden = true;
      generating = false;
      setGeneratingUI(false);
    }
  }

  /* ---------------- copy / save / start over ---------------- */

  function timelineToText() {
    const out = [];
    out.push("What if I " + state.scenario + "?");
    out.push(
      "A " + state.years + "-year " + TONE_LABELS[state.tone].toLowerCase() + " timeline." +
        (state.offline ? " (Offline demo.)" : "")
    );
    out.push("");
    state.chapters.forEach((c) => {
      out.push("YEAR " + c.year + ":");
      out.push(c.text);
      out.push("");
      c.branches.forEach((b) => {
        out.push("YEAR " + c.year + " — alternative path:");
        out.push(b);
        out.push("");
      });
    });
    return out.join("\n").trim() + "\n";
  }

  async function handleCopy() {
    if (!state || !state.chapters.length) {
      showToast("Generate a timeline first.", "error");
      return;
    }
    const text = timelineToText();
    try {
      await navigator.clipboard.writeText(text);
      Sfx.successChime();
      showToast("Timeline copied to clipboard.");
      return;
    } catch {
      /* fall through to legacy fallback */
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      const ok = document.execCommand("copy");
      showToast(
        ok ? "Timeline copied to clipboard." : "Copy failed — please select the text manually.",
        ok ? undefined : "error"
      );
    } catch {
      showToast("Copy is not available in this browser.", "error");
    }
    ta.remove();
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function persistSaved(arr) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(arr));
      return true;
    } catch {
      showToast("Could not save — browser storage is unavailable.", "error");
      return false;
    }
  }

  function handleSave() {
    if (!state || !state.chapters.length) {
      showToast("Generate a timeline first.", "error");
      return;
    }
    const saved = loadSaved();
    saved.unshift({
      id: "t" + Date.now().toString(36),
      title: ("What if I " + state.scenario).slice(0, 70),
      scenario: state.scenario,
      years: state.years,
      tone: state.tone,
      offline: Boolean(state.offline),
      offlineSeed: state.offlineSeed || null,
      createdAt: new Date().toISOString(),
      chapters: state.chapters.map((c) => ({
        year: c.year,
        text: c.text,
        branches: c.branches.slice(),
      })),
    });
    if (persistSaved(saved.slice(0, MAX_SAVED))) {
      renderSavedList();
      announceUnlocks(Achievements.record("saves"));
      Sfx.successChime();
      const r = saveBtn.getBoundingClientRect();
      Vfx.sparkle(r.left + r.width / 2, r.top);
      showToast("Timeline saved.");
    }
  }

  /* ---------------- export / import / share ---------------- */

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function handleExport() {
    if (!state || !state.chapters.length) {
      showToast("Generate a timeline first.", "error");
      return;
    }
    const slug = state.scenario.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "timeline";
    downloadJson(`what-if-${slug}.json`, serializeTimeline(state));
    announceUnlocks(Achievements.record("exports"));
    Sfx.successChime();
    showToast("Timeline exported as JSON.");
  }

  async function handleImportFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("That file is not valid JSON.");
      }
      const imported = parseTimelineExport(parsed);
      state = imported;
      timelineTitle.textContent = "What if I " + state.scenario + "?";
      timelineSubtitle.textContent =
        "A " + state.years + "-year " + TONE_LABELS[state.tone].toLowerCase() + " timeline" +
        (state.offline ? " · offline demo" : " · written by The Chronicler");
      yearsSelect.value = String(Math.min(10, Math.max(1, state.years)));
      toneSelect.value = state.tone;
      hideError(timelineError);
      showView("timeline");
      renderTimeline();
      Sfx.successChime();
      showToast("Timeline imported.");
      window.scrollTo({ top: 0 });
    } catch (err) {
      Sfx.errorBuzz();
      showToast(err.message || "Could not import that file.", "error");
    }
  }

  async function handleShareCopy() {
    if (!state || !state.chapters.length) {
      showToast("Generate a timeline first.", "error");
      return;
    }
    const card = buildShareCard(state);
    try {
      await navigator.clipboard.writeText(card);
      announceUnlocks(Achievements.record("shareCopies"));
      Sfx.successChime();
      showToast("Share card copied to clipboard.");
    } catch {
      showToast("Copy is not available in this browser.", "error");
    }
  }

  function renderSavedList() {
    const saved = loadSaved();
    savedList.innerHTML = "";
    savedEmpty.hidden = saved.length > 0;

    saved.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "saved-item";

      const info = document.createElement("div");
      info.className = "saved-info";
      const title = document.createElement("strong");
      title.textContent = entry.title;
      const meta = document.createElement("span");
      meta.className = "saved-meta";
      const d = new Date(entry.createdAt);
      const datePart = isNaN(d.getTime()) ? "" : d.toLocaleDateString() + " · ";
      meta.textContent = datePart + entry.years + "-year timeline";
      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "saved-actions";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "link-btn";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => loadEntry(entry.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "link-btn link-btn-danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        if (!window.confirm("Delete this saved timeline?")) return;
        persistSaved(loadSaved().filter((e) => e.id !== entry.id));
        renderSavedList();
      });

      actions.appendChild(openBtn);
      actions.appendChild(deleteBtn);
      li.appendChild(info);
      li.appendChild(actions);
      savedList.appendChild(li);
    });
  }

  function loadEntry(id) {
    const entry = loadSaved().find((e) => e.id === id);
    if (!entry || !Array.isArray(entry.chapters) || !entry.chapters.length) {
      showToast("That saved timeline could not be opened.", "error");
      return;
    }
    state = {
      scenario: entry.scenario,
      years: entry.years,
      tone: entry.tone in TONES ? entry.tone : "realistic",
      chapters: entry.chapters.map((c) => ({
        year: c.year,
        text: c.text,
        branches: Array.isArray(c.branches) ? c.branches.slice() : [],
      })),
      offline: Boolean(entry.offline),
      offlineSeed: entry.offlineSeed || null,
      offlineSalt: 0,
    };
    timelineTitle.textContent = entry.title;
    timelineSubtitle.textContent =
      "A " +
      state.years +
      "-year " +
      TONE_LABELS[state.tone].toLowerCase() +
      " timeline · written by The Chronicler";
    yearsSelect.value = String(state.years);
    toneSelect.value = state.tone;
    hideError(timelineError);
    showView("timeline");
    renderTimeline();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStartOver() {
    if (
      !window.confirm(
        "Start over? Your current timeline will be cleared (saved timelines are kept)."
      )
    ) {
      return;
    }
    Sfx.whoosh();
    state = null;
    showView("landing");
    renderSavedList();
    window.scrollTo({ top: 0 });
  }

  /* ---------------- init ---------------- */

  // SFX mute toggle
  function paintSfxToggle() {
    if (!sfxToggle) return;
    const m = Sfx.isMuted();
    sfxToggle.textContent = m ? "🔇" : "🔊";
    sfxToggle.title = m ? "Unmute sound effects" : "Mute sound effects";
    sfxToggle.setAttribute("aria-label", sfxToggle.title);
    sfxToggle.setAttribute("aria-pressed", String(m));
  }
  if (sfxToggle) {
    sfxToggle.addEventListener("click", () => {
      Sfx.toggle();
      paintSfxToggle();
    });
    paintSfxToggle();
  }

  // Global FX: click blip on every button, hover tick on chips/branch buttons.
  let lastHoverTarget = null;
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!btn || btn.disabled) return;
    Sfx.click();
  });
  document.addEventListener("mouseover", (e) => {
    const t = e.target && e.target.closest ? e.target.closest("#example-chips button, .branch-btn") : null;
    if (t && t !== lastHoverTarget && !t.disabled) {
      lastHoverTarget = t;
      Sfx.hoverTick();
    } else if (!t) {
      lastHoverTarget = null;
    }
  });

  Vfx.init({ mode: "dust" });

  generateForm.addEventListener("submit", handleGenerate);
  copyBtn.addEventListener("click", handleCopy);
  if (shareBtn) shareBtn.addEventListener("click", handleShareCopy);
  if (exportBtn) exportBtn.addEventListener("click", handleExport);
  if (importBtn && importFile) {
    importBtn.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", () => {
      handleImportFile(importFile.files && importFile.files[0]);
      importFile.value = "";
    });
  }
  if (extendBtn) extendBtn.addEventListener("click", handleExtend);
  if (rerollBtn) rerollBtn.addEventListener("click", handleOfflineDemo);
  saveBtn.addEventListener("click", handleSave);
  startoverBtn.addEventListener("click", handleStartOver);
  if (offlineBtn) offlineBtn.addEventListener("click", handleOfflineDemo);
  if (offlineRetryBtn) offlineRetryBtn.addEventListener("click", handleOfflineDemo);

  renderSavedList();
  renderAchievements();

  document.querySelectorAll("#example-chips button").forEach((chip) => {
    chip.addEventListener("click", () => {
      scenarioInput.value = chip.getAttribute("data-scenario") || "";
      scenarioInput.focus();
      hideError(formError);
    });
  });

  renderSavedList();
