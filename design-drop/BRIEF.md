# Vectorfeld — design brief

## What it is

A desktop vector/PDF editor. See `current-ui.png` for the (deeply unloved)
current UI.

## What it's actually for

**Casual PDF editing.** The one user opens the tool maybe once every few
months when they need to edit a Word-generated PDF (flowing text, embedded
images, simple shapes) and be done. Sessions are short and infrequent.

Implications that should shape every design decision:

- **Cold pickup.** The user will not remember anything between sessions —
  no shortcuts, no conventions, no toolbar ordering. Everything important
  must be self-explanatory on sight.
- **Multi-document is first-class.** The defining workflow is copying
  elements from PDF B into PDF A (e.g. text content onto a branded
  letterhead). Tabs or similar need to be obvious.
- **Round-trip fidelity matters more than authoring power.** Open a PDF,
  nudge a few things, export a PDF that still looks right. Not: author
  precise Bézier curves from scratch.
- **One specific user.** No multi-user, no cloud, no auth, no onboarding.

## What it is NOT

This started life as a scientific-diagram editor (rulers, mm-snap, Bézier
authoring, LaTeX/TikZ export). **That vision is dead.** The current UI
still carries visual baggage from that era — pixel-precise rulers, tiny
mm/pt coordinate readouts in the status bar, a sparse tool strip of
drawing primitives the user rarely touches. Feel free to demote or hide
anything that serves the old use case.

## Current surface (what's in this drop)

- `App.tsx` — top-level layout (menu bar, tool strip, canvas, layers
  panel, properties panel, status bar, ruler)
- `components/` — every UI component (13 files, ~2.3k LOC)
- `index.css` — global styles (minimal; most styling is inline Tailwind-ish
  class strings)
- `current-ui.png` — what it looks like today (1280×720)

Not included: `src/model/` (document model, PDF import/export, geometry —
logic only), `src/tools/` (per-tool interaction handlers — mouse/keyboard
state machines). Those don't need redesigning.

## What the current UI gets wrong (owner's own assessment)

- It looks like a 1998 Java Swing app.
- Everything is equally loud — no visual hierarchy, no sense of what the
  primary action is.
- The tool strip is a column of icons with no labels or grouping.
- Properties panel is a dense table with no breathing room.
- No tabs for multi-doc (the feature the whole pivot is about).
- Bottom status bar reads like a CAD program ("X: 0.0 mm Y: 0.0 mm 100%")
  — irrelevant to PDF editing.

## What to keep

- The canvas is the star. Everything else orbits it.
- Layers panel is load-bearing (compositing workflow depends on it).
- File / Edit / View menus stay (native menu-bar pattern).

## Liberties you can take

Redesign, don't restyle. Move things, merge panels, drop controls, change
the whole information architecture. The logic layer is stable and won't
be affected — you're free to propose a UI shape we'd re-wire to.
