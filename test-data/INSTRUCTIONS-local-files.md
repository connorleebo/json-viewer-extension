# Testing local files

Chrome handles local JSON, XML, and YAML files differently. Here's what
actually happens and how to test each case.

---

## JSON (`small.json`, `medium.json`, `large.json`, `broken.json`)

**What Chrome does:** drops the raw text into `<body><pre>…</pre>`.

**What to do:**
1. Drag the file into a new Chrome tab.
2. Click the JSON Viewer toolbar icon.
3. Tree renders.

**Note:** the extension card must have "Allow access to file URLs"
toggled ON for `file:///` pages to work.

---

## XML (`sample.xml`, `broken.xml`)

**What Chrome does:** runs its **built-in XML viewer** — a styled tree
view with the header text *"This XML file does not appear to have any
style information associated with it…"*

**What the extension does:** detects Chrome's built-in viewer by looking
for the `#webkit-xml-viewer-source-xml` element Chrome injects, then
reads the raw XML directly from that element. No new permissions needed.

**What to do:**
1. Drag `sample.xml` into a new Chrome tab. Chrome's tree view appears.
2. Click the JSON Viewer icon.
3. Our tree renders, format pill reads **XML**.

**The do-no-harm guarantee:** if for any reason we cannot read the raw
XML (rare edge case in some Chromium forks), we leave Chrome's view
exactly as it was and show a small "Could not load this XML file's raw
source" toast in the bottom-right corner. **You will never end up with a
blank page.**

---

## YAML (`sample.yaml`, `broken.yaml`)

**What Chrome does:** **downloads** the file instead of displaying it.
Chrome treats `.yaml` and `.yml` as application/octet-stream by default
and offers a Save dialog.

**This is a browser-level behavior the extension cannot override** —
intercepting downloads would require additional permissions we
deliberately do NOT request (it would also reasonably alarm any
privacy-minded user).

**Workaround for local YAML testing — serve it from a local web server:**

```bash
cd <folder-with-the-yaml-files>
python3 -m http.server 8000
```

Then open `http://localhost:8000/sample.yaml` in Chrome. Chrome's plain
text renderer displays it. Click the JSON Viewer icon → tree renders,
format pill reads **YAML**.

For YAML files served over HTTP with a sensible Content-Type
(`text/yaml`, `application/yaml`, `text/x-yaml`), the extension works
without any workaround — see the served-YAML test in the main README.

---

## JSONP (`sample.jsonp`)

**What Chrome does:** offers to download the file (same as YAML).

**Workaround:** same as YAML — serve via `python3 -m http.server`, then
open the localhost URL.

The extension's JSONP detection should kick in: format pill reads
**JSON**, and a blue indicator bar at the top reads
*"JSONP detected — wrapper stripped (callback "jQuery1234_callback")."*

---

## Do-no-harm verification (the critical test)

Stage 3's most important behavior change: **the extension never
destroys a working page.** Test it like this:

### Test A — plain HTML page

1. Open any HTML page (e.g. `https://example.com`).
2. Click the JSON Viewer icon.
3. **Expected:** the page stays exactly as it was. A small toast in the
   bottom-right reads "This page doesn't look like JSON, YAML, or XML."
4. **Failure mode that must not happen:** blank page, page contents
   replaced with anything else.

### Test B — local XML

1. Drag `sample.xml` into Chrome. Chrome's built-in XML viewer renders.
2. Click the JSON Viewer icon.
3. **Expected:** our tree renders.
4. **Failure mode that must not happen:** blank page.

### Test C — local broken XML

1. Drag `broken.xml` into Chrome. Chrome's XML viewer shows an error
   ("This page contains the following errors…").
2. Click the JSON Viewer icon.
3. **Expected:** our **Invalid XML** error panel renders with line/col.

If any test ends with a blank page, that's a bug. Open a GitHub issue.
