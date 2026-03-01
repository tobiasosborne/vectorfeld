import { getActiveLayerElement } from './activeLayer'

let nextId = 1

export function generateId(): string {
  return `vf-${nextId++}`
}

export function resetIdCounter(): void {
  nextId = 1
}

/** Advance the ID counter past all existing vf-N IDs in the given SVG */
export function syncIdCounter(svg: SVGSVGElement): void {
  let maxId = nextId
  const els = svg.querySelectorAll('[id^="vf-"]')
  for (const el of els) {
    const id = el.getAttribute('id')
    if (id) {
      const match = id.match(/^vf-(\d+)$/)
      if (match) {
        maxId = Math.max(maxId, parseInt(match[1], 10) + 1)
      }
    }
  }
  nextId = maxId
}

export interface DocumentModel {
  svg: SVGSVGElement
  addElement(parent: Element, tag: string, attrs: Record<string, string>): Element
  removeElement(el: Element): { parent: Element; nextSibling: Element | null }
  setAttribute(el: Element, attr: string, value: string): string | null
  getElement(id: string): Element | null
  serialize(): string
  getLayerElements(): Element[]
  getActiveLayer(): Element | null
  getDefs(): SVGDefsElement
}

export function createDocumentModel(svg: SVGSVGElement): DocumentModel {
  // Ensure <defs> exists as the first child (after artboard)
  let defsEl = svg.querySelector('defs') as SVGDefsElement | null
  if (!defsEl) {
    defsEl = document.createElementNS('http://www.w3.org/2000/svg', 'defs') as SVGDefsElement
    // Insert after artboard (first child), or as first child
    const artboard = svg.querySelector('[data-role="artboard"]')
    if (artboard && artboard.nextSibling) {
      svg.insertBefore(defsEl, artboard.nextSibling)
    } else {
      svg.insertBefore(defsEl, svg.firstChild)
    }
  }

  return {
    svg,

    addElement(parent: Element, tag: string, attrs: Record<string, string>): Element {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
      if (!attrs.id) {
        el.setAttribute('id', generateId())
      }
      for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value)
      }
      parent.appendChild(el)
      return el
    },

    removeElement(el: Element): { parent: Element; nextSibling: Element | null } {
      const parent = el.parentElement!
      const nextSibling = el.nextElementSibling
      parent.removeChild(el)
      return { parent, nextSibling }
    },

    setAttribute(el: Element, attr: string, value: string): string | null {
      const old = el.getAttribute(attr)
      el.setAttribute(attr, value)
      return old
    },

    getElement(id: string): Element | null {
      return svg.querySelector(`#${CSS.escape(id)}`)
    },

    serialize(): string {
      const serializer = new XMLSerializer()
      return serializer.serializeToString(svg)
    },

    getLayerElements(): Element[] {
      return Array.from(svg.querySelectorAll('g[data-layer-name]'))
    },

    getActiveLayer(): Element | null {
      const active = getActiveLayerElement()
      if (active && active.parentElement === svg) return active
      const layers = this.getLayerElements()
      return layers.length > 0 ? layers[0] : null
    },

    getDefs(): SVGDefsElement {
      return defsEl!
    },
  }
}
