# PDF Export Research

## Decision: svg2pdf.js + jsPDF

### Options Evaluated

1. **svg2pdf.js + jsPDF** (chosen)
   - Pure JS, client-side
   - Good SVG feature coverage (text, paths, transforms, markers)
   - ~100KB bundle impact
   - MIT licensed

2. **Tauri backend (rsvg-convert)**
   - Not applicable — vectorfeld runs as a Vite+React web app
   - Would require adding Tauri dependency

3. **pdf-lib**
   - Lower-level, would require manual SVG-to-PDF path translation
   - No built-in SVG parsing

### Implementation Notes
- Install: `npm install jspdf svg2pdf.js`
- Clean SVG before conversion (strip overlays, previews)
- Set PDF dimensions to match SVG viewBox
