// Bureaucracy Meme's runtime: the one place the app meets its host.
//
// In a desk the page is a same-origin frame and every desk service is a
// bridge call; on its own the same calls are answered by the bridge's
// standalone adapter. The feature calls a handful of plain functions —
// t(), html``, setStatus() — and this file is where those are defined.
(function installBureaucracyRuntime(root) {
  "use strict";

  const VERSION = "1.0.0";
  const strings = () => root.BureaucracyStrings || { en: {}, zh: {} };
  let bridge = null;
  let welcome = null;
  let started = null;
  const languageListeners = [];
  let lifecycleHandlers = {};
  let menu = null;
  let menuSignature = "";
  let menuTimer = 0;

  root.currentLanguage = "zh";

  function t(key, ...args) {
    const tables = strings();
    const table = tables[root.currentLanguage] || tables.zh || {};
    const value = table[key] ?? tables.en?.[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function html(parts, ...values) {
    let out = "";
    parts.forEach((part, index) => {
      out += part;
      if (index < values.length) out += htmlValue(values[index]);
    });
    return out;
  }
  function htmlValue(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(htmlValue).join("");
    if (value && typeof value === "object" && typeof value.safeHtml === "string") return value.safeHtml;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return escapeHtml(value);
  }
  html.raw = (markup) => Array.isArray(markup)
    ? { safeHtml: markup.map((part) => String(part ?? "")).join("") }
    : { safeHtml: String(markup ?? "") };

  function translateWithin(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const value = t(el.dataset.i18n);
      if (String(value).includes("<")) el.innerHTML = value;
      else el.textContent = value;
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    scope.querySelectorAll("[data-i18n-aria-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  }

  function setLanguage(language) {
    root.currentLanguage = language === "en" ? "en" : "zh";
    if (root.document?.documentElement) root.document.documentElement.lang = root.currentLanguage === "zh" ? "zh-Hans" : "en";
  }

  function setStatus(text) {
    const line = String(text ?? "");
    if (bridge && line) bridge.status({ text: line });
  }

  function createWindow(options = {}) {
    const doc = root.document;
    const windowName = String(options.windowName || "");
    const existing = doc.querySelector(`[data-window="${windowName}"]`);
    if (existing) return existing;
    const win = doc.createElement("section");
    win.className = ["window", options.windowClass].filter(Boolean).join(" ");
    win.dataset.window = windowName;
    if (options.labelledBy) win.setAttribute("aria-labelledby", options.labelledBy);
    if (options.statusClass || options.statusHtml) {
      const bar = doc.createElement("div");
      bar.className = ["details-bar", "kit-status-bar", options.statusClass].filter(Boolean).join(" ");
      bar.innerHTML = String(options.statusHtml || "");
      win.append(bar);
      win.applicationStatusBar = bar;
    }
    const pane = doc.createElement("div");
    pane.className = ["window-pane", options.paneClass].filter(Boolean).join(" ");
    pane.innerHTML = String(options.paneHtml || "");
    win.append(pane);
    win.applicationPane = pane;
    (doc.getElementById("app") || doc.body).append(win);
    translateWithin(win);
    if (options.title) setTitle(options.title);
    return win;
  }

  function setTitle(text) {
    if (bridge) bridge.setTitle(String(text || ""));
    else if (root.document) root.document.title = String(text || "");
  }

  function pushMenuState() {
    menuTimer = 0;
    if (!bridge || !menu) return;
    const available = {};
    const checked = {};
    const reasons = {};
    menu.commands().forEach((action) => {
      const answer = menu.availability(action) || {};
      available[action] = answer.available === true;
      if (!available[action] && answer.reason) reasons[action] = String(answer.reason);
      if (menu.checked) checked[action] = menu.checked(action) === true;
    });
    const signature = JSON.stringify([available, checked, reasons]);
    if (signature === menuSignature) return;
    menuSignature = signature;
    bridge.menuState({ available, checked, reasons });
  }

  function scheduleMenuState() {
    if (menuTimer) return;
    menuTimer = setTimeout(pushMenuState, 30);
  }

  function setMenu(definition) {
    menu = definition;
    if (typeof MutationObserver === "function" && root.document?.body) {
      new MutationObserver(scheduleMenuState).observe(root.document.body, {
        attributes: true, childList: true, subtree: true, characterData: true,
      });
    }
    scheduleMenuState();
  }

  // Desk service: captions, and anything else the manifest lists.
  function service(name, params) {
    if (!bridge) {
      return Promise.resolve({ ok: false, reason: "unavailable" });
    }
    return bridge.call("service.request", { name: String(name || ""), params: params || {} })
      .then((result) => (result && typeof result === "object" ? result : { ok: false, reason: "unavailable" }),
        (error) => ({ ok: false, reason: String(error?.code || error?.message || "unavailable") }));
  }

  // PNG (and other) downloads through the desk's files.export, or the
  // standalone adapter's download.
  function exportFile({ name, mime, body, bytes } = {}) {
    if (!bridge || !String(name || "").trim()) return Promise.resolve(false);
    const params = { name: String(name), mime: String(mime || "application/octet-stream") };
    if (bytes !== undefined && bytes !== null) params.bytes = bytes;
    else params.body = String(body ?? "");
    return bridge.call("files.export", params).then(() => true, () => false);
  }

  function dataUrlToBytes(dataUrl) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ""));
    if (!match) return null;
    const payload = match[3] || "";
    if (match[2]) {
      const binary = root.atob(payload);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  function start(options = {}) {
    if (started) return started;
    started = (async () => {
      try {
        bridge = await root.AIS6Bridge.connect({
          appId: options.appId,
          window: options.window,
          version: options.version || VERSION,
        });
      } catch (error) {
        bridge = null;
      }
      welcome = bridge?.welcome || null;
      setLanguage(welcome?.language || (new URLSearchParams(root.location?.search || "").get("lang") === "en" ? "en" : "zh"));
      if (bridge) {
        bridge.on("language.changed", ({ language }) => {
          setLanguage(language);
          translateWithin(root.document);
          languageListeners.forEach((fn) => { try { fn(root.currentLanguage); } catch (error) { console.error(error); } });
        });
        const lifecycle = (name) => async () => {
          try { await lifecycleHandlers[name]?.(); } catch (error) { console.error(error); }
          return {};
        };
        bridge.handle("lifecycle.suspend", lifecycle("onSuspend"));
        bridge.handle("lifecycle.resume", lifecycle("onResume"));
        bridge.handle("lifecycle.dispose", lifecycle("onDispose"));
        bridge.handle("menu.command", async ({ action }) => {
          if (!menu || !menu.commands().includes(action)) return { handled: false };
          await menu.run(action);
          scheduleMenuState();
          return { handled: true };
        });
      }
      return welcome;
    })();
    return started;
  }

  function ready() {
    if (bridge) bridge.ready();
  }

  function snapshots(target) {
    if (bridge && !bridge.standalone && (welcome?.capabilities || []).includes("snapshot")) {
      bridge.enableSnapshots({ producer: "dom", target: target || root.document?.body || null });
    }
  }

  root.t = t;
  root.html = html;
  root.escapeHtml = escapeHtml;
  root.translateWithin = translateWithin;
  root.setStatus = setStatus;

  root.BureaucracyRuntime = Object.freeze({
    start,
    ready,
    snapshots,
    welcome: () => welcome,
    hosted: () => Boolean(bridge && !bridge.standalone),
    version: () => welcome?.version || "dev",
    createWindow,
    setTitle,
    service,
    exportFile,
    dataUrlToBytes,
    onLanguage: (fn) => { languageListeners.push(fn); },
    lifecycle: (handlers) => { lifecycleHandlers = handlers || {}; },
    menu: setMenu,
    refreshMenu: scheduleMenuState,
    call: (method, params, options) => (bridge ? bridge.call(method, params, options) : Promise.reject(new Error("no bridge"))),
  });
})(typeof window !== "undefined" ? window : globalThis);
