/**
 * Per-element attribute snapshots for source-PDF mutation detection.
 *
 * `snapshotImportedElements(layer)` is called once at import time, after
 * `tagImportedLayer` has stamped `data-src-*` on every leaf. It walks the
 * layer and records a frozen attribute map for every tagged element.
 *
 * `isElementModified(el)` and `findModifiedSourceElements(layer)` consult
 * that snapshot at export time so the graft engine (`vectorfeld-wjj`) can
 * decide per-element: graft the source bytes, or emit a mask + re-render
 * overlay because the user has edited the element.
 *
 * Storage: a module-level `WeakMap<Element, Map<string, string>>`. WeakMap
 * means snapshots are garbage-collected when the element leaves the DOM —
 * no manual lifecycle, no leaks across documents.
 *
 * Scope: ATTRIBUTE-only. Text content changes are tracked at the
 * Command level (see `Command.touchesSource`); duplicating that signal
 * here would cost re-walking textContent on every comparison without
 * adding correctness for the canonical edit path.
 */

import { isFromSource } from './sourceTagging'

const snapshots: WeakMap<Element, Map<string, string>> = new WeakMap()

function captureAttributes(el: Element): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of Array.from(el.attributes)) {
    m.set(a.name, a.value)
  }
  return m
}

/** Snapshot every tagged source element under `layer` (including the layer
 *  itself if it carries source attrs — though normally only leaves do). */
export function snapshotImportedElements(layer: Element): void {
  walk(layer)
}

function walk(node: Element): void {
  if (isFromSource(node)) {
    snapshots.set(node, captureAttributes(node))
  }
  for (const child of Array.from(node.children)) {
    walk(child)
  }
}

/** True iff this element was snapshot during import (tagged source content). */
export function hasSnapshot(el: Element): boolean {
  return snapshots.has(el)
}

/** True iff `el` has a snapshot AND its current attribute set differs from
 *  the snapshot. False for untagged / never-imported elements (treated as
 *  new content, never "modified"). */
export function isElementModified(el: Element): boolean {
  const snap = snapshots.get(el)
  if (!snap) return false

  const currentAttrs = el.attributes
  if (currentAttrs.length !== snap.size) return true

  for (const a of Array.from(currentAttrs)) {
    if (snap.get(a.name) !== a.value) return true
  }
  return false
}

/** Walk `layer` in DOM order, returning every snapshot-tagged element whose
 *  current attributes differ from its snapshot. */
export function findModifiedSourceElements(layer: Element): Element[] {
  const out: Element[] = []
  collect(layer, out)
  return out
}

function collect(node: Element, out: Element[]): void {
  if (snapshots.has(node) && isElementModified(node)) {
    out.push(node)
  }
  for (const child of Array.from(node.children)) {
    collect(child, out)
  }
}
