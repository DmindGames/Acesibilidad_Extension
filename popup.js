const api = typeof browser !== "undefined" ? browser : chrome;
const STORAGE_KEY = "a11ySettings";
const SITE_RULES_KEY = "a11ySiteRules";
const OCR_API_KEY_STORAGE = "a11yOcrApiKey";
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
  ttsToggle: document.getElementById("tts-toggle"),
  ttsStop: document.getElementById("tts-stop"),
  siteHost: document.getElementById("site-host"),
  siteEnabled: document.getElementById("site-enabled"),
  siteAlways: document.getElementById("site-always"),
  siteNever: document.getElementById("site-never"),
  resetSite: document.getElementById("reset-site"),
  siteModeLabel: document.getElementById("site-mode-label"),
  runAudit: document.getElementById("run-audit"),
  auditResults: document.getElementById("audit-results"),
  exportConfig: document.getElementById("export-config"),
  importConfig: document.getElementById("import-config"),
  importFile: document.getElementById("import-file"),
  premiumLevel: document.getElementById("premium-level"),
  premiumSummary: document.getElementById("premium-summary"),
  premiumSimplify: document.getElementById("premium-simplify"),
  premiumCopy: document.getElementById("premium-copy"),
  premiumOutput: document.getElementById("premium-output"),
  ocrApiKey: document.getElementById("ocr-api-key"),
  ocrDetect: document.getElementById("ocr-detect"),
  ocrRead: document.getElementById("ocr-read"),
  ocrCopy: document.getElementById("ocr-copy"),
  ocrOutput: document.getElementById("ocr-output"),
  reset: document.getElementById("reset-settings"),
  status: document.getElementById("status")
};

const state = {
  activeTabId: null,
  activeHost: "",
  siteRules: {},
  siteMode: SITE_MODE_DEFAULT,
  isSupportedTab: true,
  lastOcrText: ""
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

function paintAuditResult(result) {
  const rows = [
    `Imagenes sin alt o alt vacio: ${result.imagesWithoutAlt}`,
    `Saltos no recomendados en encabezados: ${result.headingOrderIssues}`,
    `Textos con posible contraste bajo: ${result.lowContrastText}`
  ];

  dom.auditResults.innerHTML = "";
  rows.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    dom.auditResults.appendChild(item);
  });
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

async function runAudit() {
  if (!state.isSupportedTab || typeof state.activeTabId !== "number") {
    showStatus("No se puede auditar esta pestana.", true);
    return;
  }

  const result = await sendMessageToTab(state.activeTabId, { type: "A11Y_AUDIT" });
  paintAuditResult(result || { imagesWithoutAlt: 0, headingOrderIssues: 0, lowContrastText: 0 });
  showStatus("Auditoria completada.", false);
}

async function sendTtsAction(action) {
  if (!state.isSupportedTab || typeof state.activeTabId !== "number") {
    showStatus("No se puede usar TTS en esta pestana.", true);
    return;
  }

  const payload = {
    action,
    rate: Number(dom.ttsRate.value)
  };

  await sendMessageToTab(state.activeTabId, { type: "A11Y_TTS", payload });
  showStatus("Comando TTS enviado.", false);
}

async function exportConfig() {
  const data = await storageGet([STORAGE_KEY, SITE_RULES_KEY, OCR_API_KEY_STORAGE]);
  const blob = new Blob([JSON.stringify({
    settings: sanitizeSettings(data[STORAGE_KEY]),
    siteRules: sanitizeSiteRules(data[SITE_RULES_KEY]),
    ocrApiKey: String(data[OCR_API_KEY_STORAGE] || "")
  }, null, 2)], { type: "application/json" });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "accesibilidad-config.json";
  anchor.click();
  URL.revokeObjectURL(url);
  showStatus("Configuracion exportada.", false);
}

function applyProfile(profileName) {
  const preset = PROFILES[profileName];
  if (!preset) {
    showStatus("Selecciona un perfil valido.", true);
    return;
  }

  const merged = {
    ...getSettingsFromDom(),
    ...preset
  };

  paintValues(sanitizeSettings(merged));
  applySettings().catch(() => showStatus("No se pudo aplicar el perfil.", true));
}

async function importConfigFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const safeSettings = sanitizeSettings(parsed.settings);
  const safeRules = sanitizeSiteRules(parsed.siteRules);
  const safeOcrApiKey = String(parsed.ocrApiKey || "").trim();

  await storageSet({
    [STORAGE_KEY]: safeSettings,
    [SITE_RULES_KEY]: safeRules,
    [OCR_API_KEY_STORAGE]: safeOcrApiKey
  });

  state.siteRules = safeRules;
  state.siteMode = resolveSiteMode(state.activeHost, state.siteRules);
  dom.ocrApiKey.value = safeOcrApiKey;
  paintValues(safeSettings);
  paintSiteState();
  await applySettings();
  showStatus("Configuracion importada.", false);
}

function ocrApiKeyValue() {
  const key = String(dom.ocrApiKey.value || "").trim();
  return key || "helloworld";
}

async function collectImageCandidates() {
  const result = await sendMessageToTab(state.activeTabId, { type: "A11Y_OCR_COLLECT_IMAGES" });
  const urls = result && Array.isArray(result.urls) ? result.urls : [];
  return urls.slice(0, 6);
}

async function runOcrForImageUrl(imageUrl, apiKey) {
  const formData = new FormData();
  formData.append("apikey", apiKey);
  formData.append("language", "spa");
  formData.append("isOverlayRequired", "false");
  formData.append("url", imageUrl);

  const response = await fetch("https://api.ocr.space/parse/imageurl", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error("ocr-request-failed");
  }

  const data = await response.json();
  const parsed = data && Array.isArray(data.ParsedResults) ? data.ParsedResults : [];
  const text = parsed
    .map((item) => String(item && item.ParsedText ? item.ParsedText : "").trim())
    .filter((value) => value.length > 0)
    .join("\n");

  return text;
}

async function detectOcrText() {
  if (!state.isSupportedTab || typeof state.activeTabId !== "number") {
    showStatus("No se puede ejecutar OCR en esta pestana.", true);
    return;
  }

  const apiKey = ocrApiKeyValue();
  await storageSet({ [OCR_API_KEY_STORAGE]: apiKey });

  const candidates = await collectImageCandidates();
  if (!candidates.length) {
    dom.ocrOutput.value = "No se encontraron imagenes visibles compatibles para OCR.";
    state.lastOcrText = "";
    showStatus("OCR sin imagenes detectadas.", true);
    return;
  }

  const chunks = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const url = candidates[index];
    try {
      const text = await runOcrForImageUrl(url, apiKey);
      if (text) {
        chunks.push(`Imagen ${index + 1}:\n${text}`);
      }
    } catch (_error) {
      // Continue with next candidate image.
    }
  }

  if (!chunks.length) {
    const help = "No se detecto texto. Verifica API key o usa imagenes con texto mas claro.";
    dom.ocrOutput.value = help;
    state.lastOcrText = "";
    showStatus("OCR sin texto detectado.", true);
    return;
  }

  const merged = chunks.join("\n\n");
  state.lastOcrText = merged;
  dom.ocrOutput.value = merged;
  showStatus("OCR completado.", false);
}

async function readOcrText() {
  const text = String(state.lastOcrText || dom.ocrOutput.value || "").trim();
  if (!text) {
    showStatus("No hay texto OCR para leer.", true);
    return;
  }

  await sendMessageToTab(state.activeTabId, {
    type: "A11Y_TTS_CUSTOM",
    payload: {
      text,
      rate: Number(dom.ttsRate.value)
    }
  });
  showStatus("Leyendo texto OCR.", false);
}

async function copyOcrText() {
  const text = String(state.lastOcrText || dom.ocrOutput.value || "").trim();
  if (!text) {
    showStatus("No hay texto OCR para copiar.", true);
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    showStatus("Texto OCR copiado.", false);
    return;
  }

  dom.ocrOutput.focus();
  dom.ocrOutput.select();
  document.execCommand("copy");
  showStatus("Texto OCR copiado.", false);
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

  showPremiumOutput("Resumen de pagina", result.text || "No se encontro texto suficiente.");
  showStatus("Resumen generado.", false);
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

  showPremiumOutput("Texto simplificado", result.text || "No se encontro texto suficiente.");
  showStatus("Texto simplificado generado.", false);
}

async function copyPremiumOutput() {
  const text = String(dom.premiumOutput.value || "").trim();
  if (!text) {
    showStatus("No hay resultado para copiar.", true);
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    showStatus("Resultado copiado al portapapeles.", false);
    return;
  }

  dom.premiumOutput.focus();
  dom.premiumOutput.select();
  document.execCommand("copy");
  showStatus("Resultado copiado al portapapeles.", false);
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

  const result = await storageGet([STORAGE_KEY, SITE_RULES_KEY, OCR_API_KEY_STORAGE]);
  const settings = sanitizeSettings(result[STORAGE_KEY]);
  state.siteRules = sanitizeSiteRules(result[SITE_RULES_KEY]);
  state.siteMode = resolveSiteMode(state.activeHost, state.siteRules);
  dom.ocrApiKey.value = String(result[OCR_API_KEY_STORAGE] || "");

  paintValues(settings);
  paintSiteState();

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

  dom.applyProfile.addEventListener("click", () => {
    applyProfile(dom.profileSelect.value);
  });

  dom.runAudit.addEventListener("click", () => {
    runAudit().catch(() => showStatus("No se pudo ejecutar auditoria.", true));
  });

  dom.ttsReadSelection.addEventListener("click", () => {
    sendTtsAction("read-selection").catch(() => showStatus("No se pudo leer seleccion.", true));
  });

  dom.ttsToggle.addEventListener("click", () => {
    sendTtsAction("toggle-pause").catch(() => showStatus("No se pudo pausar/reanudar.", true));
  });

  dom.ttsStop.addEventListener("click", () => {
    sendTtsAction("stop").catch(() => showStatus("No se pudo detener TTS.", true));
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

  dom.ocrApiKey.addEventListener("change", () => {
    storageSet({ [OCR_API_KEY_STORAGE]: String(dom.ocrApiKey.value || "").trim() })
      .catch(() => undefined);
  });

  dom.ocrDetect.addEventListener("click", () => {
    detectOcrText().catch(() => showStatus("No se pudo completar OCR.", true));
  });

  dom.ocrRead.addEventListener("click", () => {
    readOcrText().catch(() => showStatus("No se pudo leer el OCR.", true));
  });

  dom.ocrCopy.addEventListener("click", () => {
    copyOcrText().catch(() => showStatus("No se pudo copiar OCR.", true));
  });
}

boot().catch(() => {
  showStatus("No se pudieron cargar los ajustes.", true);
});