import { describe, it, expect } from 'vitest'
import { defaultAtrium, birrenSage, birrenPeach, sodiumVapor, palettes, type Palette } from '../../src/theme/atrium'

const requiredKeys: Array<keyof Palette> = [
  'bg', 'canvasTint', 'panel', 'panelSolid',
  'border', 'borderStrong',
  'text', 'muted', 'faint',
  'accent', 'accentTint', 'accentText',
  'blur',
]

describe('Atrium palette module', () => {
  it('exports defaultAtrium with every required key', () => {
    for (const k of requiredKeys) expect(defaultAtrium[k]).toBeTruthy()
  })

  it('defaultAtrium accent is the warm coral', () => {
    expect(defaultAtrium.accent).toBe('oklch(64% 0.18 35)')
  })

  it('defaultAtrium panel is the translucent warm off-white', () => {
    expect(defaultAtrium.panel).toBe('rgba(255, 253, 249, 0.78)')
  })

  it('birrenSage, birrenPeach, sodiumVapor all export every required key', () => {
    for (const p of [birrenSage, birrenPeach, sodiumVapor]) {
      for (const k of requiredKeys) expect(p[k]).toBeTruthy()
    }
  })

  it('exports palettes record keyed by theme id', () => {
    expect(Object.keys(palettes).sort()).toEqual(
      ['birrenPeach', 'birrenSage', 'defaultAtrium', 'sodiumVapor'].sort(),
    )
    expect(palettes.defaultAtrium).toBe(defaultAtrium)
  })
})
