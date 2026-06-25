import type { Command } from './commands'
import { getArtboards, updateArtboard } from './artboard'

export interface ArtboardSize {
  width: number
  height: number
}

/**
 * Resize a single artboard through the undo/redo history.
 *
 * Background (vectorfeld-3yu.10): Document Setup "Apply" used to call only
 * `setDimensions` (React state). That never touched the artboard MODEL that
 * Canvas actually renders from (`getArtboards()` / `computeDocumentBounds()`),
 * so the page never resized. This command mutates the model via
 * `updateArtboard()`, which re-runs `layout()` + `notify()` — the artboard rect
 * re-syncs and `computeDocumentBounds()` reports the new size, so the rendered
 * page (and the dimensions-keyed viewBox recompute) follow.
 *
 * The target is resolved by id (App resolves it via `getActiveArtboard().id`).
 * `prev` is captured at construction so undo/redo are exact and idempotent.
 */
export class ResizeArtboardCommand implements Command {
  readonly description = 'Resize Artboard'
  private readonly id: string
  private readonly next: ArtboardSize
  private readonly prev: ArtboardSize | null

  constructor(id: string, next: ArtboardSize) {
    this.id = id
    this.next = { width: next.width, height: next.height }
    const ab = getArtboards().find((a) => a.id === id) ?? null
    this.prev = ab ? { width: ab.width, height: ab.height } : null
  }

  execute(): void {
    updateArtboard(this.id, { width: this.next.width, height: this.next.height })
  }

  undo(): void {
    // Guard: nothing to restore if the target was missing at construction.
    if (!this.prev) return
    updateArtboard(this.id, { width: this.prev.width, height: this.prev.height })
  }
}
