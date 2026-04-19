# 04 — Tooling and Build

_Audited: 2026-04-19_

## 1. Toolchain Summary

| Layer | Package | Version (package.json) | Installed |
|---|---|---|---|
| Runtime | Node.js | — | v25.2.1 |
| Package manager | npm | — | 11.6.4 |
| TypeScript | typescript | ~5.9.3 | 5.9.3 |
| Bundler | vite | ^7.3.1 | installed |
| React | react / react-dom | ^19.2.0 | installed |
| React plugin | @vitejs/plugin-react | ^5.1.1 | installed |
| CSS | tailwindcss + @tailwindcss/vite | ^4.2.1 | installed |
| Desktop shell | @tauri-apps/api + cli | ^2.10.1 / ^2.10.0 | installed |
| Test runner | vitest | ^4.0.18 | installed |
| Test DOM | @testing-library/react | ^16.3.2 | installed |
| Test assertions | @testing-library/jest-dom | ^6.9.1 | installed |
| Test environment | jsdom | ^28.1.0 | installed |
| Linter | eslint + typescript-eslint | ^9.39.1 / ^8.48.0 | installed |
| Boolean ops | paper | ^0.12.18 | **NOT installed** |
| PDF import | mupdf | ^1.27.0 | **NOT installed** |
| PDF export | jspdf | ^4.2.0 | installed |
| PDF/SVG bridge | svg2pdf.js | ^2.7.0 | installed |
| Canvas polyfill | canvas | ^3.2.1 | installed |
| Rust toolchain | tauri-build / tauri | 2.5.4 / 2.10.0 | in Cargo.toml |

All versions use `^` semver except TypeScript (`~5.9.3`, patch-pinned) and Rust crates (exact pinned in Cargo.lock).

## 2. NPM Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | Start Vite dev server (HMR, port 5173) |
| `build` | `tsc -b && vite build` | Type-check with project references, then bundle to `dist/` |
| `lint` | `eslint .` | Run ESLint over all `.ts`/`.tsx` files |
| `preview` | `vite preview` | Serve the `dist/` build locally |
| `test` | `vitest run` | Run all Vitest tests once (CI mode) |
| `test:watch` | `vitest` | Run tests in interactive watch mode |
| `tauri` | `tauri` | Invoke the Tauri CLI (wraps `cargo tauri dev/build/etc.`) |

Notable: no `test:coverage`, no `format` (Prettier), no `typecheck` standalone (only via `build`), no `tauri:build` alias.

## 3. Tauri / Desktop Status

**Config** (`src-tauri/tauri.conf.json`):
- `productName`: vectorfeld, version 0.1.0
- `identifier`: dev.vectorfeld.app
- `devUrl`: http://localhost:5173 (matches Vite default)
- `beforeDevCommand` / `beforeBuildCommand`: `npm run dev` / `npm run build`
- `bundle.targets`: "all"
- `security.csp`: null (disabled — fine dev, risky for distribution)
- Window: 1280×800, resizable

**Rust** (`src-tauri/Cargo.toml`):
- Edition 2021, `rust-version = "1.77.2"`
- Crate types: `staticlib + cdylib + rlib`
- Dependencies: `tauri 2.10.0`, `tauri-plugin-log 2`, `serde 1.0`, `serde_json 1.0`, `log 0.4`
- `build-dependencies`: `tauri-build 2.5.4`

**`src/lib.rs`**: Minimal — builds the Tauri app with `tauri_plugin_log` in debug mode only. **No custom Rust commands registered.**

**Gaps**:
- No `#[tauri::command]` invoke handlers — all logic is front-end only. Tauri is a shell.
- CSP disabled.
- No `.cargo/config.toml`.
- No file-system / native API integration yet.

## 4. Test Infrastructure

- **Runner**: Vitest ^4.0.18
- **Environment**: jsdom (in `vite.config.ts`)
- **Globals**: enabled (`globals: true`) — no per-file imports needed
- **Setup file**: `src/test/setup.ts` — single line: `import '@testing-library/jest-dom'`
- **tsconfig**: `tsconfig.app.json` includes `"types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]`

**Test file locations** (40 files total):
- `src/model/*.test.ts` — 27 files
- `src/tools/*.test.ts` — 9 files
- `src/components/*.test.ts(x)` — 4 files
- `src/App.test.tsx` — 1 file (currently fails)

**Mocking approach**: tests directly instantiate model/tool classes against minimal jsdom SVG DOM. No central mock factory; mocks built inline. The `canvas` package provides Node-compatible Canvas for jsdom.

## 5. Benchmarks

**Location**: `test-benchmarks/` — ad-hoc, manually-run SVG conformance suite. Not integrated with Vitest or CI. Uses the `playwright-cli` skill against a live running app.

**Scripts**:
- `benchmark-runner.js` — general harness; SVG coordinate mapping, mouse interactions, attribute inspection, structured bug reporting via playwright-cli `run-code`
- `redraw-test.js` — recreates `shapes-rect-01` with the rect tool, verifies DOM, runs operations
- `svg-compare.py` — Python structural comparison (no screenshots): parses elements, compares fill/stroke/position/size with scale correction

**Reference SVGs**: W3C suite for `painting-stroke-01`, `shapes-rect-01`, `paths-data-01`, plus `tiger.svg`, `grad-transforms.svg`, `masking-path-05.svg`, `coords-trans-09.svg`, `radialgradient2.svg`.

**Results** (`REPORT.md`):
| Benchmark | Result | Notes |
|---|---|---|
| painting-stroke-01 | PASS (17/18) | 1 fail = test-setup error (wrong scale for stroke-width) |
| shapes-rect-01 | PASS (72/72) | Perfect |
| paths-data-01 | FAIL (0/10) | Pen tool lacks S/s, relative commands, multi-subpath |

**Integration**: Manual only. No `npm run benchmark`. No CI invocation. `tiger.svg` etc. have no VECTORFELD versions — likely imported for inspection.

## 6. CI / Automation

**GitHub Actions**: None. No `.github/` directory.

**Git hooks (`.beads/hooks/`)**:
- `pre-commit`, `post-checkout`, `post-merge`, `prepare-commit-msg`, `pre-push` — all run `bd hooks run <name>` (gated with `command -v bd`).
- Sync the `.beads/` issue database — do **not** run linting or tests on commit.

**`.git/hooks/`**: Only `.sample` files; beads hooks not symlinked here.

**`.claude/` directory**: Skill reference docs for `playwright-cli` and Lean4 theorem-proving. No Claude Code hooks (no `settings.json`).

**`.playwright/`**: `cli.config.json` configures Chromium channel. Holds ~120 timestamped page snapshot `.yml` files and screenshots from March 1–2 2026 sessions.

## 7. Build Health

### `npm run build` — **FAIL**

`tsc -b` fails with **42 TypeScript errors**. Vite bundling never reached.

| Error Code | Count | Meaning |
|---|---|---|
| TS6133 | 23 | Declared but never used |
| TS1294 | 10 | `erasableSyntaxOnly` violation (likely `const enum`) |
| TS2339 | 6 | Property does not exist on type (test mocks typed `{}`) |
| TS2307 | 2 | Cannot find module (`paper`, `mupdf` — **not installed**) |
| TS2367 | 1 | Unintentional comparison (`HTMLElement \| null` vs `SVGSVGElement`) |

**Affected files**:
- `model/clipping.ts`, `model/opacityMask.ts` — TS1294
- `model/pathBooleans.ts`, `model/pdfImport.ts` — TS2307
- `model/document.ts` — TS2367
- Multiple tool/component files — TS6133
- `selectTool.test.ts`, `penTool.test.ts`, `textTool.test.ts` — TS2339

### `npm test -- --run` — **PARTIAL FAIL**

```
Test Files:  3 failed | 37 passed (40)
Tests:       461 passed
```

37/40 suites pass. **461 tests pass; 0 individual tests fail.**

3 suites fail at import/transform time (never run):
- `App.test.tsx` — cascades from `pathBooleans` chain
- `pathBooleans.test.ts` — `paper` not installed
- `pdfImport.test.ts` — `mupdf` not installed

All same root cause: `paper` and `mupdf` listed in `package.json` but not in `node_modules`. `npm install` should fix.

### `npx tsc --noEmit` — **PASS (vacuously)**

Root `tsconfig.json` has `files: []` and only `references` — `tsc --noEmit` exits 0 with no output. Real type errors only surface via `tsc -b` (`npm run build`). **Standalone `tsc --noEmit` is not a reliable health signal here.**

## 8. Risks and Gaps

| Severity | Item | Details |
|---|---|---|
| HIGH | `paper` and `mupdf` not installed | Listed in deps but absent from `node_modules`. Breaks build, 3 test suites, and `pathBooleans`/`pdfImport` at runtime. |
| HIGH | 10× TS1294 `erasableSyntaxOnly` errors | `clipping.ts`, `opacityMask.ts` use non-erasable syntax. Breaks build. |
| HIGH | No CI | No GitHub Actions. No automated build/test gate. Regressions land silently. |
| MEDIUM | 23× TS6133 unused variables | Across 12 files. Stale code after refactors. Strict mode → errors not warnings. |
| MEDIUM | Test mock typing (`{}`) | `penTool.test.ts`, `selectTool.test.ts`, `textTool.test.ts`. Need partial types. |
| MEDIUM | CSP disabled in Tauri | `"csp": null`. Must address before distribution. |
| MEDIUM | No Rust commands | Tauri is a thin wrapper. Native capabilities require Rust impl before desktop packaging is meaningful. |
| MEDIUM | `tsc --noEmit` gives false green | Root tsconfig has `files: []`. Any CI relying on it would miss all errors. |
| LOW | No coverage / format / `tauri:build` scripts | — |
| LOW | Benchmark suite ad-hoc | No npm script, no CI, requires live app + playwright-cli. |
| LOW | `.playwright/` accumulates | 120+ snapshot files from March, no cleanup or `.gitignore`. |
| LOW | `.beads/` git hooks don't run tests | Only sync issue DB. A `npm test` gate would catch the current TS errors. |
| LOW | TypeScript pinned to `~5.9.3` | Verify `erasableSyntaxOnly` adoption was intentional. |

## Health Verdict

Toolchain is well-structured (Vite 7, React 19, Vitest 4, Tauri 2 — all current major versions, strict TypeScript). Test suite is substantial (461 passing tests across 37 suites). However the **build is currently broken**: 42 TypeScript errors with two root causes — (1) `paper` and `mupdf` missing from `node_modules` (likely an `npm install` skipped after deps were added), and (2) non-erasable syntax in `clipping.ts`/`opacityMask.ts` clashing with the newly-enabled `erasableSyntaxOnly` flag. There is **no CI**, so these failures are not auto-caught. Fixing the missing installs + the `erasableSyntaxOnly` violations would restore green; adding a GitHub Actions workflow with `npm run build` and `npm test -- --run` as required checks would prevent regression.
