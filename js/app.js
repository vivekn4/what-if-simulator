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
  const saveBtn = $("save-btn");
  const startoverBtn = $("startover-btn");
  const toast = $("toast");
  const sfxToggle = $("sfx-toggle");

  /* ---------------- state ---------------- */

  // { scenario, years, tone, chapters: [{ year, text, branches: [text] }] }
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

  /* ---------------- timeline rendering ---------------- */

  function buildChapterCard(chapter, idx) {
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
    chapter.branches.forEach((branchText) => {
      branchList.appendChild(buildBranchCard(branchText));
    });
    body.appendChild(branchList);

    const branchBtn = document.createElement("button");
    branchBtn.type = "button";
    branchBtn.className = "branch-btn";
    branchBtn.textContent = "↳ explore an alternative";
    branchBtn.addEventListener("click", () => handleBranch(idx, branchBtn, branchList));
    body.appendChild(branchBtn);

    article.appendChild(marker);
    article.appendChild(body);
    return article;
  }

  function buildBranchCard(branchText) {
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
    return card;
  }

  function renderTimeline() {
    timelineEl.innerHTML = "";
    state.chapters.forEach((chapter, idx) => {
      const card = buildChapterCard(chapter, idx);
      card.style.animationDelay = Math.min(idx * 70, 700) + "ms";
      timelineEl.appendChild(card);
    });
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
      const reply = await callChat([
        {
          role: "user",
          content: buildBranchPrompt(state.scenario, state.tone, chapter.year, chapter.text),
        },
      ]);
      const parsed = parseChapters(reply, chapter.year);
      const alt = parsed.length ? parsed[0].text : reply.trim();
      if (!alt) throw new Error("The storyteller returned an empty reply. Please try again.");
      chapter.branches.push(alt);
      loadingCard.remove();
      const newCard = buildBranchCard(alt);
      branchList.appendChild(newCard);
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
    state = { scenario, years, tone, chapters: [] };

    timelineTitle.textContent = "What if I " + scenario + "?";
    timelineSubtitle.textContent =
      "A " + years + "-year " + TONE_LABELS[tone].toLowerCase() + " timeline · written by The Chronicler";
    timelineEl.innerHTML = "";
    hideError(timelineError);
    showView("timeline");
    timelineLoading.hidden = false;

    try {
      const reply = await callChat([
        { role: "user", content: buildTimelinePrompt(scenario, years, tone) },
      ]);
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
      Sfx.successChime();
      Vfx.confetti(window.innerWidth / 2, 160);
      timelineEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      Sfx.errorBuzz();
      showError(timelineError, err.message || "Something went wrong. Please try again.");
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
      "A " + state.years + "-year " + TONE_LABELS[state.tone].toLowerCase() + " timeline."
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
      createdAt: new Date().toISOString(),
      chapters: state.chapters.map((c) => ({
        year: c.year,
        text: c.text,
        branches: c.branches.slice(),
      })),
    });
    if (persistSaved(saved.slice(0, MAX_SAVED))) {
      renderSavedList();
      Sfx.successChime();
      const r = saveBtn.getBoundingClientRect();
      Vfx.sparkle(r.left + r.width / 2, r.top);
      showToast("Timeline saved.");
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
  saveBtn.addEventListener("click", handleSave);
  startoverBtn.addEventListener("click", handleStartOver);

  document.querySelectorAll("#example-chips button").forEach((chip) => {
    chip.addEventListener("click", () => {
      scenarioInput.value = chip.getAttribute("data-scenario") || "";
      scenarioInput.focus();
      hideError(formError);
    });
  });

  renderSavedList();
