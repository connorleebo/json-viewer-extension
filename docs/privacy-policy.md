---
title: Privacy Policy
description: JSON Viewer · Open Source · No Tracking
---

# Privacy Policy

**JSON Viewer · Open Source · No Tracking**

**Effective date:** May 31, 2026

---

## The short version

We don't collect anything. We don't send anything anywhere. We don't have a server. The extension stores one small preference on your own computer (your light or dark theme choice) and nothing else.

---

## What we collect over the network

**Nothing.**

This extension never makes a network request to a server we control. There is no server. We don't have an analytics tool. We don't track installs. We don't track which pages you visit, what JSON you view, or how you use the extension. The extension is incapable of phoning home because the code does not contain a `fetch`, `XMLHttpRequest`, or any other request to an external host. You can verify this yourself by reading the source on GitHub (link below).

The only `fetch` call in the entire codebase is to **the active tab's own URL** — used in one specific case: when Chrome shows you a local XML file and the extension needs to read the raw source. That's a same-origin read of the page you're already on. It is not a request to us or to any third party.

---

## What we store on your device

**One thing:** your light/dark theme preference (the word `"light"` or `"dark"`).

It's stored in `chrome.storage.local`, which lives on your computer. It is **not** stored in `chrome.storage.sync`, so it is **never copied to other devices** and **never sent to Google servers**. It never leaves your machine.

You can disable theme storage at any time:

1. Click the extension's toolbar icon on any page where the viewer is active.
2. Click the ⚙ Settings button.
3. Uncheck **"Remember my theme preference"** — and any stored value is cleared immediately.
4. Or click **"Forget my theme preference"** to clear it but keep the setting available for next time.

---

## Permissions explained

The extension requests three Chrome permissions. Each one does exactly what it sounds like:

- **`activeTab`** — gives the extension temporary, one-time access to the *current* tab only, and **only at the exact moment you click the toolbar icon**. The extension cannot read any tab you don't click on, and the access expires as soon as you navigate away.
- **`scripting`** — lets the extension inject the viewer's CSS and JavaScript into the tab you just clicked on. Without this, there would be no way to render the tree.
- **`storage`** — used only to save your light/dark theme preference, as described above. Nothing else is ever written.

The extension does **not** request: `<all_urls>` or any host permissions, `tabs`, `cookies`, `webRequest`, `notifications`, `downloads`, or any other permission that could read your browsing activity or modify other websites.

---

## Open source — audit the code yourself

The entire extension is open source under the MIT license. Every line is in the public repository, unminified, with no obfuscation and no build step. If you want to verify any of the claims on this page, you can.

**Repository:** [github.com/connorleebo/json-viewer-extension](https://github.com/connorleebo/json-viewer-extension)

The two files that matter most for privacy review are:

- `viewer.js` — the main viewer logic. Search for `fetch`, `XMLHttpRequest`, or `chrome.storage` to see every place the extension talks to anything.
- `manifest.json` — the complete permissions list (`activeTab` + `scripting` + `storage`, nothing else).

---

## Changes to this policy

If anything ever changes — for example, if a future version of the extension requests a new permission or stores additional data — this page will be updated and the change will be noted in the [release notes](https://github.com/connorleebo/json-viewer-extension/releases) on GitHub. Material changes will keep an old version of the policy accessible in the repo's git history.

---

## Contact

For privacy questions, bug reports, or to flag a concern, please open an issue:

[github.com/connorleebo/json-viewer-extension/issues](https://github.com/connorleebo/json-viewer-extension/issues)

We deliberately don't list an email address — issues are public, traceable, and give other users visibility into anything that's been asked and answered.
