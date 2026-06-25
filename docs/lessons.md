# Lessons Learned

## playwright-cli mouse events
- `mousedown` and `mouseup` default to `button: 'undefined'` which doesn't trigger `button === 0` checks
- Always pass `left` argument: `playwright-cli mousedown left`, `playwright-cli mouseup left`
- Canvas container has offset from viewport edge (toolstrip + layers panel) — coordinates must be within the container bounds

## Test setup for DocumentModel
- Tests using `createDocumentModel(svg)` need a layer `<g data-layer-name="...">` in the SVG
- Without it, `getActiveLayer()` returns null and `addElement()` fails with "Cannot read properties of null"
- Always include `makeSvg()` helper that adds the default layer

## Export cleanliness
- Every new overlay group needs a `data-role` attribute and must be stripped in ALL export functions (SVG, PDF, PNG)
- Selector list: `[data-role="overlay"], [data-role="preview"], [data-role="grid-overlay"], [data-role="guides-overlay"], [data-role="user-guides-overlay"], [data-role="wireframe"]`
- When adding a new overlay, update the strip selector in `exportSvg`, `exportPdf`, and `exportPng`

## image tag support
- When adding a new SVG element type, it needs support in: geometry.ts (`computeTranslateAttrs`), EditorContext.tsx (nudge + paste), selectTool.ts (hit test + move/scale)
- The `image` tag uses same position model as `rect` (x/y/width/height)

## Underscore-prefixed parameters
- When a function parameter is prefixed with `_` (e.g., `_getDoc`), it means "intentionally unused"
- If you later ADD code that uses that parameter, REMOVE the underscore prefix
- The chaos monkey found `_getDoc` → `getDoc` bug in directSelectTool.ts because the shape-to-path auto-convert code called `getDoc()` but the parameter was still `_getDoc`

## Transform model
- `geometry.ts:transformedAABB()` now uses full affine matrix via `matrix.ts` — handles translate, scale, rotate, skewX, skewY, matrix, and chained transforms
- Old regex-only approach silently returned wrong AABB for non-rotate transforms
- 6 consumers benefit automatically: selectTool (2), selection.ts (2), smartGuides (1), geometry.ts (1)

## Selection overlay and rotation
- For rotated single elements, use LOCAL `getBBox()` (not `unionBBox/transformedAABB`) for:
  - Rotation center computation (always local bbox center)
  - Scale anchor computation (anchor must be in same space as element attributes)
- During scale of rotated elements, inverse-rotate mouse point into local space before computing scale factors

## EditorContext refactoring
- Extracted modules (clipboard.ts, nudge.ts, zOrder.ts) should reuse `computeTranslateAttrs` from geometry.ts
- The old EditorContext had duplicated per-element-type offset logic in both nudge and paste handlers
- When extracting, pass React refs (like clipboardRef) as `{ current: T }` parameters for testability

## Beads issue tracking
- Dolt server must be running for bd to work: check `ps aux | grep dolt`
- bd v0.58+ auto-starts Dolt if installed at `~/.local/bin/dolt`
- Use `/home/tobias/.local/bin/bd` (not just `bd`) if PATH has old version
- Old JSONL backup may have schema incompatibilities with newer bd versions — fresh `bd init` is safer than `--from-jsonl`
- **On a fresh device / after clearing bd state, check `.beads/interactions.jsonl` before declaring pivot-session work lost.** `.beads/issues.jsonl` is a snapshot that only updates on `bd export`, but `.beads/interactions.jsonl` is an append-only audit log that bd updates on every field change. If the previous session committed interactions.jsonl but forgot to re-export issues.jsonl, the audit trail preserves closures even though `bd ready` shows a stale state. Read it before recreating beads from scratch.

## Git stash hygiene
- **Never `git stash drop` without reading the stash contents first.** `git stash show -p stash@{0}` takes five seconds. Dropped stashes become unreachable objects that `git filter-repo`, `git gc`, and similar commands will permanently delete. At least one session has lost `.beads/sync_base.jsonl` + `package-lock.json` deltas this way.

## Playwright-cli
- Install: `npm install -g @playwright/cli` then `playwright-cli install` (downloads chromium)
- `playwright-cli console error` shows only actual errors (not info/debug)
- `mousewheel` args must be positive: `playwright-cli mousewheel 0 100` not `0 -300`
- The chaos monkey script is at `/tmp/chaos-monkey.sh` — 20 phases, run after any major change

## `pkill -f` / `pgrep -f` match the agent's OWN shell — self-kill footgun

- `pkill -f 'vite'` (or `pgrep -f 'node.*vite' | xargs kill`) matches against the
  FULL command line of every process — **including the `bash -c "...pkill -f 'vite'..."`
  the agent is currently running.** The pattern string appears literally in your own
  shell's argv, so you kill your own shell (exit code 143/144 = SIGTERM) before the
  real work runs. Burned two tool calls this way restarting the dev server.
- Rules: (1) to stop a dev server you started via the Bash tool's `run_in_background`,
  don't `pkill` — just start a fresh one (if nothing is listening, `curl localhost:5173`
  returns 000). (2) If you must kill by pattern, match on something NOT in your command
  (e.g. the listening port via `fuser 5173/tcp -k`, or a pidfile), or narrow with
  `pgrep -f 'vite$'` style anchors that won't match the `-c` string. (3) Prefer the
  harness's background-task mechanism over shell `&` + `nohup`/`setsid`.

## Playwright Chromium can vanish from the cache — verify before headed runs

- `~/.cache/ms-playwright/` had been cleared on this machine, so `chromium.executablePath()`
  pointed at a binary that didn't exist and `npm run golden` / `dogfood` would fail to
  launch — even though the dogfood suite "worked" in a prior session. The harness imports
  chromium from the global `@playwright/cli`'s bundled playwright (fixed path in
  test/golden/harness.mjs + test/dogfood/*.mjs), NOT a project dep.
- Reinstall: `node <@playwright/cli path>/node_modules/playwright/cli.js install chromium`.
- Before diagnosing a headed-test failure, confirm BOTH the binary exists
  (`ls "$(node -e "...executablePath()")"`) AND `curl localhost:5173` is 200.

## Synthetic-test blindspot for SVG export

- The pdf-lib SVG→PDF engine (vectorfeld-9s9) shipped passing all synthetic-fixture tests but failed on every real PDF import (vectorfeld-dns). Two structural bugs were missed:
  1. **`walk()` only applied transforms on container `<g>` elements**, ignoring `transform=` attrs on leaf elements (`<text>`, `<path>`, `<rect>`, …). Synthetic tests always wrap content in `<g transform=...>`, but **MuPDF's flatten step puts `transform="scale(pt→mm)"` directly on each leaf** to keep them as individually-selectable layer children. Result: every imported PDF rendered ~3× too large at the wrong position.
  2. **`drawText` only read `x`/`y` from the `<text>` element itself**, ignoring positions on `<tspan>` children. Synthetic tests use `<text x= y=>content</text>`. **MuPDF emits `<text transform=…><tspan x= y=>char</tspan>…</text>`** — position is on the tspan. Without tspan-aware drawing, every imported text collapsed to (0, 0) and ended up at the bottom-left.
- **Lesson:** for any SVG-consuming code, **the unit-test fixtures must include the emission shape of every upstream tool you intend to consume**, not just the textbook SVG forms. For us that means: a fixture whose structure mirrors MuPDF's actual output (leaf-level transforms + tspan-positioned glyphs). Run `experiments/probe-mupdf-svg.mjs`-style spike scripts when adding a new SVG consumer to see what producers actually emit.
- **Detection method that worked:** real-user composite-via-playwright + screenshot the exported PDF in headed Chromium. Visual inspection caught what 17 green synthetic tests missed.

## pdf-lib drawSvgPath double-Y-flip

- `page.drawSvgPath(d, { x, y, ... })` applies an **internal Y-flip** to convert SVG-convention (y-down from anchor) into PDF coordinates. If you also pre-flip your d-string via `pageHeightPt - y`, the result is a double-flip and every path renders above the page (invisible).
- Symptom that caught this: after importing a PDF with MuPDF, the 216 vector paths for the flyer's bird logo + blue border frame were **completely missing** from the exported PDF, even though `constructPath` ops were present (just at negative Y).
- Detection: no synthetic test caught this because existing path tests only asserted `<path[\s>]/i.test(reimported)` — "a path element exists somewhere". Added a real position test (`test/roundtrip/svgToPdfRoundtrip.test.ts`) that re-imports via `pdfToSvg` and checks at least one path command point lies inside the page viewBox.
- Fix pattern for mixed API shapes: `drawRectangle`/`drawText`/`drawLine`/`drawEllipse` take PDF coords directly (bottom-up), but `drawSvgPath` takes SVG coords and flips internally. **When mixing these in one engine, pre-flipping applies to the first group only**. Pass `y: pageHeightPt` to `drawSvgPath` to anchor SVG origin at the page's top-left; pass PDF-space coordinates for the others.

## Vite dev server staleness when dogfooding headed Chromium

- After landing code, **re-verifying via playwright + headed Chromium against `localhost:5173` can serve STALE CODE** if the dev server has been running for a long time (>an hour, or after a background-task lifecycle event). Vite's HMR usually keeps things fresh but not always — especially when asset imports (`?url`) change.
- Symptom that burned time: a PDF export test produced visibly broken output for 10+ minutes while the code *looked* right and isolated stress tests passed cleanly. Eventually found the dev server process was dead (HTTP 000) and playwright was hitting a stale cached build in a zombie state.
- Rule: before diagnosing a headed-Chromium failure, **curl localhost:5173 and confirm 200**; if in doubt, kill and restart `npm run dev` with `nohup ... &` so it survives the agent session. Check `ps aux | grep vite`.
- Verification shortcut: also render the exported PDF via `pdftoppm -r 100 -png` (CLI, no Vite). If Chromium shows garbage but pdftoppm shows correct output, the PDF is fine and Chromium has a rendering quirk. If BOTH show garbage, the PDF itself is wrong. If pdftoppm succeeds on the CURRENT file but Chromium failed earlier, the file changed (stale fetch).

## Subagent file-writing
- The Explore subagent is read-only — it cannot Write/Edit files even when the prompt asks for output to a path
- For tasks that must produce files (reports, refactors), use the general-purpose subagent OR plan to write the output yourself from the agent's response
- When asked to delegate report-writing, prefer general-purpose; reserve Explore for "search and summarise back to me" tasks

## Read the vendor's `.d.ts` before rolling your own

- Before writing a custom parser, tokenizer, or serializer over a vendor SDK's data, **grep its `.d.ts` for the obvious feature names** (`redact`, `filter`, `process`, `transform`, `walk`, …). The C-level API often has the feature; the JS binding usually exposes a thin wrapper.
- Concrete burn averted (`vectorfeld-enf`): we were about to roll a 250-LOC PDF content-stream tokenizer + ToUnicode CMap parser to truly delete source elements from a graft-output PDF. 30 minutes reading `node_modules/mupdf/dist/mupdf.d.ts` surfaced `PDFPage.applyRedactions()` exposed directly — exactly the API we needed, ~15 LOC primitive instead of 250.
- Prompt the subagent specifically: ask it to *survey the d.ts surface* and quote the relevant lines before designing the implementation. The default behaviour is to design first, search second; for vendor-wrapped problems, that ordering often wastes a session.

## Visual cover ≠ delete (in PDFs)

- A "delete" implemented as a white-fill rect overlay (or any draw-op-based visual cover) **does not delete from the PDF's content stream**. The original draw ops are still there, just visually obscured. pdfjs `getTextContent`, Ctrl+F, copy-paste, accessibility tooling, and search engine indexing all still find the "deleted" text. For a PDF *editor*, this is the wrong mechanism.
- The right mechanism is content-stream rewriting: either via the vendor's redaction API (mupdf `applyRedactions`), or by tokenizing and excising the relevant operators yourself.
- Detection: assert deleted-text absence via the **same reader the user-visible tools use** — for the gate suite, that's pdfjs `getTextContent`. Byte-match alone won't catch this class of regression.

## `mupdf.applyRedactions` rewrites /Resources/Font

- `PDFPage.applyRedactions()` doesn't only excise text-show ops from the content stream — it ALSO **prunes the page's `/Resources/Font` dict**, removing any font key whose glyphs aren't currently referenced in the (post-redaction) content stream.
- Concrete burn (`vectorfeld-87h` triage): the graft engine registered the overlay font (Carlito Type-0/Identity-H) BEFORE applying redactions, then appended the overlay content stream that uses it. The font ref stayed embedded in the doc's xref table, but the page's `/Resources/Font` no longer pointed to it. pdfjs read the overlay text bytes against an unknown font → garbage ` `-laden codepoints. The font dict had `BaseFont/VfCarlito` and `/ToUnicode` intact (verified via mupdf, raw byte grep) — only the page-level Resources reference was missing.
- Rule: in any pipeline that combines `applyRedactions` with new font registration, the order MUST be:
  1. `applyRedactions(...)` (rewrites content stream + Resources/Font)
  2. `registerCidFont(...)` / `registerOverlayFont(...)`
  3. `appendContentStream(overlayOps)` referencing the just-registered font
- Detection: if pdfjs `getTextContent()` returns garbage for an overlay font despite the spike confirming `/ToUnicode` round-trip, **inspect the page's `/Resources/Font` keys** before suspecting `/ToUnicode` itself. The signature is "font object exists in xref + raw bytes contain font name + page Resources/Font dict missing the key".

## pdfjs detaches the input buffer on `getDocument`

- `pdfjs.getDocument({ data: pdfBytes })` transfers ownership of the backing `ArrayBuffer`. After the load resolves, `pdfBytes` is detached — `Buffer.from(pdfBytes)` produces 0 bytes; `pdfBytes.slice()` throws "Cannot perform %TypedArray%.prototype.slice on a detached ArrayBuffer".
- Concrete burn (golden runner): `verify()` called `canonicalizePdf(out.pdf)` (which calls getDocument), then `writeFileSync(p.rawPdf, Buffer.from(out.pdf))` for forensic triage. The pending PDF was always 0 bytes, blocking any analysis of why the canonical drifted.
- Rule: when you need both the canonical AND the raw bytes, **snapshot bytes BEFORE the first pdfjs call** (`const raw = Buffer.from(out.pdf)` or `const raw = new Uint8Array(out.pdf)`). For multiple pdfjs sessions, do all assertions inside one `getDocument` block — don't try to reopen the same buffer twice.

## mupdf `PDFObject.Null.resolve()` throws — guard with `.isNull()` first

- `PDFObject.get(key)` on a missing dict key returns the static singleton `PDFObject.Null`, whose `_doc` field is `null`. Calling `.resolve()` on Null throws `TypeError: Cannot read properties of null (reading '_fromPDFObjectKeep')`.
- Concrete burn (eb0-1 / sourceFont.ts): `descriptorHost.get('FontDescriptor').resolve()` throws when iterating fonts that lack a FontDescriptor (standard 14 fonts often do). Same for unknown font keys passed to `extractEmbeddedFontBytes`.
- Rule: before calling `.resolve()` on the result of `.get()`, check `.isNull()` and return null/skip. The `.isDictionary()` / `.isStream()` / etc. type guards work fine on `PDFObject.Null` — they all return false — but `.resolve()` does not.

## Synthetic source PDFs (`exportSvgStringToPdfBytes`) don't embed standard fonts

- pdf-lib defaults Helvetica/Times/Courier to the standard 14 references — they appear in the page's `/Resources/Font` but with no `/FontDescriptor/FontFile{,2,3}` stream. The graft engine's source-font extraction path correctly skips them via `hasEmbeddedProgram=false`, but tests built on synthetic pdf-lib source PDFs can't exercise extraction at all.
- Rule for graft-engine integration tests that need to verify source-font handling: use the flyer fixture (or any real-PDF fixture under `test/dogfood/fixtures/`), or build an explicit fixture via `mupdf.addFont(carlitoBytes)` so an embedded program is actually present.
- Detection: if `listPageFonts(synthDoc, 0)` returns one entry with `hasEmbeddedProgram=false` and a standard-font BaseFont (`Helvetica`, `Times-Roman`, `Courier`), the test setup is wrong for source-font work.

## Parallel subagents on ONE working tree: forbid git ops, ignore foreign tsc errors

- Concrete burn (adversarial-review remediation): three implementer subagents ran concurrently on the shared working tree (disjoint files). One, to test its OWN `tsc -b` cleanly amid the others' in-flight edits, did `git checkout HEAD -- <other agents' files>` then "restored" them — a near-miss that could have clobbered the other two agents' uncommitted work. It also mis-reported "tsc errors" that were just the other agents' transient mid-edit unused-imports.
- Rules when fanning out implementers over a shared tree:
  1. Partition by file. Each agent edits ONLY its assigned file(s) + its own new test/scenario files.
  2. Explicitly forbid `git checkout/stash/revert/restore` and forbid reverting/modifying any file the agent did not create.
  3. Tell agents that `tsc -b` is repo-wide: errors in files they did NOT edit are concurrent work to be IGNORED; only their own files must be clean.
  4. Implementers must NOT run `npm run golden` / dev server / headed scenarios (they race on `:5173` + masters). The ORCHESTRATOR runs all integration gates once on the consistent tree, then commits each bead selectively.
- git worktree isolation is NOT a cheap fix here: JS worktrees lack `node_modules`, so `npm test`/`tsc` break inside them. Sequential or partitioned-shared-tree is the pragmatic model.

## Implementer-written headed scenarios are unverified scaffolding — the orchestrator must run + fix them

- Implementers told "prepare the headed scenario, don't run it" routinely ship scenarios with targeting/measurement bugs that produce FALSE failures:
  - **Off-screen click**: picking a `<text>`/element by DOM order can land on a run below the 900px viewport fold (a tall A4 page) — `page.mouse.click` at `getBoundingClientRect()` y≈1448 hits nothing. Filter targets to those fully within `window.innerWidth/innerHeight`, prefer the widest on-screen run.
  - **Wrong-element measurement**: every pdf-lib export draws the full-page white artboard background rect FIRST, so `pts.slice(0,4)` measures the background (axis-aligned, distinctX=2), not the foreground shape. Exclude page-boundary points (`x<=1||y<=1||x>=maxX-1||y>=maxY-1`) before asserting.
  - **Wrong selection signal**: the app marks selection via `[data-role="selection-box"]` overlays, NOT a `data-selected` attribute on elements. Gate on the Inspector header (`/^TEXT\b/`) + `hasFontSection`, never on a `[data-selected]` query.
- Rule: never trust an implementer's "GATE FAIL" at face value — render the artifact / inspect the raw content stream to decide whether the FIX or the SCENARIO is wrong, then fix the scenario before committing.

## Golden re-master: verify the new master is RIGHT before `--accept`, never blind-record

- A change to a shape emitter (e.g. routing rect/ellipse/circle through path ops) ripples to ALL pdf-lib golden stories because every export draws the artboard background rect first — even `03-text`/`09-bezier` go red though they have no rotated shape.
- Before `node test/golden/run.mjs --accept <story>`: (1) confirm the `.svg.canonical` is byte-IDENTICAL (SVG is the pixel-lossless source of truth — if SVG is unchanged, the visual document is unchanged); (2) confirm fill/stroke ops are preserved in the new `.pdf.json`; (3) render the pending `.pdf` (`pdftoppm`/`mutool`) and eyeball it. Only then accept. The gate already proved it can fail (it went red on your change) — re-recording the VERIFIED-correct value keeps it strict. Never `golden:record` to make red go away.
