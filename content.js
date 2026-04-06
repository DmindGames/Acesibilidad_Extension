(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const STORAGE_KEY = "a11ySettings";
  const SITE_RULES_KEY = "a11ySiteRules";
  const TTS_SITE_RULES_KEY = "a11yTtsSiteRules";
  const SITE_MODE_DEFAULT = "default";
  const SITE_MODE_ALWAYS = "always";
  const SITE_MODE_NEVER = "never";
  const TTS_MODE_ASK = "ask";
  const TTS_MODE_ALWAYS = "always";
  const TTS_MODE_NEVER = "never";
  const DEFAULT_SITE_MODE = SITE_MODE_NEVER;
  const DEFAULT_TTS_MODE = TTS_MODE_ASK;
  const DEFAULT_SETTINGS = {
    fontScale: 1,
    highContrast: false,
    dyslexiaFriendly: false,
    lineHeight: 1.6,
    letterSpacing: 0,
    readingRuler: false,
    focusParagraph: false,
    hideDistractions: false,
    keyboardShortcuts: true,
    ttsRate: 1
  };

  const SPANISH_STOPWORDS = new Set([
    "de", "la", "que", "el", "en", "y", "a", "los", "del", "se", "las", "por", "un", "para",
    "con", "no", "una", "su", "al", "lo", "como", "mas", "pero", "sus", "le", "ya", "o", "este",
    "si", "porque", "esta", "entre", "cuando", "muy", "sin", "sobre", "tambien", "me", "hasta", "hay",
    "donde", "quien", "desde", "todo", "nos", "durante", "todos", "uno", "les", "ni", "contra", "otros",
    "ese", "eso", "ante", "ellos", "e", "esto", "mi", "antes", "algunos", "que", "unos", "yo", "otro",
    "otras", "otra", "el", "tanto", "esa", "estos", "mucho", "quienes", "nada", "muchos", "cual", "poco"
  ]);

  const state = {
    settings: DEFAULT_SETTINGS,
    siteMode: DEFAULT_SITE_MODE,
    ttsMode: DEFAULT_TTS_MODE,
    ttsPromptEl: null,
    ttsPromptFocusBack: null,
    rulerEl: null,
    focusTarget: null,
    focusBound: false,
    shortcutsBound: false,
    speechQueue: [],
    speechActive: false,
    ttsPromptShown: false
  };

  function sanitizeSettings(raw) {
    const data = raw || {};
    return {
      fontScale: clampNumber(data.fontScale, 0.8, 1.6, DEFAULT_SETTINGS.fontScale),
      highContrast: Boolean(data.highContrast),
      dyslexiaFriendly: Boolean(data.dyslexiaFriendly),
      lineHeight: clampNumber(data.lineHeight, 1.2, 2.2, DEFAULT_SETTINGS.lineHeight),
      letterSpacing: clampNumber(data.letterSpacing, 0, 4, DEFAULT_SETTINGS.letterSpacing),
      readingRuler: Boolean(data.readingRuler),
      focusParagraph: Boolean(data.focusParagraph),
      hideDistractions: Boolean(data.hideDistractions),
      keyboardShortcuts: typeof data.keyboardShortcuts === "boolean" ? data.keyboardShortcuts : DEFAULT_SETTINGS.keyboardShortcuts,
      ttsRate: clampNumber(data.ttsRate, 0.7, 1.8, DEFAULT_SETTINGS.ttsRate)
    };
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, numeric));
  }

  function applySettings(settings) {
    const root = document.documentElement;
    root.classList.add("a11y-extension");
    root.classList.toggle("a11y-high-contrast", settings.highContrast);
    root.classList.toggle("a11y-dyslexia", settings.dyslexiaFriendly);
    root.classList.toggle("a11y-hide-distractions", settings.hideDistractions);
    root.classList.toggle("a11y-focus-mode", settings.focusParagraph);

    root.style.setProperty("--a11y-font-scale", String(settings.fontScale));
    root.style.setProperty("--a11y-line-height", String(settings.lineHeight));
    root.style.setProperty("--a11y-letter-spacing", `${settings.letterSpacing}px`);

    if (settings.readingRuler) {
      ensureRuler();
    } else {
      removeRuler();
    }

    if (settings.focusParagraph) {
      bindFocusMode();
    } else {
      unbindFocusMode();
    }

    if (settings.keyboardShortcuts) {
      bindShortcuts();
    } else {
      unbindShortcuts();
    }
  }

  function clearSettings() {
    const root = document.documentElement;
    root.classList.remove(
      "a11y-extension",
      "a11y-high-contrast",
      "a11y-dyslexia",
      "a11y-hide-distractions",
      "a11y-focus-mode"
    );
    root.style.removeProperty("--a11y-font-scale");
    root.style.removeProperty("--a11y-line-height");
    root.style.removeProperty("--a11y-letter-spacing");
    removeRuler();
    unbindFocusMode();
    unbindShortcuts();
    hideTtsPrompt();
    stopSpeech();
  }

  function sanitizeSiteRules(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    const next = {};
    Object.keys(raw).forEach((hostname) => {
      const mode = raw[hostname];
      if (mode === SITE_MODE_ALWAYS || mode === SITE_MODE_NEVER) {
        next[hostname] = mode;
      }
    });

    return next;
  }

  function sanitizeSiteMode(value) {
    if (value === SITE_MODE_ALWAYS || value === SITE_MODE_NEVER) {
      return value;
    }
    return DEFAULT_SITE_MODE;
  }

  function sanitizeTtsSiteRules(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    const next = {};
    Object.keys(raw).forEach((hostname) => {
      const mode = raw[hostname];
      if (mode === TTS_MODE_ASK || mode === TTS_MODE_ALWAYS || mode === TTS_MODE_NEVER) {
        next[hostname] = mode;
      }
    });

    return next;
  }

  function sanitizeTtsMode(value) {
    if (value === TTS_MODE_ASK || value === TTS_MODE_ALWAYS || value === TTS_MODE_NEVER) {
      return value;
    }
    return DEFAULT_TTS_MODE;
  }

  function ensureRuler() {
    if (!state.rulerEl) {
      state.rulerEl = document.createElement("div");
      state.rulerEl.className = "a11y-reading-ruler";
      document.documentElement.appendChild(state.rulerEl);
      window.addEventListener("mousemove", onMouseMoveRuler, { passive: true });
    }
  }

  function removeRuler() {
    window.removeEventListener("mousemove", onMouseMoveRuler);
    if (state.rulerEl && state.rulerEl.parentNode) {
      state.rulerEl.parentNode.removeChild(state.rulerEl);
    }
    state.rulerEl = null;
  }

  function onMouseMoveRuler(event) {
    if (!state.rulerEl) {
      return;
    }
    state.rulerEl.style.top = `${event.clientY}px`;
  }

  function bindFocusMode() {
    if (state.focusBound) {
      return;
    }
    document.addEventListener("mousemove", onFocusMove, { passive: true });
    state.focusBound = true;
  }

  function unbindFocusMode() {
    if (!state.focusBound) {
      return;
    }
    document.removeEventListener("mousemove", onFocusMove);
    state.focusBound = false;

    if (state.focusTarget) {
      state.focusTarget.classList.remove("a11y-focus-target");
      state.focusTarget = null;
    }
  }

  function onFocusMove(event) {
    const candidate = event.target && event.target.closest
      ? event.target.closest("p, li, h1, h2, h3, h4, h5, h6, article, section")
      : null;

    if (candidate === state.focusTarget) {
      return;
    }

    if (state.focusTarget) {
      state.focusTarget.classList.remove("a11y-focus-target");
    }

    state.focusTarget = candidate;
    if (state.focusTarget) {
      state.focusTarget.classList.add("a11y-focus-target");
    }
  }

  function bindShortcuts() {
    if (state.shortcutsBound) {
      return;
    }
    window.addEventListener("keydown", onShortcutKeydown);
    state.shortcutsBound = true;
  }

  function unbindShortcuts() {
    if (!state.shortcutsBound) {
      return;
    }
    window.removeEventListener("keydown", onShortcutKeydown);
    state.shortcutsBound = false;
  }

  function onShortcutKeydown(event) {
    if (!event.altKey || !event.shiftKey) {
      return;
    }

    const key = String(event.key || "").toLowerCase();
    let handled = false;

    if (key === "1") {
      state.settings.fontScale = clampNumber(state.settings.fontScale + 0.1, 0.8, 1.6, 1);
      handled = true;
    } else if (key === "2") {
      state.settings.fontScale = clampNumber(state.settings.fontScale - 0.1, 0.8, 1.6, 1);
      handled = true;
    } else if (key === "c") {
      state.settings.highContrast = !state.settings.highContrast;
      handled = true;
    } else if (key === "r") {
      state.settings.readingRuler = !state.settings.readingRuler;
      handled = true;
    } else if (key === "f") {
      state.settings.focusParagraph = !state.settings.focusParagraph;
      handled = true;
    } else if (key === "s") {
      speakSelection(state.settings.ttsRate);
      handled = true;
    }

    if (!handled) {
      return;
    }

    event.preventDefault();
    applyMode(state.settings, state.siteMode);
    saveCurrentState();
  }

  function speakSelection(rate) {
    const text = String(window.getSelection ? window.getSelection().toString() : "").trim();
    if (!text) {
      return false;
    }
    return speakText(text, rate);
  }

  function splitSpeechText(text) {
    const source = String(text || "").trim();
    if (!source) {
      return [];
    }

    const sentences = source
      .split(/(?<=[.!?])\s+/)
      .map((part) => normalizeWhitespace(part))
      .filter((part) => part.length > 0);

    const chunks = [];
    let current = "";

    sentences.forEach((sentence) => {
      const next = current ? `${current} ${sentence}` : sentence;
      if (next.length > 220 && current) {
        chunks.push(current);
        current = sentence;
      } else {
        current = next;
      }
    });

    if (current) {
      chunks.push(current);
    }

    return chunks.length ? chunks : [source];
  }

  function speakNextChunk(rate) {
    if (typeof window.speechSynthesis === "undefined") {
      state.speechQueue = [];
      state.speechActive = false;
      return;
    }

    const nextChunk = state.speechQueue.shift();
    if (!nextChunk) {
      state.speechActive = false;
      return;
    }

    state.speechActive = true;
    const utterance = new SpeechSynthesisUtterance(nextChunk);
    utterance.rate = clampNumber(rate, 0.7, 1.8, state.settings.ttsRate);
    utterance.onend = () => {
      speakNextChunk(rate);
    };
    utterance.onerror = () => {
      state.speechQueue = [];
      state.speechActive = false;
    };
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech() {
    state.speechQueue = [];
    state.speechActive = false;
    if (typeof window.speechSynthesis !== "undefined") {
      window.speechSynthesis.cancel();
    }
  }

  function storageSetLocal(data) {
    return new Promise((resolve) => {
      const request = api.storage.local.set(data);
      if (request && typeof request.then === "function") {
        request.then(resolve).catch(resolve);
        return;
      }

      api.storage.local.set(data, () => resolve());
    });
  }

  function storageGetLocal(keys) {
    return new Promise((resolve) => {
      const request = api.storage.local.get(keys);
      if (request && typeof request.then === "function") {
        request.then(resolve).catch(() => resolve({}));
        return;
      }

      api.storage.local.get(keys, (result) => resolve(result || {}));
    });
  }

  function ensureTtsPrompt() {
    if (state.ttsPromptEl) {
      return state.ttsPromptEl;
    }

    const prompt = document.createElement("section");
    prompt.className = "a11y-tts-prompt";
    prompt.setAttribute("hidden", "hidden");
    prompt.innerHTML = `
      <div class="a11y-tts-prompt__backdrop" data-a11y-tts-action="dismiss"></div>
      <div class="a11y-tts-prompt__card" role="dialog" aria-modal="true" aria-labelledby="a11y-tts-title" aria-describedby="a11y-tts-description">
        <p class="a11y-tts-prompt__eyebrow">Lectura en voz disponible</p>
        <h2 id="a11y-tts-title" class="a11y-tts-prompt__title">Quieres que esta pagina se lea en voz alta?</h2>
        <p id="a11y-tts-description" class="a11y-tts-prompt__description">Puedes escuchar el contenido principal ahora, dejarlo siempre activo en este sitio o cerrar este aviso.</p>
        <div class="a11y-tts-prompt__actions">
          <button type="button" class="a11y-tts-prompt__button a11y-tts-prompt__button--primary" data-a11y-tts-action="read-now">Leer ahora</button>
          <button type="button" class="a11y-tts-prompt__button" data-a11y-tts-action="always">Leer siempre aqui</button>
          <button type="button" class="a11y-tts-prompt__button" data-a11y-tts-action="dismiss">Ahora no</button>
          <button type="button" class="a11y-tts-prompt__button" data-a11y-tts-action="never">No volver a mostrar</button>
        </div>
      </div>
    `;

    prompt.addEventListener("click", (event) => {
      const trigger = event.target && event.target.closest
        ? event.target.closest("[data-a11y-tts-action]")
        : null;

      if (!trigger) {
        return;
      }

      handleTtsPromptAction(String(trigger.getAttribute("data-a11y-tts-action") || ""));
    });

    prompt.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        hideTtsPrompt();
      }
    });

    (document.body || document.documentElement).appendChild(prompt);
    state.ttsPromptEl = prompt;
    return prompt;
  }

  function showTtsPrompt() {
    const prompt = ensureTtsPrompt();
    state.ttsPromptFocusBack = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    prompt.removeAttribute("hidden");

    const primary = prompt.querySelector("[data-a11y-tts-action='read-now']");
    if (primary && typeof primary.focus === "function") {
      primary.focus();
    }
  }

  function hideTtsPrompt() {
    if (!state.ttsPromptEl) {
      return;
    }

    state.ttsPromptEl.setAttribute("hidden", "hidden");
    if (state.ttsPromptFocusBack && typeof state.ttsPromptFocusBack.focus === "function") {
      state.ttsPromptFocusBack.focus();
    }
    state.ttsPromptFocusBack = null;
  }

  async function persistTtsModeForCurrentSite(mode) {
    const hostname = String(window.location.hostname || "");
    state.ttsMode = mode;
    if (!hostname) {
      return;
    }

    const result = await storageGetLocal([TTS_SITE_RULES_KEY]);
    const rules = sanitizeTtsSiteRules(result[TTS_SITE_RULES_KEY]);

    if (mode === TTS_MODE_ASK) {
      delete rules[hostname];
    } else {
      rules[hostname] = mode;
    }

    await storageSetLocal({ [TTS_SITE_RULES_KEY]: rules });
  }

  async function handleTtsPromptAction(action) {
    if (action === "read-now") {
      hideTtsPrompt();
      speakPage(state.settings.ttsRate);
      return;
    }

    if (action === "always") {
      await persistTtsModeForCurrentSite(TTS_MODE_ALWAYS);
      hideTtsPrompt();
      speakPage(state.settings.ttsRate);
      return;
    }

    if (action === "never") {
      await persistTtsModeForCurrentSite(TTS_MODE_NEVER);
      hideTtsPrompt();
      return;
    }

    hideTtsPrompt();
  }

  function speakText(text, rate) {
    if (typeof window.speechSynthesis === "undefined") {
      return false;
    }

    const normalized = normalizeWhitespace(text);
    if (!normalized) {
      return false;
    }

    stopSpeech();
    state.speechQueue = splitSpeechText(normalized);
    speakNextChunk(rate);
    return true;
  }

  function speakPage(rate) {
    const text = extractReadableText();
    if (!text) {
      return { ok: false, reason: "empty" };
    }

    const spoken = speakText(text, rate);
    return spoken ? { ok: true } : { ok: false, reason: "unsupported" };
  }

  function handleTts(payload) {
    if (typeof window.speechSynthesis === "undefined") {
      return { ok: false, reason: "unsupported" };
    }

    const action = payload && payload.action ? String(payload.action) : "";
    const rate = clampNumber(payload && payload.rate, 0.7, 1.8, state.settings.ttsRate);
    state.settings.ttsRate = rate;

    if (action === "read-selection") {
      return speakSelection(rate) ? { ok: true } : { ok: false, reason: "empty-selection" };
    }

    if (action === "read-page") {
      return speakPage(rate);
    }

    if (action === "toggle-pause") {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else {
        window.speechSynthesis.pause();
      }
      return { ok: true };
    }

    if (action === "stop") {
      stopSpeech();
      return { ok: true };
    }

    return { ok: false, reason: "invalid-action" };
  }

  function speakCustomText(payload) {
    const text = normalizeWhitespace(payload && payload.text ? payload.text : "");
    if (!text) {
      return { ok: false, reason: "empty" };
    }

    const rate = clampNumber(payload && payload.rate, 0.7, 1.8, state.settings.ttsRate);
    state.settings.ttsRate = rate;
    return speakText(text, rate) ? { ok: true } : { ok: false, reason: "unsupported" };
  }

  function saveCurrentState() {
    const payload = { [STORAGE_KEY]: state.settings };
    const request = api.storage.local.set(payload);
    if (request && typeof request.then === "function") {
      request.catch(() => undefined);
      return;
    }
    api.storage.local.set(payload, () => undefined);
  }

  function extractReadableText() {
    const selectors = "main p, article p, section p, p, li, h1, h2, h3";
    const nodes = Array.from(document.querySelectorAll(selectors));
    const chunks = [];

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!isVisible(node)) {
        continue;
      }

      const text = normalizeWhitespace(node.textContent);
      if (text.length < 45) {
        continue;
      }

      chunks.push(text);
      if (chunks.length >= 180) {
        break;
      }
    }

    return chunks.join(" ");
  }

  function isVisible(node) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    const rect = node.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function normalizeWhitespace(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function splitSentences(text) {
    const pieces = String(text || "")
      .split(/(?<=[.!?])\s+/)
      .map((part) => normalizeWhitespace(part))
      .filter((part) => part.length >= 35);

    return pieces.slice(0, 160);
  }

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !SPANISH_STOPWORDS.has(token));
  }

  function buildFrequencyMap(sentences) {
    const map = new Map();
    sentences.forEach((sentence) => {
      tokenize(sentence).forEach((token) => {
        map.set(token, (map.get(token) || 0) + 1);
      });
    });
    return map;
  }

  function sentenceScore(sentence, frequencyMap) {
    const tokens = tokenize(sentence);
    if (!tokens.length) {
      return 0;
    }

    let score = 0;
    tokens.forEach((token) => {
      score += frequencyMap.get(token) || 0;
    });
    return score / tokens.length;
  }

  function summarizeText(rawText, level) {
    const sentences = splitSentences(rawText);
    if (!sentences.length) {
      return "No se encontro texto suficiente para resumir.";
    }

    const maxSentencesByLevel = {
      leve: 5,
      media: 4,
      alta: 3
    };
    const takeCount = maxSentencesByLevel[level] || 4;
    const frequencyMap = buildFrequencyMap(sentences);
    const ranked = sentences.map((sentence, index) => ({
      sentence,
      index,
      score: sentenceScore(sentence, frequencyMap)
    }));

    const top = ranked
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(takeCount, ranked.length))
      .sort((a, b) => a.index - b.index)
      .map((item) => `- ${item.sentence}`);

    return top.join("\n");
  }

  function simplifyText(rawText, level) {
    const sentences = splitSentences(rawText);
    if (!sentences.length) {
      return "No se encontro texto suficiente para simplificar.";
    }

    const rulesByLevel = {
      leve: {
        maxWords: 24,
        replacements: {
          "sin embargo": "pero",
          "ademas": "tambien",
          "por consiguiente": "por eso",
          "por lo tanto": "por eso"
        }
      },
      media: {
        maxWords: 18,
        replacements: {
          "sin embargo": "pero",
          "ademas": "tambien",
          "por consiguiente": "por eso",
          "por lo tanto": "por eso",
          "en consecuencia": "por eso",
          "con el objetivo de": "para"
        }
      },
      alta: {
        maxWords: 14,
        replacements: {
          "sin embargo": "pero",
          "ademas": "tambien",
          "por consiguiente": "por eso",
          "por lo tanto": "por eso",
          "en consecuencia": "por eso",
          "con el objetivo de": "para",
          "a traves de": "con",
          "en relacion con": "sobre"
        }
      }
    };

    const rule = rulesByLevel[level] || rulesByLevel.media;
    const output = [];

    sentences.slice(0, 50).forEach((sentence) => {
      const normalized = applyReplacements(normalizeWhitespace(sentence), rule.replacements);
      const fragments = breakSentence(normalized);
      fragments.forEach((fragment) => {
        const compact = trimToWordLimit(fragment, rule.maxWords);
        if (compact.length >= 20) {
          output.push(`- ${compact}`);
        }
      });
    });

    if (!output.length) {
      return "No se pudo simplificar el texto de esta pagina.";
    }

    return output.slice(0, 18).join("\n");
  }

  function applyReplacements(text, replacements) {
    let result = text;
    Object.keys(replacements).forEach((key) => {
      const value = replacements[key];
      const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, "gi");
      result = result.replace(pattern, value);
    });
    return result;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function breakSentence(sentence) {
    return String(sentence)
      .split(/[,;:]/)
      .map((part) => normalizeWhitespace(part))
      .filter((part) => part.length > 0);
  }

  function trimToWordLimit(text, maxWords) {
    const words = normalizeWhitespace(text).split(" ");
    if (words.length <= maxWords) {
      return ensureSentenceEnding(words.join(" "));
    }

    const clipped = words.slice(0, maxWords).join(" ");
    return ensureSentenceEnding(clipped);
  }

  function ensureSentenceEnding(text) {
    const value = String(text || "").trim();
    if (!value) {
      return "";
    }
    if (/[.!?]$/.test(value)) {
      return value;
    }
    return `${value}.`;
  }

  function runPremiumSummary(level) {
    const text = extractReadableText();
    return summarizeText(text, level);
  }

  function runPremiumSimplification(level) {
    const text = extractReadableText();
    return simplifyText(text, level);
  }

  function modeForCurrentSite(rules) {
    const hostname = String(window.location.hostname || "");
    const mode = rules[hostname];
    if (mode === SITE_MODE_ALWAYS || mode === SITE_MODE_NEVER) {
      return mode;
    }
    return DEFAULT_SITE_MODE;
  }

  function ttsModeForCurrentSite(rules) {
    const hostname = String(window.location.hostname || "");
    const mode = rules[hostname];
    if (mode === TTS_MODE_ASK || mode === TTS_MODE_ALWAYS || mode === TTS_MODE_NEVER) {
      return mode;
    }
    return DEFAULT_TTS_MODE;
  }

  function scheduleTtsPrompt() {
    if (state.ttsPromptShown || state.siteMode === SITE_MODE_NEVER || typeof window.speechSynthesis === "undefined") {
      return;
    }

    const run = () => {
      if (state.ttsPromptShown || state.siteMode === SITE_MODE_NEVER) {
        return;
      }

      state.ttsPromptShown = true;
      if (state.ttsMode === TTS_MODE_ALWAYS) {
        speakPage(state.settings.ttsRate);
        return;
      }

      if (state.ttsMode === TTS_MODE_ASK) {
        showTtsPrompt();
      }
    };

    if (document.visibilityState === "visible") {
      window.setTimeout(run, 900);
      return;
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      document.removeEventListener("visibilitychange", onVisible);
      window.setTimeout(run, 400);
    };
    document.addEventListener("visibilitychange", onVisible);
  }

  function applyMode(settings, siteMode, ttsMode, shouldSchedulePrompt) {
    state.settings = settings;
    state.siteMode = siteMode;
    state.ttsMode = ttsMode;
    if (shouldSchedulePrompt) {
      state.ttsPromptShown = false;
    }

    if (siteMode === SITE_MODE_NEVER) {
      clearSettings();
      return;
    }

    applySettings(settings);
    if (shouldSchedulePrompt && ttsMode !== TTS_MODE_NEVER) {
      scheduleTtsPrompt();
    }
  }

  function getStorageSettings() {
    return new Promise((resolve) => {
      const request = api.storage.local.get([STORAGE_KEY, SITE_RULES_KEY, TTS_SITE_RULES_KEY]);
      if (request && typeof request.then === "function") {
        request
          .then((result) => {
            resolve({
              settings: sanitizeSettings(result[STORAGE_KEY]),
              siteMode: modeForCurrentSite(sanitizeSiteRules(result[SITE_RULES_KEY])),
              ttsMode: ttsModeForCurrentSite(sanitizeTtsSiteRules(result[TTS_SITE_RULES_KEY]))
            });
          })
          .catch(() => {
            resolve({
              settings: DEFAULT_SETTINGS,
              siteMode: DEFAULT_SITE_MODE,
              ttsMode: DEFAULT_TTS_MODE
            });
          });
        return;
      }

      api.storage.local.get([STORAGE_KEY, SITE_RULES_KEY, TTS_SITE_RULES_KEY], (result) => {
        resolve({
          settings: sanitizeSettings(result ? result[STORAGE_KEY] : undefined),
          siteMode: modeForCurrentSite(sanitizeSiteRules(result ? result[SITE_RULES_KEY] : undefined)),
          ttsMode: ttsModeForCurrentSite(sanitizeTtsSiteRules(result ? result[TTS_SITE_RULES_KEY] : undefined))
        });
      });
    });
  }

  function initialize() {
    getStorageSettings().then(({ settings, siteMode, ttsMode }) => {
      applyMode(settings, siteMode, ttsMode, true);
    });

    api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== "object") {
        return false;
      }

      if (message.type === "A11Y_SYNC") {
        const safeSettings = sanitizeSettings(message.payload ? message.payload.settings : undefined);
        const safeMode = sanitizeSiteMode(message.payload ? message.payload.siteMode : undefined);
        const safeTtsMode = sanitizeTtsMode(message.payload ? message.payload.ttsMode : undefined);
        applyMode(safeSettings, safeMode, safeTtsMode, safeTtsMode === TTS_MODE_ALWAYS);
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === "A11Y_TTS") {
        sendResponse(handleTts(message.payload || {}));
        return false;
      }

      if (message.type === "A11Y_TTS_CUSTOM") {
        sendResponse(speakCustomText(message.payload || {}));
        return false;
      }

      if (message.type === "A11Y_PREMIUM_SUMMARY") {
        const level = message.payload && message.payload.level ? String(message.payload.level) : "media";
        sendResponse({ ok: true, text: runPremiumSummary(level) });
        return false;
      }

      if (message.type === "A11Y_PREMIUM_SIMPLIFY") {
        const level = message.payload && message.payload.level ? String(message.payload.level) : "media";
        sendResponse({ ok: true, text: runPremiumSimplification(level) });
        return false;
      }

      if (message.type === "A11Y_APPLY") {
        const safeSettings = sanitizeSettings(message.payload);
        applyMode(safeSettings, DEFAULT_SITE_MODE, state.ttsMode, false);
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === "A11Y_PING") {
        sendResponse({ ok: true });
      }

      return false;
    });
  }

  initialize();
})();