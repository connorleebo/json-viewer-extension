// JSON Viewer (Stage 3) — injected into the active tab.
//
// Architecture:
//   1. Pure detect+parse pipeline — DOES NOT TOUCH THE DOM until we know
//      we can render. This is the do-no-harm rule: if anything goes
//      wrong, the user's original page stays exactly as Chrome rendered
//      it, with only a small floating toast added.
//   2. Chrome's built-in XML viewer is detected via the
//      `#webkit-xml-viewer-source-xml` element it injects; we read the
//      raw XML from there. For other XML pages (HTTP), we fall back to
//      a same-origin fetch.
//   3. JSONP wrappers (`varName = {...};`, `callback({...});`,
//      `/**/cb({...})`) are recognised after the strict JSON parse fails.
//   4. Tree DOM is built LAZILY — each container row only realises its
//      children when expanded. Huge arrays render in rIC-scheduled chunks
//      with a continuously updating progress bar.
//   5. Theme override is persisted to chrome.storage.local under the key
//      `themeOverride`. A "Remember theme" toggle and "Forget theme"
//      button live in the Settings menu.
//
// No build step, no minification, no telemetry, no network calls.
// Vendored libraries: vendor/js-yaml.js (MIT). XML uses native DOMParser.

(function () {
  if (window.__jsonViewerStage3Loaded) return;
  window.__jsonViewerStage3Loaded = true;

  // ---------- constants ----------

  const LARGE_FILE_BYTES = 2 * 1024 * 1024;       // 2 MB → progressive banner
  const ARRAY_CHUNK_SIZE = 200;                    // children per rIC batch
  const ARRAY_RENDER_THRESHOLD = 500;              // > this triggers chunking
  const EXPAND_ALL_NODE_CAP = 5000;                // safety cap; banner if exceeded
  const SEARCH_RESULT_CAP = 5000;                  // protect search on huge files
  const STORAGE_KEY = "themeOverride";
  const REMEMBER_KEY = "rememberTheme";
  const HTML_NS = "http://www.w3.org/1999/xhtml";

  // Element factory — must be used instead of document.createElement.
  //
  // In an XML document (Chrome's built-in XML viewer is one — contentType
  // is "text/xml"), `el("div")` creates a Node with
  // null namespace, which is a plain `Element`, NOT `HTMLDivElement`.
  // Plain `Element` does NOT expose `.style` or `.dataset`, so any
  // `something.style.x = …` will throw "Cannot set properties of
  // undefined". `createElementNS` with the XHTML namespace returns a
  // proper `HTMLElement` in BOTH HTML and XML documents.
  // (Stage 3.2 fix — verified by user's real-Chrome console trace.)
  function el(tag) {
    return document.createElementNS(HTML_NS, tag);
  }

  // ---------- mutable module state (declared up here — see Stage 2 fix) ----------

  let manualThemeOverride = null;   // null | "light" | "dark"
  let rememberTheme = true;          // persisted via storage
  let searchState = null;
  let openMenu = null;
  let openSettings = null;
  let openSortMenu = null;
  let sortMode = "original";         // "original" | "asc" | "desc"
  let viewerCtx = null;              // populated after renderShell

  // ---------- do-no-harm: snapshot original DOM BEFORE anything else ----------
  //
  // We snapshot body.innerHTML + title + documentElement.className the
  // moment the IIFE runs, so we can roll back any partial mutation if the
  // render path throws halfway through. `bodyTouched` flips true exactly
  // once, in `renderShell()`, immediately before the wipe.

  const ORIGINAL_BODY_HTML = document.body ? document.body.innerHTML : "";
  const ORIGINAL_TITLE = document.title;
  const ORIGINAL_DOC_ROOT_CLASS = document.documentElement
    ? document.documentElement.className : "";
  let bodyTouched = false;

  function restoreOriginalBody() {
    if (!bodyTouched) return;
    try {
      if (document.body) document.body.innerHTML = ORIGINAL_BODY_HTML;
      document.body && document.body.classList.remove("jv-body", "jv-dark", "jv-light");
      document.title = ORIGINAL_TITLE;
      if (document.documentElement) document.documentElement.className = ORIGINAL_DOC_ROOT_CLASS;
    } catch (e) {
      console.warn("[JV] restoreOriginalBody failed:", e);
    }
    bodyTouched = false;
    console.log("[JV] original body restored");
  }

  // ---------- entry point ----------

  console.log("[JV] inject start, url=" + window.location.href +
              ", contentType=" + (document.contentType || "(unknown)"));
  main();

  async function main() {
    let rawText = null;

    try {
      // 1. Detect Chrome's built-in XML viewer.
      const xmlMarkers = detectChromeXmlViewer();
      console.log("[JV] chrome XML viewer markers found: style=" +
                  (xmlMarkers.hasStyleId ? "YES" : "NO") +
                  ", source-div=" + (xmlMarkers.hasSourceDiv ? "YES" : "NO"));

      if (xmlMarkers.hasStyleId || xmlMarkers.hasSourceDiv) {
        rawText = await loadRawXml();
        if (rawText == null) {
          return abortNonDestructively("Could not load this XML file's raw source.");
        }
      } else {
        rawText = extractRawText();
      }

      const len = rawText ? rawText.length : 0;
      const head = rawText ? rawText.slice(0, 100).replace(/\n/g, "\\n") : "";
      console.log("[JV] extracted raw text, length=" + len + ", first 100 chars=" + head);

      if (!rawText || !rawText.trim()) {
        return abortNonDestructively("No JSON, YAML, or XML found on this page.");
      }

      const detection = detectAndParse(rawText);
      console.log("[JV] parse result: format=" + detection.format +
                  ", success=" + (detection.value !== undefined ? "YES" : "NO") +
                  (detection.error ? (", error=" + (detection.error.message || detection.error)) : "") +
                  ", confident=" + detection.confident);

      // Confident-format parse error → render the error UI.
      // Non-confident → leave the page alone (do-no-harm).
      if (detection.error) {
        if (detection.confident) {
          loadThemeThen(() => safeRender(() =>
            renderError(detection.format, rawText, detection.error)
          ));
          return;
        }
        return abortNonDestructively("This page doesn't look like JSON, YAML, or XML.");
      }

      const root = buildModel(detection.value, null, null);
      loadThemeThen(() => safeRender(() =>
        renderTree(detection.format, root, rawText, detection)
      ));
    } catch (err) {
      console.error("[JV] crashed during inject:", err);
      return abortNonDestructively(
        "Could not render this page: " + (err && err.message ? err.message : err)
      );
    }
  }

  // Wraps the actual body-replacing render. Any throw inside the render
  // pipeline restores the original DOM rather than leaving a blank page.
  function safeRender(fn) {
    console.log("[JV] about to render shell");
    try { fn(); }
    catch (err) {
      console.error("[JV] render threw; restoring original body:", err);
      restoreOriginalBody();
      showToast("Render failed: " + (err && err.message ? err.message : err));
    }
  }

  // =====================================================================
  // do-no-harm: non-destructive abort
  // =====================================================================

  function abortNonDestructively(message) {
    console.log("[JV] aborting non-destructively, reason=" + message);
    // If the render path got far enough to wipe the body, restore the
    // original DOM before showing the toast. (Should not happen on the
    // designed paths, but the snapshot makes it cheap to be defensive.)
    if (bodyTouched) restoreOriginalBody();
    showToast(message);
  }

  // showToast is the LAST LINE OF DEFENSE for communicating with the user
  // when the render path fails. It MUST NEVER THROW — if it does, we've
  // lost the ability to surface any signal at all. Every step is wrapped
  // in try/catch, and styles are set property-by-property with individual
  // guards so a single failing assignment doesn't poison the rest.
  function showToast(text) {
    try {
      if (!document.body) return;
      const toast = el("div");
      try { toast.textContent = String(text == null ? "" : text); } catch (_) {}

      // Style property by property — if any one assignment throws because
      // toast.style is somehow unavailable, we still try the others.
      const setStyle = (k, v) => {
        try { if (toast.style) toast.style[k] = v; } catch (_) {}
      };
      setStyle("position", "fixed");
      setStyle("bottom", "16px");
      setStyle("right", "16px");
      setStyle("maxWidth", "320px");
      setStyle("zIndex", "2147483647");
      setStyle("padding", "10px 14px");
      setStyle("borderRadius", "6px");
      setStyle("background", "#1f2328");
      setStyle("color", "#ffffff");
      setStyle("font", "13px ui-sans-serif, system-ui, -apple-system, sans-serif");
      setStyle("lineHeight", "1.4");
      setStyle("boxShadow", "0 6px 20px rgba(0,0,0,0.25)");
      setStyle("opacity", "0");
      setStyle("transition", "opacity 200ms ease");

      try { document.body.appendChild(toast); } catch (e) {
        console.warn("[JV] toast appendChild failed:", e);
        return;
      }

      try { requestAnimationFrame(() => { setStyle("opacity", "1"); }); } catch (_) {}
      try { setTimeout(() => { setStyle("opacity", "0"); }, 5500); } catch (_) {}
      try { setTimeout(() => { try { toast.remove(); } catch (_) {} }, 5800); } catch (_) {}
    } catch (e) {
      // Absolute fallback — should be unreachable, but never let the
      // error handler itself escape.
      try { console.error("[JV] showToast itself threw:", e); } catch (_) {}
    }
  }

  // =====================================================================
  // text extraction + Chrome XML viewer handling
  // =====================================================================

  function extractRawText() {
    // Chrome's plain renderer for application/json puts the body inside <pre>.
    const pre = document.querySelector("body > pre");
    if (pre && pre.textContent) return pre.textContent;
    if (document.body) return document.body.innerText || document.body.textContent || "";
    return "";
  }

  // Detect Chrome's built-in XML viewer. Verified against real Chrome
  // DOM dumps: the viewer always injects both `<style id="xml-viewer-style">`
  // in <head> and `<div id="webkit-xml-viewer-source-xml">` in <body>.
  // Either marker is sufficient — checking both is defensive against
  // future Chromium changes that drop one or the other.
  function detectChromeXmlViewer() {
    const hasStyleId  = !!document.getElementById("xml-viewer-style");
    const hasSourceDiv = !!document.getElementById("webkit-xml-viewer-source-xml");
    return { hasStyleId, hasSourceDiv };
  }

  async function loadRawXml() {
    const src = document.getElementById("webkit-xml-viewer-source-xml");

    // Strategy A — innerHTML of the source div. In real Chrome's XML
    // viewer this div contains the original document element verbatim,
    // so its innerHTML IS the source XML markup (minus the prolog).
    if (src) {
      try {
        const raw = src.innerHTML;
        if (raw && raw.trim() && raw.indexOf("<") >= 0) {
          const text = raw.trim().startsWith("<?xml")
            ? raw
            : '<?xml version="1.0"?>\n' + raw;
          console.log("[JV] loadRawXml: via src.innerHTML, length=" + text.length);
          return text;
        }
      } catch (e) { console.warn("[JV] src.innerHTML threw:", e); }
    }

    // Strategy B — XMLSerializer on the first element child. Useful if
    // innerHTML on an XHTML parent serialized differently than we expect.
    if (src && src.firstElementChild) {
      try {
        const ser = new XMLSerializer().serializeToString(src.firstElementChild);
        if (ser && ser.trim()) {
          const text = ser.startsWith("<?xml") ? ser : '<?xml version="1.0"?>\n' + ser;
          console.log("[JV] loadRawXml: via XMLSerializer, length=" + text.length);
          return text;
        }
      } catch (e) { console.warn("[JV] XMLSerializer threw:", e); }
    }

    // Strategy C — same-origin fetch of the active tab's own URL.
    // Only attempt this when the URL or contentType strongly suggests
    // XML — otherwise a misfire (e.g. on a fragment-injected XML viewer
    // wrapper) can return an HTML page that we'd then mis-parse and
    // render a bogus "Invalid XML" panel, wiping the user's view.
    const url = window.location.href.toLowerCase();
    const ct = (document.contentType || "").toLowerCase();
    const urlLooksXml = /\.xml(\?|$|#)/.test(url) || ct === "text/xml" || ct === "application/xml";
    if (!urlLooksXml) {
      console.warn("[JV] loadRawXml: skipping fetch — url/contentType don't indicate XML");
      return null;
    }
    try {
      const resp = await fetch(window.location.href);
      if (resp.ok) {
        const text = await resp.text();
        // Sanity: a successful fetch on an XML URL should return something
        // that actually starts with XML markup. If not, bail rather than
        // hand the caller a payload that will trigger a destructive render.
        const trimmed = text.trimStart();
        if (trimmed.startsWith("<?xml") || /^<[a-zA-Z]/.test(trimmed)) {
          console.log("[JV] loadRawXml: via same-origin fetch, length=" + text.length);
          return text;
        }
        console.warn("[JV] loadRawXml: fetch returned non-XML body, length=" + text.length);
      } else {
        console.warn("[JV] same-origin fetch returned " + resp.status);
      }
    } catch (e) { console.warn("[JV] same-origin fetch threw:", e); }

    return null;
  }

  // =====================================================================
  // detect + parse (pure — does not touch DOM)
  // =====================================================================
  // Returns one of:
  //   { format, value, jsonp?, confident: true }   — success
  //   { format, error,           confident: true } — parse error worth showing
  //   { format, error,           confident: false } — couldn't recognise format

  function detectAndParse(text) {
    const trimmed = text.trimStart();

    // Try strict JSON first.
    try {
      return { format: "JSON", value: JSON.parse(text), confident: true };
    } catch (jsonErr) {
      // Maybe it's JSONP? Try to strip a wrapper.
      const stripped = tryStripJsonp(text);
      if (stripped) {
        try {
          return {
            format: "JSON",
            value: JSON.parse(stripped.inner),
            jsonp: stripped,
            confident: true,
          };
        } catch (_) { /* fall through */ }
      }

      const looksJson = /^[\s﻿]*[\[{]/.test(text);
      const looksXml  = trimmed.startsWith("<?xml") || /^<[a-zA-Z!?]/.test(trimmed);
      const looksYaml = trimmed.startsWith("---")   || /^[\w"'-]+\s*:\s/.test(trimmed);

      if (looksJson) {
        // Started with { or [ — JSON is the intended format; report its error.
        return { format: "JSON", error: jsonErr, confident: true };
      }
      if (looksXml) {
        try { return { format: "XML", value: parseXml(text), confident: true }; }
        catch (e) { return { format: "XML", error: e, confident: true }; }
      }
      if (looksYaml) {
        try { return { format: "YAML", value: parseYaml(text), confident: true }; }
        catch (e) { return { format: "YAML", error: e, confident: true }; }
      }
      // Couldn't identify the format with any confidence.
      return { format: "JSON", error: jsonErr, confident: false };
    }
  }

  function tryStripJsonp(text) {
    // Patterns:
    //   /**/cb({...});
    //   callback({...});
    //   var name = {...};
    //   name = {...};
    // The callback name may contain dots, e.g. `jQuery1234.callbacks._5`.
    const t = text.trim();
    let m;

    // varName = (...);  or  var varName = (...);
    m = t.match(/^(?:var\s+)?([A-Za-z_$][\w$.]*)\s*=\s*([\s\S]*?);?\s*$/);
    if (m) {
      const inner = m[2].trim();
      if (looksLikeJsonPayload(inner)) {
        return { kind: "assignment", name: m[1], inner: stripTrailingSemi(inner) };
      }
    }

    // /**/cb({...});  or  cb({...});
    m = t.match(/^(?:\/\*[\s\S]*?\*\/\s*)?([A-Za-z_$][\w$.]*)\s*\(([\s\S]*)\)\s*;?\s*$/);
    if (m) {
      const inner = m[2].trim();
      if (looksLikeJsonPayload(inner)) {
        return { kind: "call", name: m[1], inner };
      }
    }
    return null;
  }

  function looksLikeJsonPayload(s) {
    if (!s) return false;
    const c = s[0];
    return c === "{" || c === "[" || c === '"' || /^[-\d]/.test(c) || s === "true" || s === "false" || s === "null";
  }

  function stripTrailingSemi(s) { return s.replace(/;\s*$/, ""); }

  function parseYaml(text) {
    if (!window.jsyaml || typeof window.jsyaml.load !== "function") {
      throw new Error("YAML parser not loaded (vendor/js-yaml.js missing).");
    }
    return window.jsyaml.load(text);
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const parseErr = doc.querySelector("parsererror");
    if (parseErr) {
      const msg = parseErr.textContent.trim().split("\n").slice(0, 2).join(" ").trim();
      throw new Error(msg || "Malformed XML");
    }
    return xmlElementToObject(doc.documentElement);
  }

  function xmlElementToObject(el) {
    const out = {};
    if (el.attributes && el.attributes.length) {
      for (const a of el.attributes) out["@" + a.name] = a.value;
    }
    const childMap = {};
    let textBuf = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 1) {
        const child = xmlElementToObject(node);
        const tag = node.nodeName;
        if (childMap[tag] === undefined) childMap[tag] = child;
        else if (Array.isArray(childMap[tag])) childMap[tag].push(child);
        else childMap[tag] = [childMap[tag], child];
      } else if (node.nodeType === 3 || node.nodeType === 4) {
        textBuf += node.nodeValue;
      }
    }
    Object.assign(out, childMap);
    const text = textBuf.trim();
    if (text) {
      if (Object.keys(out).length === 0) return text;
      out["#text"] = text;
    }
    return Object.keys(out).length === 0 ? null : out;
  }

  // =====================================================================
  // model
  // =====================================================================

  function buildModel(value, key, parent) {
    let node;
    if (value === null) node = { kind: "null", key, value: null };
    else {
      const t = typeof value;
      if (t === "string")       node = { kind: "string",  key, value };
      else if (t === "number")  node = { kind: "number",  key, value };
      else if (t === "boolean") node = { kind: "boolean", key, value };
      else if (t === "bigint")  node = { kind: "number",  key, value: value.toString() };
      else if (Array.isArray(value)) {
        node = { kind: "array", key, value, children: [] };
        node.children = value.map((v, i) => buildModel(v, i, node));
      } else if (t === "object") {
        const entries = Object.entries(value);
        node = { kind: "object", key, value, children: [] };
        node.children = entries.map(([k, v]) => buildModel(v, k, node));
      } else {
        node = { kind: "string", key, value: String(value) };
      }
    }
    node.parent = parent || null;
    return node;
  }

  function isContainer(node) { return node.kind === "object" || node.kind === "array"; }

  function nodePath(node) {
    const parts = [];
    let cur = node;
    while (cur && cur.parent) {
      parts.push(cur.parent.kind === "array" ? `[${cur.key}]` : `.${safeIdent(String(cur.key))}`);
      cur = cur.parent;
    }
    return "$" + parts.reverse().join("");
  }

  function safeIdent(k) {
    if (/^[A-Za-z_][\w$]*$/.test(k)) return k;
    return `["${k.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
  }

  function nodeToJsonValue(node) {
    if (node.kind === "object") {
      const o = {};
      for (const c of node.children) o[c.key] = nodeToJsonValue(c);
      return o;
    }
    if (node.kind === "array") return node.children.map(nodeToJsonValue);
    return node.value;
  }

  // Return children in current sort order. Never mutates node.children.
  function orderedChildren(node) {
    if (!isContainer(node)) return [];
    if (sortMode === "original" || node.kind === "array") return node.children;
    const sorted = node.children.slice();
    if (sortMode === "asc")  sorted.sort((a, b) => keyCmp(a.key, b.key));
    if (sortMode === "desc") sorted.sort((a, b) => keyCmp(b.key, a.key));
    return sorted;
  }

  function keyCmp(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  // =====================================================================
  // theme + storage
  // =====================================================================

  function loadThemeThen(cb) {
    // chrome.storage may not be present (e.g. in our Playwright harness).
    // In that case just proceed with defaults.
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      rememberTheme = true;
      manualThemeOverride = null;
      cb();
      return;
    }
    chrome.storage.local.get([STORAGE_KEY, REMEMBER_KEY], (got) => {
      rememberTheme = got && got[REMEMBER_KEY] !== false; // default true
      manualThemeOverride = (got && got[STORAGE_KEY]) || null;
      cb();
    });
  }

  function persistTheme() {
    if (!rememberTheme) return;
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.set({ [STORAGE_KEY]: manualThemeOverride });
  }

  function persistRemember() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.set({ [REMEMBER_KEY]: rememberTheme });
  }

  function forgetTheme() {
    manualThemeOverride = null;
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.remove([STORAGE_KEY]);
  }

  function applyInitialTheme(body) {
    let dark;
    if (manualThemeOverride === "dark") dark = true;
    else if (manualThemeOverride === "light") dark = false;
    else dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    body.classList.toggle("jv-dark", dark);
    body.classList.toggle("jv-light", !dark);
  }

  function toggleTheme(body) {
    const goingDark = !body.classList.contains("jv-dark");
    body.classList.toggle("jv-dark", goingDark);
    body.classList.toggle("jv-light", !goingDark);
    manualThemeOverride = goingDark ? "dark" : "light";
    persistTheme();
  }

  function themeButtonLabel() {
    const dark = document.body && document.body.classList.contains("jv-dark");
    return dark ? "Light" : "Dark";
  }

  // =====================================================================
  // shell + toolbar
  // =====================================================================

  function renderError(format, rawText, err) {
    const ctx = renderShell(format, null);
    ctx.treeContainer.appendChild(makeParseError(rawText, err, format));
  }

  function renderTree(format, root, rawText, detection) {
    const ctx = renderShell(format, null);
    installLargeFileBannerIfNeeded(ctx, rawText.length);
    installJsonpIndicatorIfNeeded(ctx, detection);
    installToolbar(ctx, root, rawText, format);
    installSearch(ctx, root);
    installContextMenu(ctx, root);
    renderRoot(ctx, root);
  }

  function renderShell(format, errorContent) {
    // Mark the DOM as touched BEFORE the wipe — if anything below throws,
    // restoreOriginalBody() will roll the page back to exactly what
    // Chrome had rendered.
    bodyTouched = true;
    document.title = "JSON Viewer";
    const body = document.body || document.documentElement.appendChild(el("body"));
    body.innerHTML = "";
    body.classList.add("jv-body");
    applyInitialTheme(body);

    const header = el("div");
    header.className = "jv-header";

    const title = el("span");
    title.className = "jv-title";
    title.textContent = "JSON Viewer";
    header.appendChild(title);

    if (format) {
      const fmt = el("span");
      fmt.className = "jv-format";
      fmt.textContent = format;
      header.appendChild(fmt);
    }

    const toolbar = el("div");
    toolbar.className = "jv-toolbar";
    header.appendChild(toolbar);

    const banner = el("div");
    banner.className = "jv-banner";
    banner.style.display = "none";

    const jsonp = el("div");
    jsonp.className = "jv-jsonp-bar";
    jsonp.style.display = "none";

    const progressBar = el("div");
    progressBar.className = "jv-progress-bar";
    progressBar.style.display = "none";
    const progressFill = el("div");
    progressFill.className = "jv-progress-fill";
    const progressLabel = el("span");
    progressLabel.className = "jv-progress-label";
    progressBar.appendChild(progressFill);
    progressBar.appendChild(progressLabel);

    const treeContainer = el("div");
    treeContainer.className = "jv-root";

    const rawContainer = el("pre");
    rawContainer.className = "jv-raw";
    rawContainer.style.display = "none";
    // textContent is set later in installToolbar() with the actual raw
    // text, so renderShell stays cheap and the error-render path doesn't
    // pay for it.

    body.appendChild(header);
    body.appendChild(banner);
    body.appendChild(jsonp);
    body.appendChild(progressBar);
    body.appendChild(treeContainer);
    body.appendChild(rawContainer);

    if (errorContent) treeContainer.appendChild(errorContent);

    viewerCtx = { body, header, toolbar, banner, jsonp, progressBar, progressFill, progressLabel, treeContainer, rawContainer, format };
    return viewerCtx;
  }

  function installLargeFileBannerIfNeeded(ctx, byteLen) {
    if (byteLen < LARGE_FILE_BYTES) return;
    ctx.banner.style.display = "block";
    ctx.banner.textContent =
      `Large file (${(byteLen / 1024 / 1024).toFixed(2)} MB) — rendering progressively. ` +
      `Expand nodes to load their subtrees.`;
  }

  function installJsonpIndicatorIfNeeded(ctx, detection) {
    if (!detection || !detection.jsonp) return;
    ctx.jsonp.style.display = "block";
    ctx.jsonp.textContent =
      `JSONP detected — wrapper stripped (${detection.jsonp.kind === "call" ? "callback" : "assignment"} "${detection.jsonp.name}").`;
  }

  function installToolbar(ctx, root, raw, format) {
    // Stash raw text on the rawContainer when toolbar is built (not in renderShell)
    // because earlier I had an arguments[0] sentinel for clarity — set it now.
    ctx.rawContainer.textContent = raw;

    let isRaw = false;
    const btnRaw         = makeButton("Raw", "Toggle raw / parsed view");
    const btnExpandAll   = makeButton("Expand all", "Expand every container (capped for huge files)");
    const btnCollapseAll = makeButton("Collapse all", "Collapse every container");
    const btnSort        = makeSortButton(ctx, root);
    const btnCopy        = makeButton("Copy", `Copy formatted ${format}`);
    const btnDownload    = makeButton("Download", `Download as .${format.toLowerCase()}`);
    const btnSearch      = makeButton("Search", "Open search (Ctrl/Cmd-F)");
    const btnTheme       = makeButton(themeButtonLabel(), "Toggle dark / light mode");
    const btnSettings    = makeButton("⚙", "Settings");

    btnRaw.addEventListener("click", () => {
      isRaw = !isRaw;
      btnRaw.textContent = isRaw ? "Parsed" : "Raw";
      ctx.treeContainer.style.display = isRaw ? "none" : "";
      ctx.rawContainer.style.display = isRaw ? "" : "none";
    });

    btnExpandAll.addEventListener("click", () => expandAll(ctx, root));
    btnCollapseAll.addEventListener("click", () => collapseAll(ctx, root));

    btnCopy.addEventListener("click", async () => {
      const text = format === "JSON" ? JSON.stringify(nodeToJsonValue(root), null, 2) : raw;
      await copyToClipboard(text);
      flash(btnCopy, "Copied");
    });

    btnDownload.addEventListener("click", () => {
      const text = format === "JSON" ? JSON.stringify(nodeToJsonValue(root), null, 2) : raw;
      const ext = format.toLowerCase();
      const mime = format === "JSON" ? "application/json"
                 : format === "YAML" ? "application/yaml"
                 : "application/xml";
      downloadText(text, `document.${ext}`, mime);
    });

    btnSearch.addEventListener("click", () => focusSearch(ctx));
    btnTheme.addEventListener("click", () => { toggleTheme(ctx.body); btnTheme.textContent = themeButtonLabel(); });
    btnSettings.addEventListener("click", (e) => { e.stopPropagation(); openSettingsMenu(btnSettings, btnTheme); });

    ctx.toolbar.append(btnSearch, btnExpandAll, btnCollapseAll, btnSort, btnRaw, btnCopy, btnDownload, btnTheme, btnSettings);
  }

  function sortLabel() {
    return sortMode === "original" ? "Sort ▾"
         : sortMode === "asc"      ? "Sort: A→Z ▾"
         :                           "Sort: Z→A ▾";
  }

  // Sort dropdown: shows current state in the label, opens a small menu
  // with three options and a ✓ next to the active one. When sort is on
  // (asc/desc), the button gets a `.jv-btn-active` class for a visible
  // accent. Selecting an option closes the menu and re-renders the tree.
  function makeSortButton(ctx, root) {
    const btn = makeButton(sortLabel(), "Sort object keys");
    if (sortMode !== "original") btn.classList.add("jv-btn-active");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (openSortMenu) { openSortMenu.remove(); openSortMenu = null; return; }

      const menu = el("div");
      menu.className = "jv-ctx jv-sort-menu";
      menu.addEventListener("click", (ev) => ev.stopPropagation());

      const options = [
        ["original", "Original order"],
        ["asc",      "A→Z (alphabetical)"],
        ["desc",     "Z→A (reverse alphabetical)"],
      ];
      for (const [mode, label] of options) {
        const it = el("div");
        it.className = "jv-ctx-item jv-sort-item";
        const check = el("span");
        check.className = "jv-sort-check";
        check.textContent = sortMode === mode ? "✓" : "";
        const text = el("span");
        text.textContent = label;
        it.appendChild(check);
        it.appendChild(text);
        it.addEventListener("click", () => {
          if (sortMode !== mode) {
            sortMode = mode;
            btn.textContent = sortLabel();
            btn.classList.toggle("jv-btn-active", sortMode !== "original");
            rerenderAll(ctx, root);
          }
          menu.remove();
          openSortMenu = null;
        });
        menu.appendChild(it);
      }

      document.body.appendChild(menu);
      positionMenuBelow(menu, btn);
      openSortMenu = menu;

      const close = (ev) => {
        if (menu.contains(ev.target)) return;
        menu.remove(); openSortMenu = null;
        document.removeEventListener("mousedown", close, true);
      };
      setTimeout(() => document.addEventListener("mousedown", close, true), 0);
    });

    return btn;
  }

  function makeButton(label, title) {
    const b = el("button");
    b.type = "button";
    b.className = "jv-btn";
    b.textContent = label;
    b.title = title;
    return b;
  }

  function flash(btn, msg) {
    const orig = btn.textContent;
    btn.textContent = msg;
    btn.classList.add("jv-btn-flash");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("jv-btn-flash"); }, 900);
  }

  // =====================================================================
  // Settings menu
  // =====================================================================

  function openSettingsMenu(anchorBtn, themeBtn) {
    if (openSettings) { openSettings.remove(); openSettings = null; return; }

    const menu = el("div");
    menu.className = "jv-ctx jv-settings";
    menu.addEventListener("click", (e) => e.stopPropagation());

    // Remember theme toggle
    const rememberRow = el("label");
    rememberRow.className = "jv-ctx-item jv-ctx-row";
    const remCheck = el("input");
    remCheck.type = "checkbox";
    remCheck.checked = rememberTheme;
    const remLabel = el("span");
    remLabel.textContent = "Remember my theme preference";
    rememberRow.appendChild(remCheck);
    rememberRow.appendChild(remLabel);
    remCheck.addEventListener("change", () => {
      rememberTheme = remCheck.checked;
      persistRemember();
      if (!rememberTheme) {
        // If user opts out, also clear any stored theme.
        forgetTheme();
      } else {
        // Re-save current override if there is one.
        persistTheme();
      }
    });

    // Forget theme button
    const forgetRow = el("div");
    forgetRow.className = "jv-ctx-item";
    forgetRow.textContent = "Forget my theme preference";
    forgetRow.addEventListener("click", () => {
      forgetTheme();
      manualThemeOverride = null;
      applyInitialTheme(document.body);
      if (themeBtn) themeBtn.textContent = themeButtonLabel();
      menu.remove(); openSettings = null;
      showToast("Theme preference cleared. Future opens will follow your OS setting.");
    });

    // Privacy note (small, readable)
    const note = el("div");
    note.className = "jv-ctx-note";
    note.textContent = "Stored locally on this device only. Nothing else is saved.";

    menu.append(rememberRow, forgetRow, note);
    document.body.appendChild(menu);
    positionMenuBelow(menu, anchorBtn);
    openSettings = menu;

    // Click outside to close.
    const close = (ev) => {
      if (menu.contains(ev.target)) return;
      menu.remove(); openSettings = null;
      document.removeEventListener("mousedown", close, true);
    };
    setTimeout(() => document.addEventListener("mousedown", close, true), 0);
  }

  function positionMenuBelow(menu, anchor) {
    const r = anchor.getBoundingClientRect();
    const mr = menu.getBoundingClientRect();
    let left = r.right - mr.width;
    if (left < 4) left = 4;
    menu.style.left = left + "px";
    menu.style.top  = (r.bottom + 4) + "px";
  }

  // =====================================================================
  // lazy tree rendering + continuous progress
  // =====================================================================

  function renderRoot(ctx, root) {
    const el = createRowFor(root, ctx);
    ctx.treeContainer.appendChild(el);
    if (isContainer(root)) ensureExpanded(root, ctx);
  }

  // Wipe the tree and rebuild — used after sort-mode change.
  function rerenderAll(ctx, root) {
    ctx.treeContainer.innerHTML = "";
    // Reset DOM state on all nodes so realiseChildren runs fresh.
    (function reset(n) {
      delete n.dom;
      delete n.expanded;
      if (n.children) for (const c of n.children) reset(c);
    })(root);
    renderRoot(ctx, root);
  }

  function createRowFor(node, ctx) {
    const row = el("div");
    row.className = "jv-node";
    node.dom = { row };

    if (isContainer(node)) {
      const head = el("div");
      head.className = "jv-head";

      const toggle = el("span");
      toggle.className = "jv-toggle";
      toggle.textContent = "▸";
      head.appendChild(toggle);

      if (node.key != null) head.appendChild(keySpan(node.key, node.parent));

      const open = el("span");
      open.className = "jv-bracket";
      open.textContent = node.kind === "array" ? "[" : "{";
      head.appendChild(open);

      const count = el("span");
      count.className = "jv-count";
      count.textContent = " " + countLabel(node) + " ";
      head.appendChild(count);

      const close = el("span");
      close.className = "jv-bracket";
      close.textContent = node.kind === "array" ? "]" : "}";
      head.appendChild(close);

      const children = el("div");
      children.className = "jv-children";
      children.style.display = "none";

      head.addEventListener("click", () => toggleNode(node, ctx));

      row.appendChild(head);
      row.appendChild(children);

      node.dom.head = head;
      node.dom.toggle = toggle;
      node.dom.children = children;
      node.dom.childrenRealised = false;
      node.expanded = false;
    } else {
      if (node.key != null) row.appendChild(keySpan(node.key, node.parent));
      const val = el("span");
      val.className = "jv-" + node.kind;
      val.textContent = renderPrimitive(node);
      val.dataset.copyValue = primitiveCopyValue(node);
      row.appendChild(val);
      node.dom.val = val;
    }

    row.addEventListener("contextmenu", (e) => openContextMenu(e, node));
    return row;
  }

  function countLabel(node) {
    const n = node.children.length;
    if (node.kind === "array")  return `${n} ${n === 1 ? "item" : "items"}`;
    return `${n} ${n === 1 ? "key" : "keys"}`;
  }

  function keySpan(label, parent) {
    const s = el("span");
    s.className = "jv-key";
    if (parent && parent.kind === "array") s.textContent = label + ": ";
    else s.textContent = JSON.stringify(String(label)) + ": ";
    return s;
  }

  function renderPrimitive(node) {
    if (node.kind === "string") return JSON.stringify(node.value);
    if (node.kind === "null")   return "null";
    return String(node.value);
  }

  function primitiveCopyValue(node) {
    if (node.kind === "string") return node.value;
    if (node.kind === "null")   return "null";
    return String(node.value);
  }

  function toggleNode(node, ctx) {
    if (node.expanded) collapseNode(node);
    else ensureExpanded(node, ctx);
  }

  function ensureExpanded(node, ctx) {
    if (!isContainer(node)) return;
    if (!node.dom.childrenRealised) realiseChildren(node, ctx);
    node.expanded = true;
    node.dom.children.style.display = "";
    node.dom.toggle.textContent = "▾";
    node.dom.row.classList.remove("jv-collapsed");
  }

  function collapseNode(node) {
    if (!isContainer(node) || !node.dom) return;
    node.expanded = false;
    node.dom.children.style.display = "none";
    node.dom.toggle.textContent = "▸";
    node.dom.row.classList.add("jv-collapsed");
  }

  function realiseChildren(node, ctx) {
    node.dom.childrenRealised = true;
    const container = node.dom.children;
    const kids = orderedChildren(node);

    if (kids.length <= ARRAY_RENDER_THRESHOLD) {
      const frag = document.createDocumentFragment();
      for (const c of kids) frag.appendChild(createRowFor(c, ctx));
      container.appendChild(frag);
      return;
    }

    // Chunked render with continuously updating progress bar.
    //
    // We yield between batches via setTimeout(step, 0) rather than
    // requestIdleCallback. rIC can delay a batch for seconds when the
    // browser doesn't classify itself as idle (Stage 3 verified the
    // max gap between progress updates dropped from ~2000ms to <100ms
    // after this change). setTimeout(0) still yields to layout, paint,
    // and user input between chunks, so the tab stays interactive.
    const total = kids.length;
    showProgress(ctx, 0, total, "Rendering");
    let i = 0;

    function step() {
      const frag = document.createDocumentFragment();
      const batchEnd = Math.min(i + ARRAY_CHUNK_SIZE, total);
      for (; i < batchEnd; i++) frag.appendChild(createRowFor(kids[i], ctx));
      container.appendChild(frag);
      updateProgress(ctx, i, total);
      if (i < total) setTimeout(step, 0);
      else hideProgress(ctx);
    }
    setTimeout(step, 0);
  }

  function showProgress(ctx, done, total, label) {
    ctx.progressBar.style.display = "flex";
    ctx.progressFill.style.width = total ? `${Math.round(100 * done / total)}%` : "0%";
    ctx.progressLabel.textContent = `${label} ${done.toLocaleString()} / ${total.toLocaleString()}`;
  }

  function updateProgress(ctx, done, total) {
    if (ctx.progressBar.style.display === "none") return;
    const pct = total ? Math.round(100 * done / total) : 100;
    ctx.progressFill.style.width = pct + "%";
    ctx.progressLabel.textContent = `Rendering ${done.toLocaleString()} / ${total.toLocaleString()}`;
  }

  function hideProgress(ctx) {
    // Flash "Done — N items" briefly, then hide.
    ctx.progressFill.style.width = "100%";
    ctx.progressLabel.textContent = "Rendered.";
    setTimeout(() => { ctx.progressBar.style.display = "none"; }, 600);
  }

  function expandAll(ctx, root) {
    let count = 0, hitCap = false;
    function walk(n) {
      if (!isContainer(n)) return;
      if (count >= EXPAND_ALL_NODE_CAP) { hitCap = true; return; }
      count++;
      ensureExpanded(n, ctx);
      for (const c of n.children) walk(c);
    }
    walk(root);
    if (hitCap) flashBanner(ctx, `Expand-all stopped at ${EXPAND_ALL_NODE_CAP} containers to keep the tab responsive.`);
  }

  function collapseAll(ctx, root) {
    function walk(n) {
      if (!isContainer(n)) return;
      collapseNode(n);
      if (n.dom && n.dom.childrenRealised) for (const c of n.children) walk(c);
    }
    walk(root);
    ensureExpanded(root, ctx);
  }

  function flashBanner(ctx, msg) {
    const prev = ctx.banner.textContent;
    const prevDisplay = ctx.banner.style.display;
    ctx.banner.textContent = msg;
    ctx.banner.style.display = "block";
    setTimeout(() => { ctx.banner.textContent = prev; ctx.banner.style.display = prevDisplay; }, 4000);
  }

  // =====================================================================
  // search
  // =====================================================================

  function installSearch(ctx, root) {
    const bar = el("div");
    bar.className = "jv-search";
    bar.style.display = "none";

    const input = el("input");
    input.type = "search";
    input.placeholder = "Search keys + values…";
    input.className = "jv-search-input";

    const counter = el("span");
    counter.className = "jv-search-counter";

    const prev = makeButton("‹", "Previous match (Shift-Enter)");
    const next = makeButton("›", "Next match (Enter)");
    const close = makeButton("✕", "Close (Esc)");

    bar.append(input, counter, prev, next, close);
    ctx.header.appendChild(bar);
    ctx.searchBar = bar;
    ctx.searchInput = input;
    ctx.searchCounter = counter;

    input.addEventListener("input", () => runSearch(input.value, ctx, root));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")       { e.preventDefault(); navigateSearch(e.shiftKey ? -1 : 1, ctx); }
      else if (e.key === "Escape") { e.preventDefault(); closeSearch(ctx); }
    });
    prev.addEventListener("click", () => navigateSearch(-1, ctx));
    next.addEventListener("click", () => navigateSearch(+1, ctx));
    close.addEventListener("click", () => closeSearch(ctx));

    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        focusSearch(ctx);
      }
    });
  }

  function focusSearch(ctx) {
    ctx.searchBar.style.display = "";
    ctx.searchInput.focus();
    ctx.searchInput.select();
  }

  function closeSearch(ctx) {
    ctx.searchBar.style.display = "none";
    ctx.searchInput.value = "";
    clearSearchHighlights();
    ctx.searchCounter.textContent = "";
    searchState = null;
  }

  function runSearch(query, ctx, root) {
    clearSearchHighlights();
    if (!query) { ctx.searchCounter.textContent = ""; searchState = null; return; }
    const q = query.toLowerCase();
    const hits = [];
    function walk(n) {
      if (hits.length >= SEARCH_RESULT_CAP) return;
      if (n.key != null && String(n.key).toLowerCase().includes(q)) hits.push({ node: n, where: "key" });
      else if (!isContainer(n) && primitiveCopyValue(n).toLowerCase().includes(q)) hits.push({ node: n, where: "value" });
      if (n.children) for (const c of n.children) walk(c);
    }
    walk(root);
    searchState = { query: q, hits, index: 0 };
    updateCounter(ctx);
    if (hits.length) revealHit(ctx, hits[0]);
  }

  function navigateSearch(delta, ctx) {
    if (!searchState || !searchState.hits.length) return;
    searchState.index = (searchState.index + delta + searchState.hits.length) % searchState.hits.length;
    clearSearchHighlights();
    revealHit(ctx, searchState.hits[searchState.index]);
    updateCounter(ctx);
  }

  function updateCounter(ctx) {
    if (!searchState) { ctx.searchCounter.textContent = ""; return; }
    const total = searchState.hits.length;
    const cap = total >= SEARCH_RESULT_CAP ? "+" : "";
    ctx.searchCounter.textContent = total
      ? `${searchState.index + 1} / ${total}${cap}`
      : "no matches";
  }

  function revealHit(ctx, hit) {
    const chain = [];
    let cur = hit.node.parent;
    while (cur) { chain.push(cur); cur = cur.parent; }
    for (let i = chain.length - 1; i >= 0; i--) ensureExpanded(chain[i], ctx);
    ensureNodeRealised(hit.node, ctx);
    if (!hit.node.dom || !hit.node.dom.row) return;
    highlightMatch(hit);
    hit.node.dom.row.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function ensureNodeRealised(node, ctx) {
    let p = node.parent;
    while (p) {
      if (p.dom && !p.dom.childrenRealised) realiseChildren(p, ctx);
      p = p.parent;
    }
  }

  function highlightMatch(hit) {
    const row = hit.node.dom && hit.node.dom.row;
    if (!row) return;
    row.classList.add("jv-hit-current");
    const target = hit.where === "key"
      ? row.querySelector(".jv-key")
      : row.querySelector(".jv-string, .jv-number, .jv-boolean, .jv-null");
    if (target) target.classList.add("jv-hit-current-text");
  }

  function clearSearchHighlights() {
    document.querySelectorAll(".jv-hit-current, .jv-hit-current-text")
      .forEach((el) => el.classList.remove("jv-hit-current", "jv-hit-current-text"));
  }

  // =====================================================================
  // context menu
  // =====================================================================

  function installContextMenu() {
    document.addEventListener("click", () => { if (openMenu) { openMenu.remove(); openMenu = null; } });
    document.addEventListener("scroll", () => { if (openMenu) { openMenu.remove(); openMenu = null; } }, true);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && openMenu) { openMenu.remove(); openMenu = null; }
    });
  }

  function openContextMenu(e, node) {
    e.preventDefault();
    e.stopPropagation();
    if (openMenu) openMenu.remove();

    const menu = el("div");
    menu.className = "jv-ctx";

    const items = [];
    if (!isContainer(node)) {
      items.push(["Copy value", () => copyToClipboard(primitiveCopyValue(node))]);
    }
    items.push(["Copy as JSON", () => copyToClipboard(JSON.stringify(nodeToJsonValue(node), null, 2))]);
    items.push(["Copy path", () => copyToClipboard(nodePath(node))]);

    for (const [label, fn] of items) {
      const it = el("div");
      it.className = "jv-ctx-item";
      it.textContent = label;
      it.addEventListener("click", () => { fn(); menu.remove(); openMenu = null; });
      menu.appendChild(it);
    }

    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    let x = e.clientX, y = e.clientY;
    if (x + r.width  > window.innerWidth)  x = window.innerWidth  - r.width  - 4;
    if (y + r.height > window.innerHeight) y = window.innerHeight - r.height - 4;
    menu.style.left = x + "px";
    menu.style.top  = y + "px";
    openMenu = menu;
  }

  // =====================================================================
  // clipboard + download
  // =====================================================================

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = el("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.left = "-1000px";
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand("copy"); } finally { ta.remove(); }
    }
  }

  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // =====================================================================
  // shared message + parse error UI
  // =====================================================================

  function makeParseError(text, err, format) {
    const wrap = el("div");
    wrap.className = "jv-error";

    const title = el("div");
    title.className = "jv-error-title";
    title.textContent = `Invalid ${format || "input"}`;
    wrap.appendChild(title);

    const msg = el("div");
    msg.className = "jv-error-msg";
    msg.textContent = err && err.message ? err.message : String(err);
    wrap.appendChild(msg);

    const pos = extractPosition(err && err.message, text);
    if (pos) {
      const loc = el("div");
      loc.className = "jv-error-loc";
      loc.textContent = `Line ${pos.line}, column ${pos.col} (offset ${pos.offset}).`;
      wrap.appendChild(loc);

      const snippet = buildSnippet(text, pos);
      if (snippet) wrap.appendChild(snippet);
    }
    return wrap;
  }

  function extractPosition(message, text) {
    if (!message) return null;
    const lineColMatch = /line\s+(\d+)\s*,?\s+column\s+(\d+)/i.exec(message);
    const posMatch = /position\s+(\d+)/i.exec(message);
    const yamlMatch = /\((\d+):(\d+)\)/.exec(message);
    if (lineColMatch) {
      const line = parseInt(lineColMatch[1], 10);
      const col  = parseInt(lineColMatch[2], 10);
      const offset = posMatch ? parseInt(posMatch[1], 10) : offsetFromLineCol(text, line, col);
      return { line, col, offset };
    }
    if (yamlMatch) {
      const line = parseInt(yamlMatch[1], 10);
      const col  = parseInt(yamlMatch[2], 10);
      return { line, col, offset: offsetFromLineCol(text, line, col) };
    }
    if (posMatch) {
      const offset = parseInt(posMatch[1], 10);
      return { ...lineColFromOffset(text, offset), offset };
    }
    return null;
  }

  function lineColFromOffset(text, offset) {
    let line = 1, col = 1;
    const stop = Math.min(offset, text.length);
    for (let i = 0; i < stop; i++) {
      if (text.charCodeAt(i) === 10) { line++; col = 1; } else { col++; }
    }
    return { line, col };
  }

  function offsetFromLineCol(text, line, col) {
    let l = 1, c = 1;
    for (let i = 0; i < text.length; i++) {
      if (l === line && c === col) return i;
      if (text.charCodeAt(i) === 10) { l++; c = 1; } else { c++; }
    }
    return text.length;
  }

  function buildSnippet(text, pos) {
    const lines = text.split("\n");
    const idx = pos.line - 1;
    if (idx < 0 || idx >= lines.length) return null;
    const before = lines[idx - 1];
    const errLine = lines[idx];
    const after = lines[idx + 1];

    const wrap = el("pre");
    wrap.className = "jv-snippet";

    const addLine = (n, content, isError) => {
      if (content == null) return;
      const row = el("div");
      row.className = isError ? "jv-snippet-row jv-snippet-row-error" : "jv-snippet-row";
      const num = el("span");
      num.className = "jv-snippet-lineno";
      num.textContent = String(n).padStart(4, " ") + " | ";
      const code = el("span");
      code.textContent = content;
      row.appendChild(num);
      row.appendChild(code);
      wrap.appendChild(row);
      if (isError) {
        const caret = el("div");
        caret.className = "jv-snippet-row jv-snippet-caret";
        caret.textContent = "     | " + " ".repeat(Math.max(0, pos.col - 1)) + "^";
        wrap.appendChild(caret);
      }
    };

    addLine(pos.line - 1, before, false);
    addLine(pos.line, errLine, true);
    addLine(pos.line + 1, after, false);
    return wrap;
  }
})();
