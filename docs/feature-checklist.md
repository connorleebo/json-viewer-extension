# MVP Feature Checklist — JSON Viewer Chrome Extension

**Derived from:** `recon.md`. Ship this list and you have a credible v1 that beats JSONView on its known weaknesses without crossing the trust line.

**Hard rules for the whole build (do not break these):**
- **MV3 only.** No MV2 fallback.
- **Permissions:** `activeTab` + `scripting` only. **No** `<all_urls>`, **no** `tabs`, **no** `cookies`, **no** `storage` unless v1 truly needs it.
- **Dynamic injection** via `chrome.scripting.executeScript` only after the service worker confirms `Content-Type` is `application/json|yaml|xml`. Zero impact on non-JSON pages.
- **Zero external network calls.** No analytics, no telemetry, no auto-update check, no version-ping. Verifiable.
- **Open source MIT** from day one. GitHub link in the Chrome listing description.
- **No obfuscation.** Build output must be human-readable or accompanied by source maps.
- **Privacy disclosure section on the Chrome listing 100% empty** under "User activity," "Website content," "Personal communications."
- **Privacy policy** hosted on GitHub Pages, plain English, "this extension collects nothing."
- **Founder name + GitHub identity** visible.
- **No donation popups. No affiliate links. No tip jar inside the extension** (a GitHub Sponsors link in the README is fine).

---

## v1 (ship in 1-2 weeks) — MUST-HAVE for a credible launch

### Core rendering
- [ ] Auto-detect any URL returning `application/json` (and `application/*+json`) and pretty-render the response
- [ ] Collapsible tree with element counts at each node (e.g. `{...} 12 keys`, `[...] 47 items`)
- [ ] Syntax highlighting (keys, strings, numbers, booleans, null, special)
- [ ] Light / dark theme (auto-respect OS / browser preference)
- [ ] Raw / Parsed toggle button (one-click switch back to original text)
- [ ] Validate input; on parse error show the line + column + a short error message

### Navigation + search
- [ ] In-document search (Cmd/Ctrl-F integration *or* a built-in search box) with match highlighting and "n of N" counter
- [ ] Collapse all / expand all
- [ ] Click a key to fold/unfold its subtree
- [ ] Keyboard navigation: arrow keys to traverse, Enter to expand/collapse

### Copy / export
- [ ] Right-click context: "Copy node value," "Copy node as JSON," "Copy path to node"
- [ ] "Copy formatted JSON" button (top right)
- [ ] "Download as .json" button

### Large-file handling (your wedge vs JSONView)
- [ ] Handle files up to **10MB without freezing** the tab (this is the explicit JSONView wedge)
- [ ] Visible indication if file is large (banner: "Large file — limiting initial render")
- [ ] Optional lazy-render of deep subtrees beyond a threshold

### Trust + listing
- [ ] Public GitHub repo with MIT license + README explaining "no network calls" + reproducible build steps
- [ ] CI badge on README showing builds match releases
- [ ] Chrome listing description references the Give Freely scandal explicitly (so that search surfaces you)
- [ ] Chrome listing has the privacy disclosure section fully empty
- [ ] Founder name + link to GitHub on listing
- [ ] Plain-English privacy policy at e.g. `username.github.io/json-ext/privacy`

---

## v1.1 (next 2-4 weeks after launch) — STRONG NICE-TO-HAVE

### Format expansion (the YAML/XML differentiator)
- [ ] Detect and render `application/yaml`, `text/yaml`, `application/xml`, `text/xml`
- [ ] Format-mode indicator at the top
- [ ] Cross-format copy (e.g. "Copy as YAML" from a JSON tree)

### Power-user features
- [ ] Copy JSONPath for any node (e.g. `$.users[3].profile.email`)
- [ ] Key sorting toggle (alphabetical / type / original order)
- [ ] Paste-from-clipboard flow: open the popup, paste JSON, see it rendered (no URL needed)
- [ ] Inline error preview when typing/pasting invalid JSON

---

## v2 — PAID-TIER WEDGES ($29 lifetime / $5 mo "Pro")

These are the features power users will pay for. Free users keep everything in v1+v1.1.

- [ ] **Streaming parser for huge files** (50MB+) without freezing the tab
- [ ] **JSON diff** — paste two documents, see structural / value diff side-by-side
- [ ] **JSON Schema inference** from a sample document
- [ ] **Multi-document tabs** (work with 4-5 JSONs side by side)
- [ ] **Local snippet library** (IndexedDB only — no cloud, no sync, named saves)
- [ ] **DevTools panel integration** (panel inside Chrome DevTools)
- [ ] **JQ / jsonpath query bar** — type a query, see filtered tree
- [ ] **Pro license activation** via a local-only license key (no server check; cryptographic verify)

---

## EXPLICITLY NOT BUILDING — banned-from-the-roadmap list

- ❌ Cloud sync, login, accounts
- ❌ "Share JSON link" features that require any server
- ❌ Analytics, telemetry, usage tracking
- ❌ Auto-update version pings
- ❌ Donation popups (the literal thing that killed the incumbent)
- ❌ Affiliate links anywhere
- ❌ Optional permissions "we might use later"
- ❌ Notifications permission
- ❌ Tab management / cross-tab features (would require `tabs` permission)
- ❌ Anything requiring `<all_urls>`
- ❌ Obfuscated build output

---

## Pre-submission checklist for the Chrome Web Store

- [ ] Manifest permissions: only `activeTab` + `scripting` (verify in `manifest.json`)
- [ ] No host_permissions in manifest (use dynamic injection)
- [ ] Privacy policy URL set in listing
- [ ] Privacy disclosure section in listing fully empty (no boxes checked)
- [ ] Listing description includes: "Open source, MIT, GitHub link" + scandal reference + "No tracking, no network calls"
- [ ] 5+ screenshots: light mode, dark mode, large-file, search, raw/parsed toggle
- [ ] Promo tile (440x280) clean and trustworthy (no clip-art, no flames, no "BEST!!" copy)
- [ ] Single-purpose statement: "Pretty-prints JSON responses in the browser"
- [ ] Source code in submitted package is unminified OR source maps included
- [ ] README in the public repo has reproducible-build instructions
- [ ] CI workflow that publishes a release artifact matching the Chrome submission

Target review timeline if all the above are clean: **24-72 hours automated approval.** With excessive permissions: 2-3 weeks manual review (as of April 2026).

---

## Out-of-scope decisions (post-launch, defer)

- Pricing page UI — figure out after 50+ users
- Firefox / Edge port — only after the Chrome listing finds traction
- Paid tier launch — wait until 10K+ free users to flip the switch (reviews + ranking depend on free install velocity early)
