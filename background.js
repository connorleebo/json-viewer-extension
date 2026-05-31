// Service worker for JSON Viewer (Stage 2).
//
// On toolbar click, inject:
//   1. viewer.css        — theme + tree styles
//   2. vendor/js-yaml.js — vendored YAML parser (MIT, unmodified)
//   3. viewer.js         — main viewer; uses window.jsyaml + native DOMParser
//
// activeTab grants temporary host access on the click gesture, so no
// host_permissions are declared in the manifest.

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || typeof tab.id !== "number") return;

  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ["viewer.css"],
  });

  // js-yaml registers itself on `window.jsyaml` when loaded in a browser.
  // Both scripts run in the extension's per-frame ISOLATED world (default),
  // so viewer.js can see window.jsyaml without exposing anything to page JS.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["vendor/js-yaml.js"],
  });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["viewer.js"],
  });
});
