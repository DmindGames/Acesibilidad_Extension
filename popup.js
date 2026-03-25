const api = typeof browser !== "undefined" ? browser : chrome;
const STORAGE_KEY = "a11ySettings";
const DEFAULT_SETTINGS = {
  fontScale: 1,
  highContrast: false,
  dyslexiaFriendly: false,
  lineHeight: 1.6,
  letterSpacing: 0
};

const dom = {
  fontScale: document.getElementById("font-scale"),
  fontScaleValue: document.getElementById("font-scale-value"),
  lineHeight: document.getElementById("line-height"),
  lineHeightValue: document.getElementById("line-height-value"),
  letterSpacing: document.getElementById("letter-spacing"),
  letterSpacingValue: document.getElementById("letter-spacing-value"),
  highContrast: document.getElementById("high-contrast"),
  dyslexiaFriendly: document.getElementById("dyslexia-friendly"),
  reset: document.getElementById("reset-settings"),
  status: document.getElementById("status")
};

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

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

function tabsQuery(queryInfo) {
  return new Promise((resolve, reject) => {
    try {
      const response = api.tabs.query(queryInfo);
      if (response && typeof response.then === "function") {
        response.then(resolve).catch(reject);
        return;
      }
    } catch (_error) {
      // Ignore to use callback path.
    }

    api.tabs.query(queryInfo, (tabs) => {
      const error = api.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs);
    });
  });
}

function storageGet(key) {
  return new Promise((resolve) => {
    const response = api.storage.local.get(key);
    if (response && typeof response.then === "function") {
      response.then(resolve).catch(() => resolve({}));
      return;
    }

    api.storage.local.get(key, (result) => {
      resolve(result || {});
    });
  });
}

function storageSet(data) {
  return new Promise((resolve) => {
    const response = api.storage.local.set(data);
    if (response && typeof response.then === "function") {
      response.then(resolve).catch(resolve);
      return;
    }

    api.storage.local.set(data, () => resolve());
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      const response = api.tabs.sendMessage(tabId, message);
      if (response && typeof response.then === "function") {
        response.then(resolve).catch(reject);
        return;
      }
    } catch (_error) {
      // Ignore to use callback path.
    }

    api.tabs.sendMessage(tabId, message, (result) => {
      const error = api.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

function getSettingsFromDom() {
  return sanitizeSettings({
    fontScale: Number(dom.fontScale.value) / 100,
    highContrast: dom.highContrast.checked,
    dyslexiaFriendly: dom.dyslexiaFriendly.checked,
    lineHeight: Number(dom.lineHeight.value),
    letterSpacing: Number(dom.letterSpacing.value)
  });
}

function paintValues(settings) {
  dom.fontScale.value = String(Math.round(settings.fontScale * 100));
  dom.lineHeight.value = String(settings.lineHeight);
  dom.letterSpacing.value = String(settings.letterSpacing);
  dom.highContrast.checked = settings.highContrast;
  dom.dyslexiaFriendly.checked = settings.dyslexiaFriendly;

  dom.fontScaleValue.textContent = `${Math.round(settings.fontScale * 100)}%`;
  dom.lineHeightValue.textContent = settings.lineHeight.toFixed(1);
  dom.letterSpacingValue.textContent = `${settings.letterSpacing.toFixed(1)} px`;
}

function showStatus(message, isError) {
  dom.status.textContent = message;
  dom.status.style.color = isError ? "#a21d1d" : "#6b4d2d";
}

async function applySettings() {
  const settings = getSettingsFromDom();
  paintValues(settings);
  await storageSet({ [STORAGE_KEY]: settings });

  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const activeTab = tabs && tabs[0];

  if (!activeTab || typeof activeTab.id !== "number") {
    showStatus("No se detecto una pestana activa.", true);
    return;
  }

  const url = String(activeTab.url || "");
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    showStatus("Esta pagina no permite inyeccion de extensiones.", true);
    return;
  }

  await sendMessageToTab(activeTab.id, { type: "A11Y_APPLY", payload: settings });
  showStatus("Ajustes aplicados.", false);
}

async function boot() {
  const result = await storageGet(STORAGE_KEY);
  const settings = sanitizeSettings(result[STORAGE_KEY]);
  paintValues(settings);

  const controls = [
    dom.fontScale,
    dom.lineHeight,
    dom.letterSpacing,
    dom.highContrast,
    dom.dyslexiaFriendly
  ];

  controls.forEach((control) => {
    control.addEventListener("input", () => {
      applySettings().catch(() => showStatus("No se pudo aplicar en esta pagina.", true));
    });
    control.addEventListener("change", () => {
      applySettings().catch(() => showStatus("No se pudo aplicar en esta pagina.", true));
    });
  });

  dom.reset.addEventListener("click", () => {
    paintValues(DEFAULT_SETTINGS);
    applySettings().catch(() => showStatus("No se pudo restablecer en esta pagina.", true));
  });
}

boot().catch(() => {
  showStatus("No se pudieron cargar los ajustes.", true);
});