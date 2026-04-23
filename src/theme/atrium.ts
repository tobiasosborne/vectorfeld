// Atrium palette definitions, ported verbatim from
// design/unpacked/design_handoff_vectorfeld/atrium.jsx.
// V1 ships defaultAtrium only; the others exist for a future theme switcher.

export interface Palette {
  bg: string
  canvasTint: string
  panel: string
  panelSolid: string
  border: string
  borderStrong: string
  text: string
  muted: string
  faint: string
  accent: string
  accentTint: string
  accentText: string
  blur: string
}

export const defaultAtrium: Palette = {
  bg: 'oklch(96% 0.01 80)',
  canvasTint: 'oklch(94% 0.018 75)',
  panel: 'rgba(255, 253, 249, 0.78)',
  panelSolid: 'oklch(98% 0.005 80)',
  border: 'rgba(60, 40, 20, 0.08)',
  borderStrong: 'rgba(60, 40, 20, 0.14)',
  text: 'oklch(24% 0.02 70)',
  muted: 'oklch(52% 0.02 70)',
  faint: 'oklch(68% 0.02 70)',
  accent: 'oklch(64% 0.18 35)',
  accentTint: 'oklch(94% 0.04 35)',
  accentText: 'oklch(44% 0.17 35)',
  blur: 'saturate(1.2) blur(18px)',
}

export const birrenSage: Palette = {
  bg: 'oklch(86% 0.025 155)',
  canvasTint: 'oklch(83% 0.028 155)',
  panel: 'rgba(246, 241, 228, 0.82)',
  panelSolid: 'oklch(96% 0.018 90)',
  border: 'rgba(40, 55, 35, 0.12)',
  borderStrong: 'rgba(40, 55, 35, 0.20)',
  text: 'oklch(26% 0.025 145)',
  muted: 'oklch(46% 0.025 145)',
  faint: 'oklch(62% 0.02 145)',
  accent: 'oklch(60% 0.09 25)',
  accentTint: 'oklch(90% 0.035 25)',
  accentText: 'oklch(42% 0.10 25)',
  blur: 'saturate(1.1) blur(18px)',
}

export const birrenPeach: Palette = {
  bg: 'oklch(91% 0.035 55)',
  canvasTint: 'oklch(89% 0.04 55)',
  panel: 'rgba(252, 246, 236, 0.82)',
  panelSolid: 'oklch(97% 0.012 75)',
  border: 'rgba(70, 45, 25, 0.10)',
  borderStrong: 'rgba(70, 45, 25, 0.18)',
  text: 'oklch(28% 0.035 50)',
  muted: 'oklch(48% 0.035 50)',
  faint: 'oklch(64% 0.025 50)',
  accent: 'oklch(52% 0.11 180)',
  accentTint: 'oklch(92% 0.03 180)',
  accentText: 'oklch(38% 0.11 180)',
  blur: 'saturate(1.15) blur(18px)',
}

export const sodiumVapor: Palette = {
  bg: 'oklch(22% 0.04 280)',
  canvasTint: 'oklch(26% 0.05 285)',
  panel: 'rgba(60, 42, 18, 0.72)',
  panelSolid: 'oklch(34% 0.07 75)',
  border: 'rgba(255, 190, 110, 0.16)',
  borderStrong: 'rgba(255, 190, 110, 0.30)',
  text: 'oklch(94% 0.04 80)',
  muted: 'oklch(78% 0.06 75)',
  faint: 'oklch(62% 0.05 75)',
  accent: 'oklch(72% 0.24 340)',
  accentTint: 'oklch(38% 0.12 340)',
  accentText: 'oklch(86% 0.14 340)',
  blur: 'saturate(1.4) blur(20px)',
}

export const palettes = {
  defaultAtrium,
  birrenSage,
  birrenPeach,
  sodiumVapor,
} as const

export type PaletteId = keyof typeof palettes
