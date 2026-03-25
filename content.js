(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const STORAGE_KEY = "a11ySettings";
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

  function getStorageSettings() {
    return new Promise((resolve) => {
      const request = api.storage.local.get(STORAGE_KEY);
      if (request && typeof request.then === "function") {
        request
          .then((result) => resolve(sanitizeSettings(result[STORAGE_KEY])))
          .catch(() => resolve(DEFAULT_SETTINGS));
        return;
      }

      api.storage.local.get(STORAGE_KEY, (result) => {
        resolve(sanitizeSettings(result ? result[STORAGE_KEY] : undefined));
      });
    });
  }

  function initialize() {
    getStorageSettings().then(applySettings);

    api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== "object") {
        return false;
      }

      if (message.type === "A11Y_APPLY") {
        const safeSettings = sanitizeSettings(message.payload);
        applySettings(safeSettings);
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