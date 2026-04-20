/**
 * Heuristic analysis of an imported SVG (typically from PDF).
 *
 * Drives the user-facing "mostly outlined" warning for PDFs whose text was
 * outlined to paths at PDF-generation time (commonly: designer "outline
 * fonts before delivery" for print PDFs). MuPDF and pdfjs-dist both fail
 * to recover such text — there's nothing to recover, the source PDF has
 * no semantic text representation. Without OCR we can't make it editable.
 *
 * Detection signal: many <path> elements + few <text> chars. The threshold
 * is intentionally generous to false-positive on pure line drawings (which
 * have no editable text by definition, so the "this PDF has no editable
 * text" message is still semantically right).
 *
 * See vectorfeld-cd2 for the empirical investigation that informed this.
 */

export interface ImportAnalysis {
  /** Total non-whitespace-trimmed characters across all <text> descendants. */
  textChars: number
  /** Count of <path> descendants. */
  pathCount: number
  /** True when the imported tree is dominated by paths with little semantic
   *  text — typical of outlined-fonts PDFs and pure line drawings. */
  mostlyOutlined: boolean
}

/** Below this many paths the document is too small to draw conclusions
 *  about outlining vs. ordinary content. Avoids false positives on simple
 *  shape-only docs. */
const MIN_PATH_COUNT = 20

/** Path-to-text-char ratio above which we consider the document mostly
 *  outlined. Calibrated against real fixtures: yellow-BG flyer (225 paths
 *  / 15 chars = 15) flags; noheader flyer (119 paths / 892 chars = 0.13)
 *  doesn't. Threshold of 0.5 (paths >= chars * 0.5, equiv. chars < paths * 2)
 *  splits these cleanly. */
const PATHS_PER_CHAR_THRESHOLD = 2

export function analyzeImportedSvg(root: Element): ImportAnalysis {
  let textChars = 0
  for (const t of root.querySelectorAll('text')) {
    textChars += (t.textContent || '').trim().length
  }
  const pathCount = root.querySelectorAll('path').length
  const mostlyOutlined =
    pathCount >= MIN_PATH_COUNT && textChars < pathCount * PATHS_PER_CHAR_THRESHOLD
  return { textChars, pathCount, mostlyOutlined }
}
