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
    letterSpacing: 0
  };

  function sanitizeSettings(raw) {
    const data = raw || {};
    return {
      fontScale: clampNumber(data.fontScale, 0.8, 1.6, DEFAULT_SETTINGS.fontScale),
      highContrast: Boolean(data.highContrast),
      dyslexiaFriendly: Boolean(data.dyslexiaFriendly),
      lineHeight: clampNumber(data.lineHeight, 1.2, 2.2, DEFAULT_SETTINGS.lineHeight),
      letterSpacing: clampNumber(data.letterSpacing, 0, 4, DEFAULT_SETTINGS.letterSpacing)
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

    root.style.setProperty("--a11y-font-scale", String(settings.fontScale));
    root.style.setProperty("--a11y-line-height", String(settings.lineHeight));
    root.style.setProperty("--a11y-letter-spacing", `${settings.letterSpacing}px`);
  }

  function clearSettings() {
    const root = document.documentElement;
    root.classList.remove("a11y-extension", "a11y-high-contrast", "a11y-dyslexia");
    root.style.removeProperty("--a11y-font-scale");
    root.style.removeProperty("--a11y-line-height");
    root.style.removeProperty("--a11y-letter-spacing");
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

  function modeForCurrentSite(rules) {
    const hostname = String(window.location.hostname || "");
    return sanitizeSiteMode(rules[hostname]);
  }

  function applyMode(settings, siteMode) {
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