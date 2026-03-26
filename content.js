(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const STORAGE_KEY = "a11ySettings";
  const SITE_RULES_KEY = "a11ySiteRules";
  const SITE_MODE_DEFAULT = "default";
  const SITE_MODE_ALWAYS = "always";
  const SITE_MODE_NEVER = "never";
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
    siteMode: SITE_MODE_DEFAULT,
    rulerEl: null,
    focusTarget: null,
    focusBound: false,
    shortcutsBound: false
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
    return SITE_MODE_DEFAULT;
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
    if (!text || typeof window.speechSynthesis === "undefined") {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = clampNumber(rate, 0.7, 1.8, 1);
    window.speechSynthesis.speak(utterance);
  }

  function handleTts(payload) {
    if (typeof window.speechSynthesis === "undefined") {
      return { ok: false, reason: "unsupported" };
    }

    const action = payload && payload.action ? String(payload.action) : "";
    const rate = clampNumber(payload && payload.rate, 0.7, 1.8, state.settings.ttsRate);
    state.settings.ttsRate = rate;

    if (action === "read-selection") {
      speakSelection(rate);
      return { ok: true };
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
      window.speechSynthesis.cancel();
      return { ok: true };
    }

    return { ok: false, reason: "invalid-action" };
  }

  function speakCustomText(payload) {
    if (typeof window.speechSynthesis === "undefined") {
      return { ok: false, reason: "unsupported" };
    }

    const text = normalizeWhitespace(payload && payload.text ? payload.text : "");
    if (!text) {
      return { ok: false, reason: "empty" };
    }

    const rate = clampNumber(payload && payload.rate, 0.7, 1.8, state.settings.ttsRate);
    state.settings.ttsRate = rate;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
    return { ok: true };
  }

  function collectOcrImageUrls() {
    const urls = [];
    const seen = new Set();
    const nodes = Array.from(document.querySelectorAll("img[src]"));

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!isVisible(node)) {
        continue;
      }

      const src = String(node.currentSrc || node.src || "").trim();
      if (!src.startsWith("http://") && !src.startsWith("https://")) {
        continue;
      }

      const width = Number(node.naturalWidth || node.width || 0);
      const height = Number(node.naturalHeight || node.height || 0);
      if (width < 120 || height < 50) {
        continue;
      }

      if (!seen.has(src)) {
        seen.add(src);
        urls.push(src);
      }

      if (urls.length >= 10) {
        break;
      }
    }

    return urls;
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

  function runAudit() {
    return {
      imagesWithoutAlt: countImagesWithoutAlt(),
      headingOrderIssues: countHeadingOrderIssues(),
      lowContrastText: countLowContrastText()
    };
  }

  function countImagesWithoutAlt() {
    const images = document.querySelectorAll("img");
    let issues = 0;
    images.forEach((img) => {
      const alt = img.getAttribute("alt");
      if (alt === null || alt.trim() === "") {
        issues += 1;
      }
    });
    return issues;
  }

  function countHeadingOrderIssues() {
    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
    let lastLevel = 0;
    let issues = 0;

    headings.forEach((heading) => {
      const level = Number(heading.tagName.substring(1));
      if (lastLevel > 0 && level - lastLevel > 1) {
        issues += 1;
      }
      lastLevel = level;
    });

    return issues;
  }

  function countLowContrastText() {
    const nodes = document.querySelectorAll("p, span, a, li, button, label, h1, h2, h3, h4, h5, h6");
    let issues = 0;
    const sample = Array.from(nodes).slice(0, 250);

    sample.forEach((node) => {
      const style = window.getComputedStyle(node);
      const fg = parseRgb(style.color);
      const bg = resolveBackgroundColor(node);
      if (!fg || !bg) {
        return;
      }

      const ratio = contrastRatio(fg, bg);
      if (ratio < 4.5) {
        issues += 1;
      }
    });

    return issues;
  }

  function resolveBackgroundColor(node) {
    let current = node;
    while (current && current !== document.documentElement) {
      const color = parseRgb(window.getComputedStyle(current).backgroundColor);
      if (color && color.alpha > 0) {
        return color;
      }
      current = current.parentElement;
    }
    return { r: 255, g: 255, b: 255, alpha: 1 };
  }

  function parseRgb(value) {
    const input = String(value || "").trim();
    const match = input.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
    if (!match) {
      return null;
    }
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      alpha: match[4] === undefined ? 1 : Number(match[4])
    };
  }

  function relativeLuminance(color) {
    const channels = [color.r, color.g, color.b].map((channel) => {
      const normalized = channel / 255;
      if (normalized <= 0.03928) {
        return normalized / 12.92;
      }
      return Math.pow((normalized + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(fg, bg) {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const max = Math.max(l1, l2);
    const min = Math.min(l1, l2);
    return (max + 0.05) / (min + 0.05);
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
    return sanitizeSiteMode(rules[hostname]);
  }

  function applyMode(settings, siteMode) {
    state.settings = settings;
    state.siteMode = siteMode;

    if (siteMode === SITE_MODE_NEVER) {
      clearSettings();
      return;
    }

    applySettings(settings);
  }

  function getStorageSettings() {
    return new Promise((resolve) => {
      const request = api.storage.local.get([STORAGE_KEY, SITE_RULES_KEY]);
      if (request && typeof request.then === "function") {
        request
          .then((result) => {
            resolve({
              settings: sanitizeSettings(result[STORAGE_KEY]),
              siteMode: modeForCurrentSite(sanitizeSiteRules(result[SITE_RULES_KEY]))
            });
          })
          .catch(() => {
            resolve({
              settings: DEFAULT_SETTINGS,
              siteMode: SITE_MODE_DEFAULT
            });
          });
        return;
      }

      api.storage.local.get([STORAGE_KEY, SITE_RULES_KEY], (result) => {
        resolve({
          settings: sanitizeSettings(result ? result[STORAGE_KEY] : undefined),
          siteMode: modeForCurrentSite(sanitizeSiteRules(result ? result[SITE_RULES_KEY] : undefined))
        });
      });
    });
  }

  function initialize() {
    getStorageSettings().then(({ settings, siteMode }) => {
      applyMode(settings, siteMode);
    });

    api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== "object") {
        return false;
      }

      if (message.type === "A11Y_SYNC") {
        const safeSettings = sanitizeSettings(message.payload ? message.payload.settings : undefined);
        const safeMode = sanitizeSiteMode(message.payload ? message.payload.siteMode : undefined);
        applyMode(safeSettings, safeMode);
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === "A11Y_TTS") {
        sendResponse(handleTts(message.payload || {}));
        return false;
      }

      if (message.type === "A11Y_AUDIT") {
        sendResponse(runAudit());
        return false;
      }

      if (message.type === "A11Y_OCR_COLLECT_IMAGES") {
        sendResponse({ ok: true, urls: collectOcrImageUrls() });
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
        applyMode(safeSettings, SITE_MODE_DEFAULT);
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