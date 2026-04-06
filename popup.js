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

const PROFILES = {
  lowVision: {
    fontScale: 1.35,
    highContrast: true,
    lineHeight: 1.9,
    letterSpacing: 1.2
  },
  dyslexia: {
    fontScale: 1.15,
    dyslexiaFriendly: true,
    lineHeight: 1.95,
    letterSpacing: 1.5
  },
  senior: {
    fontScale: 1.45,
    highContrast: true,
    lineHeight: 2,
    letterSpacing: 1
  },
  colorBlind: {
    highContrast: true,
    fontScale: 1.1,
    lineHeight: 1.7,
    letterSpacing: 0.5
  }
};

const dom = {
  profileSelect: document.getElementById("profile-select"),
  applyProfile: document.getElementById("apply-profile"),
  fontScale: document.getElementById("font-scale"),
  fontScaleValue: document.getElementById("font-scale-value"),
  lineHeight: document.getElementById("line-height"),
  lineHeightValue: document.getElementById("line-height-value"),
  letterSpacing: document.getElementById("letter-spacing"),
  letterSpacingValue: document.getElementById("letter-spacing-value"),
  highContrast: document.getElementById("high-contrast"),
  dyslexiaFriendly: document.getElementById("dyslexia-friendly"),
  readingRuler: document.getElementById("reading-ruler"),
  focusParagraph: document.getElementById("focus-paragraph"),
  hideDistractions: document.getElementById("hide-distractions"),
  keyboardShortcuts: document.getElementById("keyboard-shortcuts"),
  ttsRate: document.getElementById("tts-rate"),
  ttsRateValue: document.getElementById("tts-rate-value"),
  ttsReadSelection: document.getElementById("tts-read-selection"),
  ttsReadPage: document.getElementById("tts-read-page"),
  ttsToggle: document.getElementById("tts-toggle"),
  ttsStop: document.getElementById("tts-stop"),
  ttsAsk: document.getElementById("tts-ask"),
  ttsAlways: document.getElementById("tts-always"),
  ttsNever: document.getElementById("tts-never"),
  ttsSiteLabel: document.getElementById("tts-site-label"),
  siteHost: document.getElementById("site-host"),
  siteEnabled: document.getElementById("site-enabled"),
  siteAlways: document.getElementById("site-always"),
  siteNever: document.getElementById("site-never"),
  resetSite: document.getElementById("reset-site"),
  siteModeLabel: document.getElementById("site-mode-label"),
  exportConfig: document.getElementById("export-config"),
  importConfig: document.getElementById("import-config"),
  importFile: document.getElementById("import-file"),
  premiumLevel: document.getElementById("premium-level"),
  premiumSummary: document.getElementById("premium-summary"),
  premiumSimplify: document.getElementById("premium-simplify"),
  premiumCopy: document.getElementById("premium-copy"),
  premiumOutput: document.getElementById("premium-output"),
  reset: document.getElementById("reset-settings"),
  status: document.getElementById("status")
};

const state = {
  activeTabId: null,
  activeHost: "",
  siteRules: {},
  siteMode: DEFAULT_SITE_MODE,
  ttsSiteRules: {},
  ttsMode: DEFAULT_TTS_MODE,
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
    letterSpacing: clampNumber(data.letterSpacing, 0, 4, DEFAULT_SETTINGS.letterSpacing),
    readingRuler: Boolean(data.readingRuler),
    focusParagraph: Boolean(data.focusParagraph),
    hideDistractions: Boolean(data.hideDistractions),
    keyboardShortcuts: typeof data.keyboardShortcuts === "boolean" ? data.keyboardShortcuts : DEFAULT_SETTINGS.keyboardShortcuts,
    ttsRate: clampNumber(data.ttsRate, 0.7, 1.8, DEFAULT_SETTINGS.ttsRate)
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

function resolveSiteMode(hostname, rules) {
  if (!hostname) {
    return DEFAULT_SITE_MODE;
  }

  const mode = rules[hostname];
  if (mode === SITE_MODE_ALWAYS || mode === SITE_MODE_NEVER) {
    return mode;
  }

  return DEFAULT_SITE_MODE;
}

function resolveTtsMode(hostname, rules) {
  if (!hostname) {
    return DEFAULT_TTS_MODE;
  }

  const mode = rules[hostname];
  if (mode === TTS_MODE_ASK || mode === TTS_MODE_ALWAYS || mode === TTS_MODE_NEVER) {
    return mode;
  }

  return DEFAULT_TTS_MODE;
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

function withTtsMode(hostname, mode, rules) {
  const next = { ...rules };
  if (!hostname || mode === TTS_MODE_ASK) {
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

function paintValues(settings) {
  dom.fontScale.value = String(Math.round(settings.fontScale * 100));
  dom.lineHeight.value = String(settings.lineHeight);
  dom.letterSpacing.value = String(settings.letterSpacing);
  dom.highContrast.checked = settings.highContrast;
  dom.dyslexiaFriendly.checked = settings.dyslexiaFriendly;
  dom.readingRuler.checked = settings.readingRuler;
  dom.focusParagraph.checked = settings.focusParagraph;
  dom.hideDistractions.checked = settings.hideDistractions;
  dom.keyboardShortcuts.checked = settings.keyboardShortcuts;
  dom.ttsRate.value = String(settings.ttsRate);

  dom.fontScaleValue.textContent = `${Math.round(settings.fontScale * 100)}%`;
  dom.lineHeightValue.textContent = settings.lineHeight.toFixed(1);
  dom.letterSpacingValue.textContent = `${settings.letterSpacing.toFixed(1)} px`;
  dom.ttsRateValue.textContent = `${settings.ttsRate.toFixed(1)}x`;
}

function paintSiteState() {
  if (!state.isSupportedTab || !state.activeHost) {
    dom.siteHost.textContent = "Sitio no compatible";
    dom.siteEnabled.checked = false;
    dom.siteEnabled.disabled = true;
    dom.siteAlways.disabled = true;
    dom.siteNever.disabled = true;
    dom.resetSite.disabled = true;
    dom.siteModeLabel.textContent = "Abre una pagina web normal para activar la ayuda aqui.";
    return;
  }

  dom.siteHost.textContent = state.activeHost;
  dom.siteEnabled.disabled = false;
  dom.siteAlways.disabled = false;
  dom.siteNever.disabled = false;
  dom.resetSite.disabled = false;
  dom.siteEnabled.checked = state.siteMode === SITE_MODE_ALWAYS;

  if (state.siteMode === SITE_MODE_ALWAYS) {
    dom.siteModeLabel.textContent = "La ayuda esta activa en este sitio.";
    return;
  }

  dom.siteModeLabel.textContent = "Este sitio no se toca hasta que tu lo actives.";
}

function paintTtsState() {
  const buttons = [
    [dom.ttsAsk, state.ttsMode === TTS_MODE_ASK],
    [dom.ttsAlways, state.ttsMode === TTS_MODE_ALWAYS],
    [dom.ttsNever, state.ttsMode === TTS_MODE_NEVER]
  ];

  buttons.forEach(([button, active]) => {
    button.classList.toggle("is-active", active);
  });

  if (!state.isSupportedTab || !state.activeHost) {
    dom.ttsSiteLabel.textContent = "La lectura automatica solo funciona en paginas web normales.";
    dom.ttsAsk.disabled = true;
    dom.ttsAlways.disabled = true;
    dom.ttsNever.disabled = true;
    return;
  }

  dom.ttsAsk.disabled = false;
  dom.ttsAlways.disabled = false;
  dom.ttsNever.disabled = false;

  if (state.ttsMode === TTS_MODE_ALWAYS) {
    dom.ttsSiteLabel.textContent = "Al abrir este sitio, la extension empezara a leer la pagina.";
    return;
  }

  if (state.ttsMode === TTS_MODE_NEVER) {
    dom.ttsSiteLabel.textContent = "En este sitio no se iniciara lectura automatica ni se mostrara aviso.";
    return;
  }

  dom.ttsSiteLabel.textContent = "Al abrir este sitio aparecera un aviso para decidir si quieres escuchar la pagina.";
}

function showStatus(message, isError) {
  dom.status.textContent = message;
  dom.status.style.color = isError ? "#a21d1d" : "#6b4d2d";
}

function getSettingsFromDom() {
  return sanitizeSettings({
    fontScale: Number(dom.fontScale.value) / 100,
    highContrast: dom.highContrast.checked,
    dyslexiaFriendly: dom.dyslexiaFriendly.checked,
    lineHeight: Number(dom.lineHeight.value),
    letterSpacing: Number(dom.letterSpacing.value),
    readingRuler: dom.readingRuler.checked,
    focusParagraph: dom.focusParagraph.checked,
    hideDistractions: dom.hideDistractions.checked,
    keyboardShortcuts: dom.keyboardShortcuts.checked,
    ttsRate: Number(dom.ttsRate.value)
  });
}

async function syncActiveTab(settingsOverride) {
  if (!state.isSupportedTab || typeof state.activeTabId !== "number") {
    showStatus("No se detecto una pestana activa compatible.", true);
    return;
  }

  const settings = settingsOverride || getSettingsFromDom();
  await sendMessageToTab(state.activeTabId, {
    type: "A11Y_SYNC",
    payload: {
      settings,
      siteMode: state.siteMode,
      ttsMode: state.ttsMode
    }
  });
}

async function applySettings() {
  const settings = getSettingsFromDom();
  paintValues(settings);

  await storageSet({
    [STORAGE_KEY]: settings,
    [SITE_RULES_KEY]: state.siteRules,
    [TTS_SITE_RULES_KEY]: state.ttsSiteRules
  });

  await syncActiveTab(settings);
  showStatus("Ajustes guardados.", false);
}

async function sendTtsAction(action) {
  if (!state.isSupportedTab || typeof state.activeTabId !== "number") {
    showStatus("No se puede usar lectura en voz en esta pestana.", true);
    return;
  }

  await storageSet({ [STORAGE_KEY]: getSettingsFromDom() });
  const result = await sendMessageToTab(state.activeTabId, {
    type: "A11Y_TTS",
    payload: {
      action,
      rate: Number(dom.ttsRate.value)
    }
  });

  if (!result || !result.ok) {
    const reasons = {
      unsupported: "Esta pagina no permite lectura en voz en este navegador.",
      "empty-selection": "Selecciona un texto antes de pedir la lectura.",
      empty: "No encontre texto suficiente para leer en esta pagina.",
      "invalid-action": "No se pudo ejecutar la accion de lectura."
    };
    showStatus(reasons[result && result.reason ? result.reason : "invalid-action"], true);
    return;
  }

  const messages = {
    "read-selection": "Estoy leyendo la seleccion.",
    "read-page": "Estoy leyendo la parte principal de la pagina.",
    "toggle-pause": "La lectura se pauso o reanudo.",
    stop: "La lectura se detuvo."
  };
  showStatus(messages[action] || "Comando de lectura enviado.", false);
}

async function exportConfig() {
  const data = await storageGet([STORAGE_KEY, SITE_RULES_KEY, TTS_SITE_RULES_KEY]);
  const blob = new Blob([JSON.stringify({
    settings: sanitizeSettings(data[STORAGE_KEY]),
    siteRules: sanitizeSiteRules(data[SITE_RULES_KEY]),
    ttsSiteRules: sanitizeTtsSiteRules(data[TTS_SITE_RULES_KEY])
  }, null, 2)], { type: "application/json" });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "accesibilidad-config.json";
  anchor.click();
  URL.revokeObjectURL(url);
  showStatus("Tus ajustes se exportaron correctamente.", false);
}

function applyProfile(profileName) {
  const preset = PROFILES[profileName];
  if (!preset) {
    showStatus("Elige un perfil valido.", true);
    return;
  }

  const merged = sanitizeSettings({
    ...getSettingsFromDom(),
    ...preset
  });

  paintValues(merged);
  applySettings().catch(() => showStatus("No se pudo aplicar el perfil.", true));
}

async function importConfigFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const safeSettings = sanitizeSettings(parsed.settings);
  const safeRules = sanitizeSiteRules(parsed.siteRules);
  const safeTtsRules = sanitizeTtsSiteRules(parsed.ttsSiteRules);

  await storageSet({
    [STORAGE_KEY]: safeSettings,
    [SITE_RULES_KEY]: safeRules,
    [TTS_SITE_RULES_KEY]: safeTtsRules
  });

  state.siteRules = safeRules;
  state.siteMode = resolveSiteMode(state.activeHost, state.siteRules);
  state.ttsSiteRules = safeTtsRules;
  state.ttsMode = resolveTtsMode(state.activeHost, state.ttsSiteRules);

  paintValues(safeSettings);
  paintSiteState();
  paintTtsState();
  await syncActiveTab(safeSettings);
  showStatus("Tus ajustes se importaron correctamente.", false);
}

function showPremiumOutput(title, content) {
  dom.premiumOutput.value = `${title}\n\n${content}`.trim();
}

async function runPremiumSummary() {
  if (!state.isSupportedTab || typeof state.activeTabId !== "number") {
    showStatus("No se puede resumir esta pestana.", true);
    return;
  }

  const level = String(dom.premiumLevel.value || "media");
  const result = await sendMessageToTab(state.activeTabId, {
    type: "A11Y_PREMIUM_SUMMARY",
    payload: { level }
  });

  if (!result || !result.ok) {
    throw new Error("summary-failed");
  }

  showPremiumOutput("Resumen rapido", result.text || "No se encontro texto suficiente.");
  showStatus("El resumen ya esta listo.", false);
}

async function runPremiumSimplification() {
  if (!state.isSupportedTab || typeof state.activeTabId !== "number") {
    showStatus("No se puede simplificar esta pestana.", true);
    return;
  }

  const level = String(dom.premiumLevel.value || "media");
  const result = await sendMessageToTab(state.activeTabId, {
    type: "A11Y_PREMIUM_SIMPLIFY",
    payload: { level }
  });

  if (!result || !result.ok) {
    throw new Error("simplify-failed");
  }

  showPremiumOutput("Version mas clara", result.text || "No se encontro texto suficiente.");
  showStatus("La version mas clara ya esta lista.", false);
}

async function copyPremiumOutput() {
  const text = String(dom.premiumOutput.value || "").trim();
  if (!text) {
    showStatus("Todavia no hay texto para copiar.", true);
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    showStatus("El resultado se copio al portapapeles.", false);
    return;
  }

  dom.premiumOutput.focus();
  dom.premiumOutput.select();
  document.execCommand("copy");
  showStatus("El resultado se copio al portapapeles.", false);
}

async function setModeForCurrentSite(mode, successMessage) {
  if (!state.activeHost || !state.isSupportedTab) {
    showStatus("Sitio no compatible para control por dominio.", true);
    return;
  }

  state.siteMode = mode === SITE_MODE_DEFAULT ? DEFAULT_SITE_MODE : mode;
  state.siteRules = withSiteMode(state.activeHost, mode, state.siteRules);
  paintSiteState();
  await applySettings();
  showStatus(successMessage, false);
}

async function setTtsModeForCurrentSite(mode, successMessage) {
  if (!state.activeHost || !state.isSupportedTab) {
    showStatus("Sitio no compatible para lectura automatica.", true);
    return;
  }

  state.ttsMode = mode;
  state.ttsSiteRules = withTtsMode(state.activeHost, mode, state.ttsSiteRules);
  paintTtsState();

  await storageSet({
    [STORAGE_KEY]: getSettingsFromDom(),
    [SITE_RULES_KEY]: state.siteRules,
    [TTS_SITE_RULES_KEY]: state.ttsSiteRules
  });
  await syncActiveTab();
  showStatus(successMessage, false);
}

async function boot() {
  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const activeTab = tabs && tabs[0];
  const activeUrl = String(activeTab && activeTab.url ? activeTab.url : "");

  state.activeTabId = activeTab && typeof activeTab.id === "number" ? activeTab.id : null;
  state.activeHost = parseHostnameFromUrl(activeUrl);
  state.isSupportedTab = activeUrl.startsWith("http://") || activeUrl.startsWith("https://");

  const result = await storageGet([STORAGE_KEY, SITE_RULES_KEY, TTS_SITE_RULES_KEY]);
  const settings = sanitizeSettings(result[STORAGE_KEY]);
  state.siteRules = sanitizeSiteRules(result[SITE_RULES_KEY]);
  state.siteMode = resolveSiteMode(state.activeHost, state.siteRules);
  state.ttsSiteRules = sanitizeTtsSiteRules(result[TTS_SITE_RULES_KEY]);
  state.ttsMode = resolveTtsMode(state.activeHost, state.ttsSiteRules);

  paintValues(settings);
  paintSiteState();
  paintTtsState();

  const controls = [
    dom.fontScale,
    dom.lineHeight,
    dom.letterSpacing,
    dom.highContrast,
    dom.dyslexiaFriendly,
    dom.readingRuler,
    dom.focusParagraph,
    dom.hideDistractions,
    dom.keyboardShortcuts,
    dom.ttsRate
  ];

  controls.forEach((control) => {
    control.addEventListener("input", () => {
      applySettings().catch(() => showStatus("No pude aplicar los cambios en esta pagina.", true));
    });
    control.addEventListener("change", () => {
      applySettings().catch(() => showStatus("No pude aplicar los cambios en esta pagina.", true));
    });
  });

  dom.reset.addEventListener("click", () => {
    paintValues(DEFAULT_SETTINGS);
    applySettings().catch(() => showStatus("No pude restablecer los ajustes en esta pagina.", true));
  });

  dom.siteEnabled.addEventListener("change", () => {
    const targetMode = dom.siteEnabled.checked ? SITE_MODE_ALWAYS : SITE_MODE_NEVER;
    setModeForCurrentSite(targetMode, "Preferencia de este sitio actualizada.").catch(() => {
      showStatus("No se pudo actualizar este sitio.", true);
    });
  });

  dom.siteAlways.addEventListener("click", () => {
    setModeForCurrentSite(SITE_MODE_ALWAYS, "Este dominio quedo activado para accesibilidad.").catch(() => {
      showStatus("No se pudo guardar este dominio.", true);
    });
  });

  dom.siteNever.addEventListener("click", () => {
    setModeForCurrentSite(SITE_MODE_NEVER, "Este dominio quedo desactivado.").catch(() => {
      showStatus("No se pudo desactivar este dominio.", true);
    });
  });

  dom.resetSite.addEventListener("click", () => {
    setModeForCurrentSite(SITE_MODE_DEFAULT, "Este dominio volvio al estado inicial.").catch(() => {
      showStatus("No se pudo restablecer este dominio.", true);
    });
  });

  dom.applyProfile.addEventListener("click", () => {
    applyProfile(dom.profileSelect.value);
  });

  dom.ttsReadSelection.addEventListener("click", () => {
    sendTtsAction("read-selection").catch(() => showStatus("No se pudo leer la seleccion.", true));
  });

  dom.ttsReadPage.addEventListener("click", () => {
    sendTtsAction("read-page").catch(() => showStatus("No se pudo leer la pagina.", true));
  });

  dom.ttsToggle.addEventListener("click", () => {
    sendTtsAction("toggle-pause").catch(() => showStatus("No se pudo pausar o reanudar.", true));
  });

  dom.ttsStop.addEventListener("click", () => {
    sendTtsAction("stop").catch(() => showStatus("No se pudo detener la lectura.", true));
  });

  dom.ttsAsk.addEventListener("click", () => {
    setTtsModeForCurrentSite(TTS_MODE_ASK, "Este sitio preguntara antes de leer automaticamente.").catch(() => {
      showStatus("No se pudo actualizar la lectura automatica.", true);
    });
  });

  dom.ttsAlways.addEventListener("click", () => {
    setTtsModeForCurrentSite(TTS_MODE_ALWAYS, "Este sitio leera automaticamente la pagina al abrirse.").catch(() => {
      showStatus("No se pudo actualizar la lectura automatica.", true);
    });
  });

  dom.ttsNever.addEventListener("click", () => {
    setTtsModeForCurrentSite(TTS_MODE_NEVER, "Este sitio no iniciara lectura automatica.").catch(() => {
      showStatus("No se pudo actualizar la lectura automatica.", true);
    });
  });

  dom.exportConfig.addEventListener("click", () => {
    exportConfig().catch(() => showStatus("No se pudo exportar configuracion.", true));
  });

  dom.importConfig.addEventListener("click", () => {
    dom.importFile.click();
  });

  dom.importFile.addEventListener("change", () => {
    const selected = dom.importFile.files && dom.importFile.files[0];
    if (!selected) {
      return;
    }

    importConfigFile(selected).catch(() => {
      showStatus("El archivo no tiene formato valido.", true);
    });
    dom.importFile.value = "";
  });

  dom.premiumSummary.addEventListener("click", () => {
    runPremiumSummary().catch(() => showStatus("No se pudo generar el resumen.", true));
  });

  dom.premiumSimplify.addEventListener("click", () => {
    runPremiumSimplification().catch(() => showStatus("No se pudo simplificar el texto.", true));
  });

  dom.premiumCopy.addEventListener("click", () => {
    copyPremiumOutput().catch(() => showStatus("No se pudo copiar el resultado.", true));
  });
}

boot().catch(() => {
  showStatus("No se pudieron cargar los ajustes.", true);
});