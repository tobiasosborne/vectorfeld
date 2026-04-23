import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const indexCss = readFileSync(resolve(here, '..', '..', 'src', 'index.css'), 'utf8')

// Atrium (default) palette — the tokens that must appear in @theme.
// Values are verbatim from design/unpacked/design_handoff_vectorfeld/atrium.jsx.
const atriumTokens: Array<[string, string]> = [
  ['--color-bg', 'oklch(96% 0.01 80)'],
  ['--color-canvas-tint', 'oklch(94% 0.018 75)'],
  ['--color-panel', 'rgba(255, 253, 249, 0.78)'],
  ['--color-panel-solid', 'oklch(98% 0.005 80)'],
  ['--color-border', 'rgba(60, 40, 20, 0.08)'],
  ['--color-border-strong', 'rgba(60, 40, 20, 0.14)'],
  ['--color-text', 'oklch(24% 0.02 70)'],
  ['--color-muted', 'oklch(52% 0.02 70)'],
  ['--color-faint', 'oklch(68% 0.02 70)'],
  ['--color-accent', 'oklch(64% 0.18 35)'],
  ['--color-accent-tint', 'oklch(94% 0.04 35)'],
  ['--color-accent-text', 'oklch(44% 0.17 35)'],
  ['--blur-panel', 'saturate(1.2) blur(18px)'],
  ['--radius-panel', '14px'],
  ['--shadow-panel', '0 10px 30px -16px rgba(60,40,20,0.14)'],
]

describe('Atrium theme tokens in src/index.css', () => {
  for (const [name, value] of atriumTokens) {
    it(`declares ${name}: ${value}`, () => {
      expect(indexCss).toContain(`${name}: ${value}`)
    })
  }

  it('retains --color-artboard for the artboard fill', () => {
    expect(indexCss).toMatch(/--color-artboard:\s*#ffffff/)
  })

  it('does not ship legacy chrome-* tokens anymore', () => {
    expect(indexCss).not.toContain('--color-chrome-')
  })

  it('does not ship legacy blue accent anymore', () => {
    expect(indexCss).not.toContain('#2563eb')
    expect(indexCss).not.toContain('#3b82f6')
  })
})
