---
title: JSON Viewer
description: Privacy-first JSON, YAML, and XML viewer for Chrome
---

# JSON Viewer

**Privacy-first JSON, YAML, and XML viewer for Chrome.**

A collapsible, color-coded tree view for any structured-data page or local file. Open source, MIT-licensed, zero network calls. Click the toolbar icon — nothing runs until you do.

---

## Why this exists

The most popular JSON viewer for Chrome went closed-source in early 2026 and began silently injecting donation popups and tracking calls onto unrelated pages. This extension is a clean-slate replacement built on the opposite principles: nothing hidden, nothing phoned home, nothing stored beyond a single local preference for your theme.

---

## Install

- **Chrome Web Store** — _coming soon_.
- **Load unpacked (for developers and early testers)** — see the [README on GitHub](https://github.com/connorleebo/json-viewer-extension#install-load-unpacked) for step-by-step instructions.

---

## The trust pitch

- **Zero network calls.** The extension does not contact any server we control. We have no analytics, no telemetry, no "auto-update check" pinging home.
- **Three permissions, each minimal.** `activeTab` (only when you click the icon), `scripting` (to inject the viewer), `storage` (only for your light/dark theme preference). No `<all_urls>`, no host permissions, no `tabs`, no `cookies`, no `webRequest`.
- **Click-to-activate.** Nothing runs until you click the toolbar icon. The extension cannot read pages you don't gesture on.
- **Open source under MIT.** Every line is in the repo, unminified, no obfuscation, no build step. Audit it yourself.
- **Do-no-harm guarantee.** If a page isn't recognisably JSON, YAML, or XML, the extension never modifies it — a small toast explains why, and the original view is preserved exactly as Chrome rendered it.

---

## Links

- 📖 [Privacy Policy](./privacy-policy)
- 🐙 [GitHub repository](https://github.com/connorleebo/json-viewer-extension)
- 🛒 Chrome Web Store — _coming soon_
- 🐞 [Report an issue](https://github.com/connorleebo/json-viewer-extension/issues)

---

<sub>© 2026 connorleebo · MIT Licensed · [github.com/connorleebo/json-viewer-extension](https://github.com/connorleebo/json-viewer-extension)</sub>
