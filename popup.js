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

const dom = {
  fontScale: document.getElementById("font-scale"),
  fontScaleValue: document.getElementById("font-scale-value"),
  lineHeight: document.getElementById("line-height"),
  lineHeightValue: document.getElementById("line-height-value"),
  letterSpacing: document.getElementById("letter-spacing"),
  letterSpacingValue: document.getElementById("letter-spacing-value"),
  highContrast: document.getElementById("high-contrast"),
  dyslexiaFriendly: document.getElementById("dyslexia-friendly"),
  siteHost: document.getElementById("site-host"),
  siteEnabled: document.getElementById("site-enabled"),
  siteAlways: document.getElementById("site-always"),
  siteNever: document.getElementById("site-never"),
  resetSite: document.getElementById("reset-site"),
  siteModeLabel: document.getElementById("site-mode-label"),
  reset: document.getElementById("reset-settings"),
  status: document.getElementById("status")
};

const state = {
  activeTabId: null,
  activeHost: "",
  siteRules: {},
  siteMode: SITE_MODE_DEFAULT,
  isSupportedTab: true
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

function resolveSiteMode(hostname, rules) {
  if (!hostname) {
    return SITE_MODE_DEFAULT;
  }

  const mode = rules[hostname];
  if (mode === SITE_MODE_ALWAYS || mode === SITE_MODE_NEVER) {
    return mode;
  }

  return SITE_MODE_DEFAULT;
}

function withSiteMode(hostname, mode, rules) {
  const next = { ...rules };

  if (!hostname || mode === SITE_MODE_DEFAULT) {
    delete next[hostname];
    return next;
  }

  next[hostname] = mode;
  return next;
}

function parseHostnameFromUrl(urlString) {
  try {
    const url = new URL(String(urlString || ""));
    return url.hostname || "";
  } catch (_error) {
    return "";
  }
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

function storageGet(keyOrKeys) {
  return new Promise((resolve) => {
    const response = api.storage.local.get(keyOrKeys);
    if (response && typeof response.then === "function") {
      response.then(resolve).catch(() => resolve({}));
      return;
    }

    api.storage.local.get(keyOrKeys, (result) => {
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

function paintSiteState() {
  if (!state.isSupportedTab || !state.activeHost) {
    dom.siteHost.textContent = "Sitio no compatible";
    dom.siteEnabled.checked = false;
    dom.siteEnabled.disabled = true;
    dom.siteAlways.disabled = true;
    dom.siteNever.disabled = true;
    dom.resetSite.disabled = true;
    dom.siteModeLabel.textContent = "Abre un sitio http o https para usar control por dominio.";
    return;
  }

  dom.siteHost.textContent = state.activeHost;
  dom.siteEnabled.disabled = false;
  dom.siteAlways.disabled = false;
  dom.siteNever.disabled = false;
  dom.resetSite.disabled = false;
  dom.siteEnabled.checked = state.siteMode !== SITE_MODE_NEVER;

  if (state.siteMode === SITE_MODE_ALWAYS) {
    dom.siteModeLabel.textContent = "Estado: siempre aplicar en este dominio.";
    return;
  }

  if (state.siteMode === SITE_MODE_NEVER) {
    dom.siteModeLabel.textContent = "Estado: nunca aplicar en este dominio.";
    return;
  }

  dom.siteModeLabel.textContent = "Estado: usa la configuracion global de la extension.";
}

function showStatus(message, isError) {
  dom.status.textContent = message;
  dom.status.style.color = isError ? "#a21d1d" : "#6b4d2d";
}

async function applySettings() {
  const settings = getSettingsFromDom();
  paintValues(settings);

  await storageSet({
    [STORAGE_KEY]: settings,
    [SITE_RULES_KEY]: state.siteRules
  });

  if (!state.isSupportedTab || typeof state.activeTabId !== "number") {
    showStatus("No se detecto una pestana activa compatible.", true);
    return;
  }

  await sendMessageToTab(state.activeTabId, {
    type: "A11Y_SYNC",
    payload: {
      settings,
      siteMode: state.siteMode
    }
  });
  showStatus("Ajustes aplicados.", false);
}

async function setModeForCurrentSite(mode, successMessage) {
  if (!state.activeHost || !state.isSupportedTab) {
    showStatus("Sitio no compatible para control por dominio.", true);
    return;
  }

  state.siteMode = mode;
  state.siteRules = withSiteMode(state.activeHost, mode, state.siteRules);
  paintSiteState();

  await applySettings();
  showStatus(successMessage, false);
}

async function boot() {
  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const activeTab = tabs && tabs[0];
  const activeUrl = String(activeTab && activeTab.url ? activeTab.url : "");

  state.activeTabId = activeTab && typeof activeTab.id === "number" ? activeTab.id : null;
  state.activeHost = parseHostnameFromUrl(activeUrl);
  state.isSupportedTab = activeUrl.startsWith("http://") || activeUrl.startsWith("https://");

  const result = await storageGet([STORAGE_KEY, SITE_RULES_KEY]);
  const settings = sanitizeSettings(result[STORAGE_KEY]);
  state.siteRules = sanitizeSiteRules(result[SITE_RULES_KEY]);
  state.siteMode = resolveSiteMode(state.activeHost, state.siteRules);

  paintValues(settings);
  paintSiteState();

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

  dom.siteEnabled.addEventListener("change", () => {
    const targetMode = dom.siteEnabled.checked ? SITE_MODE_DEFAULT : SITE_MODE_NEVER;
    setModeForCurrentSite(targetMode, "Preferencia de este sitio actualizada.").catch(() => {
      showStatus("No se pudo actualizar este sitio.", true);
    });
  });

  dom.siteAlways.addEventListener("click", () => {
    setModeForCurrentSite(SITE_MODE_ALWAYS, "Este dominio ahora siempre aplica accesibilidad.").catch(() => {
      showStatus("No se pudo guardar regla de siempre.", true);
    });
  });

  dom.siteNever.addEventListener("click", () => {
    setModeForCurrentSite(SITE_MODE_NEVER, "Este dominio ahora nunca aplica accesibilidad.").catch(() => {
      showStatus("No se pudo guardar regla de nunca.", true);
    });
  });

  dom.resetSite.addEventListener("click", () => {
    setModeForCurrentSite(SITE_MODE_DEFAULT, "Reglas de este dominio restablecidas.").catch(() => {
      showStatus("No se pudo restablecer este dominio.", true);
    });
  });
}

boot().catch(() => {
  showStatus("No se pudieron cargar los ajustes.", true);
});