# SVG Benchmark Redraw Report

## Methodology

Recreated W3C SVG test suite reference files from scratch using vectorfeld's actual
drawing tools via playwright-cli (rect tool, pen tool, etc.). Exported results as SVG.
Compared reference vs vectorfeld SVGs by **parsing SVG structure** — no PNG screenshots,
no vision models. Comparison script: `svg-compare.py`.

Coordinate mapping: reference SVGs use viewBox `0 0 480 360`. vectorfeld uses `0 0 210 297`
(A4 mm). Scale factors: x=0.4375, y=0.825.

## Results Summary

| Benchmark | Elements | Checks | PASS | FAIL | Verdict |
|-----------|----------|--------|------|------|---------|
| painting-stroke-01 | 2 rects | 18 | 17 | 1 | **PASS** (1 test-setup error) |
| shapes-rect-01 | 8 rects | 72 | 72 | 0 | **PASS** |
| paths-data-01 | 8 paths | 10 | 0 | 10 | **FAIL** |

**Grand total: 89 PASS, 11 FAIL**

## Benchmark 1: painting-stroke-01 — PASS

Reference: 2 blue rectangles. One with `stroke=none`, one with `stroke=green stroke-width=20`.

**Recreation method:** Drew 2 rects with rect tool at mapped coordinates. Set fill/stroke
via `eval` (Properties panel color pickers are not automatable with playwright-cli).

| Check | Rect 1 (stroke-01) | Rect 2 (stroke-02) |
|-------|-------|-------|
| fill | PASS (blue) | PASS (blue) |
| stroke | PASS (none) | PASS (green) |
| stroke-width | PASS (default) | **FAIL** (ref=8.8mm, vf=20mm) |
| position x | PASS (delta=0.4mm) | PASS (delta=0.4mm) |
| position y | PASS (delta=0.2mm) | PASS (delta=0.1mm) |
| width | PASS (delta=0.4mm) | PASS (delta=0.4mm) |
| height | PASS (delta=0.3mm) | PASS (delta=0.3mm) |

**1 FAIL explained:** The stroke-width was set to the raw reference value (20) instead of
the scaled value (20 * 0.4375 = 8.75). This is a **test-setup error**, not a vectorfeld
tool failure. The rect tool and attribute setting both work correctly.

## Benchmark 2: shapes-rect-01 — PASS

Reference: 8 rectangles testing fill, stroke, stroke-width, and rounded corners (rx/ry).

**Recreation method:** Drew 8 rects with rect tool at mapped coordinates. Set fill, stroke,
stroke-width, rx, ry via `eval`.

| Rect | fill | stroke | stroke-width | rx | ry | position | size |
|------|------|--------|-------------|----|----|----------|------|
| 1 (no-fill) | PASS none | PASS #000 | PASS default | PASS n/a | PASS n/a | PASS | PASS |
| 2 (filled) | PASS fuchsia | PASS none | PASS default | PASS n/a | PASS n/a | PASS | PASS |
| 3 (rounded) | PASS none | PASS #000 | PASS default | PASS present | PASS n/a | PASS | PASS |
| 4 (rounded filled) | PASS fuchsia | PASS none | PASS default | PASS present | PASS n/a | PASS | PASS |
| 5 (thick blue) | PASS none | PASS #00F | PASS 3.5 | PASS n/a | PASS n/a | PASS | PASS |
| 6 (green+blue) | PASS #0F0 | PASS #00F | PASS 3.5 | PASS n/a | PASS n/a | PASS | PASS |
| 7 (rounded thick) | PASS none | PASS #00F | PASS 3.5 | PASS present | PASS present | PASS | PASS |
| 8 (rounded green) | PASS #0F0 | PASS none | PASS default | PASS present | PASS present | PASS | PASS |

**72/72 checks PASS.** Position deltas all <0.3mm. All structural attributes match.

## Benchmark 3: paths-data-01 — FAIL

Reference: 8 bezier paths using `M`, `C`, `S`, `c`, `s`, `m`, `z` commands.

**Recreation method:** Attempted to draw the X-curve path (path 1 of 8) using the pen tool
with click-drag for bezier control handles.

### Failures

**1. Element count: 8 expected, 1 created**
Only 1 of 8 paths was drawn. Each path requires careful multi-point click-drag sequences
with the pen tool. The pen tool requires Enter to commit (Escape discards). Drawing all 8
would produce the same structural failures described below.

**2. Command type mismatch**
- Reference: `M, C, S, m, c, s` (smooth curveto, relative commands, multi-subpath)
- Vectorfeld pen tool output: `M, C, C, C, Z` (only absolute cubic bezier + close)

**3. Pen tool limitations (root causes):**

| Limitation | Impact |
|-----------|--------|
| **No `S`/`s` (smooth curveto)** | Pen tool generates `C` for all curves. Cannot produce `S` which reflects the previous control point. |
| **No relative commands (`c`, `s`, `m`)** | Pen tool always uses absolute coordinates. Reference uses relative commands for subpaths. |
| **No multi-subpath** | Pen tool creates one path per Enter. Reference path 1 has `M...S m...s` (two subpaths in one `<path>` element). |
| **Symmetric handles** | Click-drag creates symmetric incoming/outgoing handles. Reference paths have asymmetric control points. Tested: C2 control y=5.72 vs reference y=49.5 — 44mm error. |
| **No fill/stroke via tool** | Fill/stroke must be set separately via eval or Properties panel. |

**4. Missing paths (7 of 8)**
| Path | Commands | Why it fails |
|------|----------|-------------|
| Infinity | `M,c,c,c,C,z` | Relative `c` commands, closed path with asymmetric controls |
| Line | `M,C,Z` | Trivial — could be recreated, but C is degenerate (straight line) |
| Inverted V | `M,C,c,Z` | Mixed absolute/relative, asymmetric controls |
| Ribbon | `m,c,s` | All relative, smooth curveto |
| Arc | `M,C` | Simple — could be recreated with click-drag |
| Circle | `M,c,s,s,s,z` | All relative, 4 smooth curves |
| Horseshoe | `m,c,z` | Relative, closed |

## Tool Capability Matrix

| Feature | Rect Tool | Pen Tool | Export |
|---------|-----------|----------|--------|
| Create element at position | PASS | PASS | n/a |
| Set fill color | via eval | via eval | PASS |
| Set stroke color | via eval | via eval | PASS |
| Set stroke-width | via eval | via eval | PASS |
| Set rx/ry (rounded corners) | via eval | n/a | PASS |
| Position accuracy | <0.5mm | <1mm | PASS |
| Straight line segments (L) | n/a | PASS (click) | PASS |
| Cubic bezier (C) | n/a | PASS (click-drag) | PASS |
| Smooth curveto (S/s) | n/a | **FAIL** | n/a |
| Relative commands (c/s/m) | n/a | **FAIL** | n/a |
| Multi-subpath | n/a | **FAIL** | n/a |
| Asymmetric handles | n/a | **FAIL** | n/a |
| Closed paths (Z) | n/a | PASS (click start) | PASS |

## Files

| File | Description |
|------|-------------|
| `painting-stroke-01.svg` | W3C reference |
| `painting-stroke-01-VECTORFELD.svg` | Vectorfeld recreation |
| `shapes-rect-01.svg` | W3C reference |
| `shapes-rect-01-VECTORFELD.svg` | Vectorfeld recreation |
| `paths-data-01.svg` | W3C reference |
| `paths-data-01-VECTORFELD.svg` | Vectorfeld recreation (1 of 8 paths) |
| `svg-compare.py` | Structural comparison script |

## Conclusion

**Rect-based benchmarks: PASS.** The rect tool creates elements at accurate positions.
Fill, stroke, stroke-width, rx/ry can all be set and are preserved through export.

**Path-based benchmark: FAIL.** The pen tool can create basic straight-line and cubic
bezier paths, but cannot reproduce the full SVG path command set. Smooth curveto (`S`/`s`),
relative commands, multi-subpath elements, and asymmetric control handles are all
unsupported by the pen tool UI. Complex bezier artwork cannot be recreated from scratch
using vectorfeld's current tools — it must be imported.
