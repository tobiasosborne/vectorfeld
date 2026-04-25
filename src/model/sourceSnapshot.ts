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
import { elementBboxMm } from './graftBbox'
import type { BBox } from './geometry'

const snapshots: WeakMap<Element, Map<string, string>> = new WeakMap()

/**
 * Per-layer registry of source-element snapshots — keyed by a synthetic
 * UID so we can detect removals AFTER the element leaves the DOM. The
 * WeakRef lets us notice GC while the entry survives until the LAYER
 * itself is GC'd (WeakMap key is the layer).
 *
 * Why a Map and not just the existing WeakMap<Element, attrs>: WeakMap
 * has no `.entries()`, so we can't enumerate snapshots for a layer to
 * find which ones are missing from the current DOM. Stamping a UID on
 * each element + carrying it in this side-table gives us that
 * enumeration without leaking memory across documents.
 */
interface ElementSnap {
  weakRef: WeakRef<Element>
  bboxMm: BBox
}
const layerSnapRegistry: WeakMap<Element, Map<string, ElementSnap>> = new WeakMap()
let nextSnapUid = 1

/** Layer attribute that records how many source-tagged elements existed at
 *  import time. Compared at export time against the current count to detect
 *  deletions — `findModifiedSourceElements` only sees what's still in the
 *  DOM, so removals are otherwise invisible. */
export const SOURCE_COUNT_ATTR = 'data-vf-source-count'

function captureAttributes(el: Element): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of Array.from(el.attributes)) {
    m.set(a.name, a.value)
  }
  return m
}

/** Snapshot every tagged source element under `layer` (including the layer
 *  itself if it carries source attrs — though normally only leaves do).
 *  Stamps `data-vf-source-count` on the layer with the snapshot count and
 *  populates the layer's snap-registry (used by `findRemovedElement-
 *  Bboxes` to locate elements that have left the DOM since import). */
export function snapshotImportedElements(layer: Element): void {
  let count = 0
  const registry = new Map<string, ElementSnap>()
  layerSnapRegistry.set(layer, registry)
  walk(layer)
  layer.setAttribute(SOURCE_COUNT_ATTR, String(count))

  function walk(node: Element): void {
    if (isFromSource(node)) {
      snapshots.set(node, captureAttributes(node))
      // Record the element's import-time bbox in the side-registry so
      // we can mask it out later if the user removes it. Containers and
      // any node whose bbox can't be computed contribute null bboxes
      // (which still count toward removal detection but emit no mask).
      const bboxMm = elementBboxMm(node) ?? { x: 0, y: 0, width: 0, height: 0 }
      const uid = `s${nextSnapUid++}`
      registry.set(uid, { weakRef: new WeakRef(node), bboxMm })
      count++
    }
    for (const child of Array.from(node.children)) {
      walk(child)
    }
  }
}

/** Bboxes (mm-space) of source elements that were snapshot during import
 *  but are no longer in the layer's subtree. Used by the graft engine to
 *  emit white-fill mask rects over the regions where deleted elements
 *  used to be — without this, the grafted source bytes would still
 *  paint the deleted content. */
export function findRemovedElementBboxes(layer: Element): BBox[] {
  const registry = layerSnapRegistry.get(layer)
  if (!registry) return []
  const removed: BBox[] = []
  for (const [, snap] of registry) {
    const el = snap.weakRef.deref()
    if (!el || !layer.contains(el)) {
      removed.push(snap.bboxMm)
    }
  }
  return removed
}

/** Number of source-tagged elements snapshot at import time. Returns 0 if
 *  the layer was never snapshot. */
export function expectedSourceCount(layer: Element): number {
  const s = layer.getAttribute(SOURCE_COUNT_ATTR)
  if (s === null) return 0
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : 0
}

/** Walk the layer and count source-tagged elements present in the DOM
 *  RIGHT NOW. Comparing this to expectedSourceCount tells you whether
 *  the user has removed any source elements. */
export function currentSourceCount(layer: Element): number {
  let count = 0
  function walk(node: Element): void {
    if (isFromSource(node)) count++
    for (const child of Array.from(node.children)) walk(child)
  }
  walk(layer)
  return count
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
