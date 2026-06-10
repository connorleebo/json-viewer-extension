# JSON Viewer

**A privacy-first JSON, YAML, and XML viewer for Chrome. Open source, MIT, zero network calls.**

---

## What it does

Click the toolbar icon on any page that's serving structured data — JSON, YAML, or XML — and the raw text is rendered as a collapsible, color-coded tree. Search across keys and values, copy any node or its JSONPath, switch between raw and parsed views, sort object keys alphabetically, and pretty-print files up to ~10 MB without freezing the tab. Dark and light themes, auto-following your OS preference.

It works on `application/json` HTTP responses, on Chrome's built-in XML viewer (local `.xml` files), on JSONP-wrapped responses (the wrapper is detected and stripped), and on any plain-text page whose contents are recognisably one of the three supported formats.

## Why this exists

As concerns around privacy, tracking, and unexpected browser-extension behavior continue to grow across the developer community, many of us have started looking more carefully at the tools we install. This extension was built around a simple idea: a structured-data viewer should view structured data — and nothing else.

## The trust pitch

- **Zero remote network calls.** The extension never fetches anything from a remote server, never sends telemetry, never phones home. The only `fetch` it ever makes is a *same-origin* read of the active tab's own URL when Chrome's built-in XML viewer needs the raw source — and that path is opt-in by URL pattern only.
- **Three permissions, each minimal.** `activeTab` (temporary access to only the current tab, only when you click the toolbar icon), `scripting` (so we can inject the viewer), and `storage` (used for exactly one preference — your theme choice — saved to `chrome.storage.local`, never `sync`). **No `<all_urls>`, no `tabs`, no `cookies`, no `webRequest`, no `host_permissions`.**
- **Click-to-activate.** Nothing runs until you click the toolbar icon. The extension cannot read any page you don't gesture on.
- **Open source under MIT.** Every line is in this repo, unminified, no obfuscation, no build step. Audit it.
- **Do-no-harm guarantee.** If the page isn't recognisably JSON / YAML / XML, the extension never modifies the page — a small toast in the corner explains why, and the original view stays exactly as Chrome rendered it. If parsing or rendering somehow fails partway through, the original DOM is restored from a snapshot. The extension is structurally incapable of leaving you with a blank page.

## Features

- Collapsible tree with element counts (`{ 12 keys }`, `[ 47 items ]`)
- Distinct colors for keys, strings, numbers, booleans, and `null`
- Built-in search with Cmd/Ctrl-F, `n / N` counter, Enter / Shift-Enter to step, auto-expand to reveal hits inside collapsed subtrees
- Right-click any node: Copy value, Copy as JSON, Copy path (`$.users[3].email` JSONPath)
- Toolbar: Copy formatted, Download as `.json` / `.yaml` / `.xml`, Expand all, Collapse all, Raw / Parsed toggle
- Three-state Sort dropdown: Original / A→Z / Z→A (renders only — never mutates the underlying data)
- Dark + light themes, auto-following your OS preference, with optional persisted manual override
- JSONP detection — recognises `var name = …;`, `callback(…)`, `/**/cb(…)` wrappers and strips them
- Large-file lazy rendering with a continuous progress indicator; tested at ~10 MB
- Parse errors show line, column, and a `^` caret pointing at the offending character

## Install

### Install from the Chrome Web Store (recommended)

https://chromewebstore.google.com/detail/jljkcfhlbilhnhidghiepnbamhdjnpjf

One click, auto-updates, recommended for most users.

### Run from source (for developers)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** ON (top-right).
4. Click **Load unpacked** and select the repo folder.
5. (For testing local `.json` / `.xml` files) On the extension's card, click **Details**, then enable **"Allow access to file URLs"**.
6. Click the puzzle-piece icon in the toolbar and pin **JSON Viewer** for easy access.

The sample fixtures in `test-data/` cover the happy paths plus parse-error scenarios. See [`test-data/INSTRUCTIONS-local-files.md`](./test-data/INSTRUCTIONS-local-files.md) for Chrome's per-format behaviour and the workaround for local YAML files (Chrome downloads them rather than displaying them).

## Privacy

> **We collect nothing. We make zero remote network calls.** The only data stored is your light/dark theme preference, saved to `chrome.storage.local` (this device only — never synced across devices). You can disable storage or clear the saved preference any time from the in-viewer Settings menu.

If you're auditing: the entire request surface of this extension is `chrome.scripting.insertCSS` + `chrome.scripting.executeScript` (to inject our own bundled files into the active tab when you click the icon) and `chrome.storage.local.{get, set, remove}` (one key). There is no `fetch`, `XMLHttpRequest`, or analytics SDK in the source. The single `fetch(window.location.href)` in `viewer.js` is the same-origin read mentioned above, guarded behind a `.xml` URL / content-type check.

## License

MIT — see [LICENSE](./LICENSE). The vendored YAML parser at `vendor/js-yaml.js` is also MIT; its license is preserved at `vendor/js-yaml.LICENSE`.
