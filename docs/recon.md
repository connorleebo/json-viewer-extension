# JSON Viewer Extension — Competitive Recon

**Date:** 2026-05-28
**Purpose:** Decide whether to build, and if so, position cleanly.
**Verdict (one paragraph at bottom).**

---

## 1. The incumbent scandal — confirmed

**The compromised extension:** JSON Formatter by Callum Locke. Extension ID `bcjindcccaagfpapjjmafapmmgkkhgoa`. ~2M users at peak.

**What happened:** The extension transitioned from open-source to **closed-source** and began silently injecting "Give Freely" donation popups onto checkout pages of unrelated sites — without warning or consent. It also performs **geolocation tracking via MaxMind GeoIP2** (with a hardcoded API key) and makes external calls to `api.givefreely.com` and `events.givefreely.com` for user behavior tracking. The injected DOM element is `give-freely-root-bcjindcccaagfpapjjmafapmmgkkhgoa`. Internal code uses suspicious variables like `GF_SHOULD_STAND_DOWN`, suggesting a kill-switch to evade detection — i.e. consciously adversarial behavior, not a misclick. ([Pixels and Pulse writeup](https://thepixelspulse.com/posts/json-formatter-chrome-plugin-adware-incident/); [DEV: "JSON Formatter turns closed-source, introduces intrusive donation tactics"](https://dev.to/pavkode/json-formatter-extension-turns-closed-source-introduces-intrusive-donation-tactics-and-tracking-kf8))

**Timing:** Date varies across sources between January and April 2026. HN front page coverage at [HN thread](https://news.ycombinator.com/item?id=47721946). Mainstream-press classification as "unsafe" was solidified in April 2026.

**Current state (as of recon date):** **Still compromised. No apology. No revert.** The extension is still in the Chrome Web Store; security writeups uniformly recommend uninstall. Users are actively shopping for replacements.

**Angry-dev language to mine for listing keywords:**
- "betrayed its users" (DEV.to article title)
- "thought their browser was compromised"
- "without warning, without consent"
- "adware injection"
- "closed-source" / "closed source"
- "donation popup" / "Give Freely popup"
- "hundreds of 1-star reviews"

Useful keyword cluster for your Chrome listing description / SEO:
> *no Give Freely · no tracking · no ads · no donation popups · open source · MV3 · privacy first · zero network calls · audit-able · no analytics · no telemetry*

---

## 2. The competitive field

The race for "clean replacement" is **active and crowded**. The picture as of May 2026:

| Extension | Status | Users | Rating | Open source? | MV3? | Key notes |
|---|---|---|---|---|---|---|
| **JSON Formatter** (Callum Locke, the compromised one) | ⚠️ compromised | ~2M (but migrating away) | tanking, 1-star wave | now closed-source | yes | Incumbent that broke itself. Still in store; security guides flag as unsafe. ([listing](https://chromewebstore.google.com/detail/json-formatter/bcjindcccaagfpapjjmafapmmgkkhgoa)) |
| **JSONView** (Ben Hollis, `bhollis/jsonview`) | ✅ active, real incumbent now | **~900K+** | 4.0 | yes ([GitHub](https://github.com/bhollis/jsonview)) | yes | One of oldest JSON extensions. Renders any JSON URL as collapsible tree. **Weakness: struggles with files >5MB, no advanced search.** ([jsonview.com](https://jsonview.com/)) |
| **JSON Viewer Pro** (`eifflpmocdbdmepbjaopkkhbfmdgijcc`) | ✅ active | not surfaced precisely | **4.7** | unclear | yes | "Completely free with no advertisements." Marketed as feature-rich alternative. |
| **JSON Viewer** (`aimiinbnnkboelefkjlenlgimcabobli`) | ✅ active | not surfaced | 4.5 | unclear | yes | Generic alternative; specific differentiator not surfaced. |
| **theluckystrike/json-formatter-chrome-extension** | 🆕 post-scandal entrant | small | new | **yes, MIT** ([GitHub](https://github.com/theluckystrike/json-formatter-chrome-extension)) | yes | Updated March 2026. Open source. Tree view, syntax highlight, validate, beautify. Plays directly to the post-scandal niche. |
| **JSONVault Pro** (Valentin Conan) | 🆕 post-scandal entrant | small/new | new | mentioned | yes | Dynamic injection via `chrome.scripting.executeScript` after Content-Type check (zero impact on non-JSON pages — clever). ([DEV writeup](https://dev.to/valentinconan/i-built-a-json-viewer-because-the-most-popular-one-betrayed-its-users-5e6e)) |
| **JSON Viewer** (`tulios`) | 💀 abandoned | (was popular) | irrelevant | yes | no | Last updated Dec 2020. Not MV3-compatible. Was the high-feature alternative; users now stranded. |

**How crowded is the "clean replacement" race?** Moderately. JSONView is the real winner-by-default — it already has 900K users, is open source, MV3-compliant, and was already trusted before the scandal. Two named new entrants (theluckystrike + JSONVault Pro) have shipped in March 2026 explicitly targeting the post-scandal niche. There are also several lower-visibility forks on GitHub.

**Is there still room?** Yes — but the window is narrow (~2-3 months before 2-3 winners consolidate). The wedge against JSONView (the *real* incumbent now) is:
1. **Large-file performance (>5MB)** — JSONView's documented weakness
2. **Search inside JSON** — JSONView lacks advanced search
3. **JSON + YAML + XML in one** — JSONView is JSON only
4. **Explicit anti-scandal positioning** — open source from day one, public audit page

You are NOT racing the compromised incumbent. You are racing JSONView's weaknesses and the 2 post-scandal new entrants.

---

## 3. The feature bar — what the MVP must ship with

Synthesized from the DEV.to "JSONVault Pro" article (the most concrete reference spec in the field) and JSONView's documented limitations.

### MUST-HAVE — without these, listing isn't credible

- **Auto-detect JSON URL** and pretty-render in tab (the core use case — paste JSON URL, see tree)
- **Collapsible tree** with key counts at each node (`{...} 12 items`)
- **Syntax highlighting** with theme support (dark/light mode at minimum)
- **Raw / Parsed toggle** — instantly switch to see original text
- **In-document search** (Cmd/Ctrl-F should work, or built-in search box)
- **Copy node value / copy as JSON** (right-click context)
- **Large file handling — at least 10MB without freezing** (JSONView dies at 5MB; this is your wedge)
- **Validate + show parse errors clearly** with line/column markers
- **MV3-compliant manifest**
- **Minimal permissions only** (see §5 — `activeTab` + dynamic injection, no `<all_urls>`)
- **Public GitHub repo** linked from the Chrome listing
- **Privacy disclosure on the listing**: nothing under "User activity," "Website content," "Personal communications"
- **No external network calls** (declared and verifiable)

### NICE-TO-HAVE — potential paid-tier or v2

- **JSONPath copy** (e.g. `$.foo[0].bar`) — DEV.to-cited table-stakes for power users
- **YAML + XML support** — JSON-Formatter-killer differentiator
- **Key sorting** (alphabetical / type)
- **DevTools panel integration** (panel inside Chrome DevTools)
- **Diff two JSON documents**
- **Schema inference** (generate a JSON Schema from a sample)
- **Format and copy multi-line minified JSON from clipboard** (paste-flow)
- **Bookmark / save snippets locally** (no cloud, IndexedDB)
- **Streaming parser for huge files** (50MB+) — likely the real paid wedge

### What NOT to ship in v1

- Any cloud sync or login
- Any "share JSON link" feature (requires server)
- Any analytics or telemetry (kills trust)
- Any donation popup or affiliate integration (literally the thing that killed the incumbent)
- Optional permissions you "might use later"

---

## 4. Trust signals — what makes devs install a no-name new extension

From the open-source-extensions trust-signal coverage and post-Honey / post-JSON-Formatter sentiment.

In rough priority order:

1. **Public GitHub repo, OSI-approved license** (MIT or Apache-2.0 are safest) — linked from the Chrome listing description, not hidden in About.
2. **Recent commits visible on the repo** — repo with no commits in 2 years is itself a risk signal. Devs check.
3. **Minimal permissions, declared on the listing** — ideally just `activeTab`. Each extra permission cuts conversion ~10-15% (research cited: 70% walk away when permissions feel excessive).
4. **Privacy disclosure section on the Chrome listing fully empty** — every checkbox under "User activity," "Website content," "Personal communications" left unchecked. This is verifiable by the user and is a strong claim.
5. **No external network calls** stated explicitly in the listing description + privacy policy + README. Bonus: a network panel screenshot showing zero requests.
6. **Plain English privacy policy** hosted on GitHub Pages or your own domain (not a generic template).
7. **Service worker source visible / unminified** in the published extension package — devs sometimes unzip the .crx and look. Minified or obfuscated code is a 1-star magnet *and* a Chrome rejection reason.
8. **CI badge** showing automated builds match the GitHub source.
9. **Reproducible build instructions** in the README ("clone, npm install, npm run build, hash matches release").
10. **Founder identity / name** on the listing and GitHub — anonymous post-scandal entrants get less trust than a named developer with any public history.
11. **A clean, screenshot-rich Chrome Web Store listing** — bad listings are also a rejection reason and signal sketchiness.
12. **Listing description explicitly references the scandal**: "Built in direct response to the Give Freely incident. Open source. Zero network calls. Audit the code." Mirrors what your audience is searching for.

---

## 5. The permissions trap — minimum viable + CWS gotchas

### What a JSON viewer *actually* needs

The right combo for a privacy-first JSON viewer:

- **`activeTab`** — gives temporary access to the current tab *only when the user invokes the extension*. **No install-time warning.** This is the single most important permission choice you make.
- **`scripting`** — required for `chrome.scripting.executeScript()` so you can dynamically inject after a Content-Type check.
- **Host permissions: NONE static. Use dynamic injection.** The JSONVault Pro approach (referenced in [DEV writeup](https://dev.to/valentinconan/i-built-a-json-viewer-because-the-most-popular-one-betrayed-its-users-5e6e)) is correct: service worker uses `chrome.webRequest` / `onResponseStarted` *or* `declarativeNetRequest` to detect `Content-Type: application/json|yaml|xml`, then injects only on those pages. Zero impact on non-JSON pages, no `<all_urls>` permission warning at install.
- **Optional: `storage`** — only if you offer "remember last theme" or "save snippets." If neither, skip it.

### Permissions to AVOID

- **`<all_urls>` host permissions** — triggers "read your browsing history" warning. ~70% of users walk away.
- **`tabs`** — frequently confused with `activeTab`. `tabs` triggers "read your browsing history" warning. Do NOT request unless you need cross-tab queries.
- **`webRequest` with blocking** — heavy review scrutiny; use `declarativeNetRequest` instead.
- **`cookies`** — JSON viewer doesn't need this. Requesting it = automatic 1-star wave.
- **Any permission "you might use later"** — Chrome policy explicitly forbids future-proofing permissions and is a rejection reason.

### CWS review process — what to expect

- **Minimum-permission extensions can get automated approval in ~24 hours.** Excessive permissions kick into manual review which now runs **2-3 weeks** as of April 2026 (submissions are backed up). ([Chrome dev docs](https://developer.chrome.com/docs/webstore/review-process))
- **Top 5 rejection reasons:**
  1. Excessive permissions (THE most common — directly relevant to JSON viewers)
  2. Incomplete or misleading store listing
  3. Missing privacy policy (you need one even if you collect nothing)
  4. Obfuscated code in submitted package
  5. Broken functionality
- **Privacy policy is mandatory.** "I collect nothing" is fine; "no privacy policy" is rejection. Host it on GitHub Pages.
- **Single-purpose policy:** your extension must serve one narrow purpose. "JSON viewer + bookmark + ad blocker" combos get rejected. Keep v1 single-purpose.
- **Code must not be obfuscated.** Webpack/esbuild minification is allowed if source maps are submitted or the code is readable. Heavy obfuscation (e.g. javascript-obfuscator) = automatic rejection.
- **Cross-listing your GitHub repo helps reviewers** verify the published code matches the open source.

---

## 6. Positioning + pricing recommendation

### Positioning angle

You are NOT positioning against the compromised JSON Formatter — that battle is already won by anyone open-source. You are positioning against **JSONView** (the de-facto winner, 900K users, 4.0 stars, but limited) and the **2-3 post-scandal entrants** (theluckystrike, JSONVault Pro).

The clean positioning:

> **"The JSON viewer for devs who got burned. Open source. Zero network calls. Handles 50MB files. No Give Freely."**

Differentiators in priority order:
1. **Trust** — open source, MIT, GitHub link, zero permissions theatre (the implicit "we are not Callum Locke")
2. **Large-file performance** — JSONView's known weakness, your concrete win
3. **JSON + YAML + XML in one** — clear feature differentiator vs JSONView
4. **DevTools panel** integration — power-user win

The hook in the title field of the Chrome listing: e.g. `"JSON Viewer · Open Source · No Tracking"` or `"JSON & YAML Viewer · Audit-able, Zero Network"`. The keywords in your description should explicitly include "Give Freely" once (so search for that surfaces you).

### Pricing

Be honest: **developers are extremely payment-resistant for browser extensions.** This is the audience most likely to inspect your code rather than pay for it. Most "JSON viewer Pro" extensions in the field are free with no clear paid tier. The exception is dev tools that solve a sharp, narrow paid problem (Wappalyzer at $85K MRR is the upper-bound proof that one solo dev tool *can* sustain a person — but Wappalyzer attacks a B2B-ops pain, not a "view JSON" pain).

**Realistic split:**

- **Free tier** — everything in §3 MUST-HAVE list, plus YAML/XML. No artificial limits. This is what 90%+ of users will use forever.
- **Pro tier ($29 one-time OR $5/mo)** — large-file streaming (50MB+), JSON diff, schema inference, multi-document tabs, JSONPath copy, named-snippet local library. Target the 1-3% of dev power users.
- **No subscription pressure** — one-time license is preferred for this audience (they hate recurring charges on tools). $29 lifetime + $5/mo as the "support development" option = best of both.
- **Optional tip-jar / sponsor button** on GitHub for the free users.

**Realistic revenue expectations:**

- **60 days post-launch:** $200-500 MRR (assuming the listing ranks for "json viewer" / "json formatter" / "give freely alternative"). $1K MRR in 60-120 days is *possible* if you ride the scandal-traffic wave AND the listing climbs to top 5 quickly, but the IH+SS data suggests **$200-500/mo floor by day 60 is more honest.**
- **12 months:** $1-3K MRR if you hit top 3 in the category and convert ~1% of users to Pro at $29 lifetime ($5/mo equivalent ~$0.40/mo amortized over 6 years). Stretch upside: $5-10K MRR if you become THE replacement.
- **Wappalyzer-class outcome ($85K MRR):** very unlikely. Wappalyzer sells B2B SaaS on top of the extension. A pure JSON viewer doesn't have that adjacent paid product.

---

## VERDICT

**BUILD IT — but ship fast and position against JSONView, not against the compromised incumbent.**

The "clean replacement" wedge is real but it's a 2-3 month window before consolidation. Two named entrants (theluckystrike, JSONVault Pro) are already in the store. JSONView at 900K users is the de-facto post-scandal winner-by-default and your real competitor — its documented weaknesses (5MB ceiling, weak search, JSON-only) are your specific opportunity. You can ship a credible v1 in 1-2 weeks with Claude Code. Position on trust (open source MIT, `activeTab` + dynamic injection only, zero network calls verifiable) plus large-file performance plus JSON+YAML+XML. Free baseline + $29 lifetime Pro for streaming / diff / schema. **Realistic 60-day revenue is $200-500 MRR; $1K MRR is plausible by 90-120 days if you climb to top 5 in the category.** This is not a $10K MRR play unless you build adjacent B2B SaaS, but it is a clean $1-3K MRR play with a tight scope, fast feedback, and a moat that compounds with reviews. Ship it. Move now.

---

*Sources cited inline. Raw search outputs preserved in conversation transcript.*
