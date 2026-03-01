# vectorfeld

A hyper-personal vector graphics editor built for one user. Implements only the features its owner actually uses, with no feature bloat, no subscription, no learning curve for unused functionality.

## What it does

Create publication-quality vector diagrams for inclusion in LaTeX documents. Diagram types include quantum circuits, geometric constructions, graphs, lattice structures, region visualisations, and schematic figures.

## Stack

| Layer | Technology |
|-------|-----------|
| Shell | Tauri v2 |
| Frontend | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Document format | SVG (the document *is* the display) |
| Canvas | SVG element managed imperatively via React refs |
| Testing | Vitest + Testing Library |

## Development

### Prerequisites

- Node.js 20+
- Rust toolchain (for Tauri)
- Linux: `libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev libappindicator3-dev`

### Setup

```bash
npm install
```

### Run (frontend only)

```bash
npm run dev
```

Open `http://localhost:5173` in a browser. This is the primary development workflow.

### Run (with Tauri)

```bash
npm run tauri dev
```

### Test

```bash
npm test            # single run
npm run test:watch  # watch mode
```

### Build

```bash
npm run build       # frontend only
npm run tauri build  # full app bundle
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
