// Atrium icon system — ported verbatim from
// design/unpacked/design_handoff_vectorfeld/icons.jsx.
//
// 28-glyph dictionary on a 20x20 grid rendered at 20-24px in chrome.
// Three render systems share the same geometry; "hairline" is v1 default:
//   hairline: 1.25px monoline, rounded caps/joins, no fill
//   duotone:  1px stroke + tinted fill
//   stamped:  1.6px stroke + tiny registration dot accent
import type { ReactNode } from 'react'

export const IconTheme = {
  ink: 'oklch(26% 0.025 145)',
  inkSoft: 'oklch(42% 0.03 145)',
  paper: 'oklch(96% 0.018 90)',
  tint: 'oklch(85% 0.045 25)',
  dot: 'oklch(60% 0.09 25)',
}

export type IconSystem = 'hairline' | 'duotone' | 'stamped'

export interface IconDef {
  stroke: ReactNode
  fill?: ReactNode
  dot?: ReactNode
}

const L = (d: string) => <path d={d} />
const C = (cx: number, cy: number, r: number) => <circle cx={cx} cy={cy} r={r} />
const R = (x: number, y: number, w: number, h: number, rx = 0) => (
  <rect x={x} y={y} width={w} height={h} rx={rx} />
)
const dot = (cx: number, cy: number, r = 0.9) => <circle cx={cx} cy={cy} r={r} />

const ICONS_RAW = {
  // Selection
  select: {
    stroke: <>{L('M5.5 3v12.5l3.2-3 2 4.5 1.8-.8-2-4.5 4.2-.2z')}</>,
    fill: <>{L('M5.5 3v12.5l3.2-3 2 4.5 1.8-.8-2-4.5 4.2-.2z')}</>,
    dot: dot(5.5, 3),
  },
  directSelect: {
    stroke: (
      <>
        {L('M6 4v11l2.6-2.5 1.7 3.8 1.5-.7-1.7-3.7 3.4-.2z')}
        {R(5, 3, 2, 2)}
      </>
    ),
    fill: <>{L('M6 4v11l2.6-2.5 1.7 3.8 1.5-.7-1.7-3.7 3.4-.2z')}</>,
    dot: dot(6, 15),
  },
  lasso: {
    stroke: (
      <>
        {L('M4 8c0-3 3-4.5 6-4.5s6 1.8 6 4.5-3 4.5-6 4.5c-1.5 0-3-.4-4-1.1')}
        {L('M6 11.5l-2 5 3-1')}
      </>
    ),
    fill: <>{L('M4 8c0-3 3-4.5 6-4.5s6 1.8 6 4.5-3 4.5-6 4.5c-1.5 0-3-.4-4-1.1L6 11.5l-2 5 3-1z')}</>,
    dot: dot(4, 16.5),
  },

  // Drawing primitives
  pen: {
    stroke: (
      <>
        {L('M3 17l3-1 8-8-2-2-8 8z')}
        {L('M12 6l2 2')}
        {L('M4 15l1 1')}
      </>
    ),
    fill: <>{L('M3 17l3-1 8-8-2-2-8 8z')}</>,
    dot: dot(14, 6),
  },
  pencil: {
    stroke: (
      <>
        {L('M4 16l1.5-3.5 7.5-7.5 2 2-7.5 7.5z')}
        {L('M11 7l2 2')}
      </>
    ),
    fill: <>{L('M4 16l1.5-3.5 7.5-7.5 2 2-7.5 7.5z')}</>,
    dot: dot(15, 5),
  },
  brush: {
    stroke: (
      <>
        {L('M17.5 2.5 C 15 4 12 7 10 9 L 11 10 C 13 8 16 5 17.5 2.5 Z')}
        {L('M10 9 L 8 11 L 9 12 L 11 10 Z')}
        {L('M8 11 C 6 12 5 14 5 15 C 5 16.5 4.5 17.5 3 18 C 4.5 18 6 17.5 7 16.5 C 8 15.5 8.5 14 9 12 Z')}
      </>
    ),
    fill: (
      <>
        {L('M17.5 2.5 C 15 4 12 7 10 9 L 11 10 C 13 8 16 5 17.5 2.5 Z')}
        {L('M8 11 C 6 12 5 14 5 15 C 5 16.5 4.5 17.5 3 18 C 4.5 18 6 17.5 7 16.5 C 8 15.5 8.5 14 9 12 Z')}
      </>
    ),
    dot: dot(17.5, 2.5, 0.7),
  },
  text: {
    stroke: (
      <>
        {L('M4 4h12')}
        {L('M10 4v12')}
        {L('M7.5 16h5')}
      </>
    ),
  },
  typeArea: {
    stroke: (
      <>
        {R(3, 5, 14, 10, 0.8)}
        {L('M6 8h8')}
        {L('M6 11h6')}
      </>
    ),
    fill: <>{R(3, 5, 14, 10, 0.8)}</>,
  },

  // Shapes
  rect: {
    stroke: <>{R(3, 4.5, 14, 11, 1.2)}</>,
    fill: <>{R(3, 4.5, 14, 11, 1.2)}</>,
  },
  ellipse: {
    stroke: <>{C(10, 10, 6.5)}</>,
    fill: <>{C(10, 10, 6.5)}</>,
  },
  polygon: {
    stroke: <>{L('M10 3l6 4-2.3 7h-7.4L4 7z')}</>,
    fill: <>{L('M10 3l6 4-2.3 7h-7.4L4 7z')}</>,
  },
  star: {
    stroke: <>{L('M10 3l2 4 4.5.5-3.3 3 .8 4.5-4-2.2-4 2.2.8-4.5-3.3-3L8 7z')}</>,
    fill: <>{L('M10 3l2 4 4.5.5-3.3 3 .8 4.5-4-2.2-4 2.2.8-4.5-3.3-3L8 7z')}</>,
  },
  line: {
    stroke: (
      <>
        {L('M4 16l12-12')}
        {C(4, 16, 0.8)}
        {C(16, 4, 0.8)}
      </>
    ),
  },
  arc: {
    stroke: (
      <>
        {L('M4 16c0-6 4-10 12-10')}
        {C(4, 16, 0.8)}
        {C(16, 6, 0.8)}
      </>
    ),
  },

  // Transform
  rotate: {
    stroke: (
      <>
        {L('M15 6a6 6 0 1 0 1 5')}
        {L('M16 3v4h-4')}
      </>
    ),
    dot: dot(10, 10),
  },
  scale: {
    stroke: (
      <>
        {L('M4 11v5h5')}
        {L('M16 9V4h-5')}
        {L('M4 16l12-12')}
      </>
    ),
  },
  reflect: {
    stroke: (
      <>
        {L('M10 3v14')}
        {L('M3 6l4 4-4 4')}
        {L('M17 6l-4 4 4 4')}
      </>
    ),
    fill: <>{L('M3 6l4 4-4 4z')}</>,
  },
  shear: {
    stroke: (
      <>
        {L('M5 16h10')}
        {L('M8 16l3-10')}
        {L('M14 6H4')}
        {L('M11 6l-3 10')}
      </>
    ),
    fill: <>{L('M4 6h10l-3 10H5z')}</>,
  },

  // Path ops
  scissors: {
    stroke: (
      <>
        {C(5, 14, 2)}
        {C(15, 14, 2)}
        {L('M6.5 12.5l10-9')}
        {L('M13.5 12.5l-10-9')}
      </>
    ),
    dot: dot(10, 8),
  },
  knife: {
    stroke: (
      <>
        {L('M3 16l10-10 4 4-10 10z')}
        {L('M3 16l3 0')}
      </>
    ),
    fill: <>{L('M3 16l10-10 4 4-10 10z')}</>,
  },
  shapeBuilder: {
    stroke: (
      <>
        {C(7.5, 10, 4)}
        {C(12.5, 10, 4)}
        {L('M10 10l2 1')}
      </>
    ),
    fill: (
      <>
        <path d="M7.5 6a4 4 0 0 1 0 8 4 4 0 0 1 0-8z" />
      </>
    ),
    dot: dot(10, 10),
  },
  pathfinder: {
    stroke: (
      <>
        {R(3, 5, 8, 8, 0.5)}
        {R(9, 7, 8, 8, 0.5)}
      </>
    ),
    fill: <>{R(9, 7, 2, 6)}</>,
  },
  join: {
    stroke: (
      <>
        {L('M3 10c0-3 3-5 5-5')}
        {L('M17 10c0-3-3-5-5-5')}
        {C(8, 5, 0.8)}
        {C(12, 5, 0.8)}
        {L('M3 14h14')}
      </>
    ),
    dot: dot(10, 5),
  },

  // Color / fill
  fill: {
    stroke: (
      <>
        {L('M4 11l6-7 7 7-4 4H6z')}
        {L('M14 14c1 1.5 2 2.5 2 3a1.5 1.5 0 0 1-3 0c0-.5 1-1.5 1-3z')}
      </>
    ),
    fill: <>{L('M4 11l6-7 7 7-4 4H6z')}</>,
    dot: dot(15, 16),
  },
  gradient: {
    stroke: (
      <>
        {R(3, 5, 14, 10, 1)}
        {L('M3 5l14 10')}
      </>
    ),
    fill: <>{R(3, 5, 14, 10, 1)}</>,
  },
  eyedropper: {
    stroke: (
      <>
        <ellipse cx="10" cy="4" rx="2.5" ry="1.8" />
        {L('M10 6v2')}
        {L('M8 8h4v6a2 2 0 0 1-4 0z')}
        {L('M9.5 16v2')}
      </>
    ),
    fill: <>{L('M8 8h4v6a2 2 0 0 1-4 0z')}</>,
    dot: dot(10, 18, 0.7),
  },
  mesh: {
    stroke: (
      <>
        {R(3, 3, 14, 14, 0.5)}
        {L('M10 3v14')}
        {L('M3 10h14')}
        {C(10, 10, 0.8)}
      </>
    ),
    dot: dot(10, 10),
  },
  blend: {
    stroke: (
      <>
        {C(7, 10, 3.5)}
        {C(13, 10, 3.5)}
      </>
    ),
    fill: (
      <>
        <path d="M7 6.5a3.5 3.5 0 0 1 0 7 3.5 3.5 0 0 1 0-7z" />
      </>
    ),
  },

  // Canvas / view
  hand: {
    stroke: (
      <>
        {L('M6 10V6a1.2 1.2 0 1 1 2.4 0v4')}
        {L('M8.4 10V5a1.2 1.2 0 1 1 2.4 0v5')}
        {L('M10.8 10V6a1.2 1.2 0 1 1 2.4 0v4')}
        {L('M13.2 10V8a1.2 1.2 0 1 1 2.4 0v3.5c0 3-2 5.5-5 5.5-2 0-3.5-1-4.5-3l-2-4c-.5-1 .5-2 1.5-1.3L6 10')}
      </>
    ),
    fill: (
      <>
        <path d="M13.2 8c.7 0 1.2.5 1.2 1.2V11c0 3-2 5.5-5 5.5-2 0-3.5-1-4.5-3l-2-4c-.5-1 .5-2 1.5-1.3L6 10V6a1.2 1.2 0 0 1 2.4 0v4V5a1.2 1.2 0 0 1 2.4 0v5V6a1.2 1.2 0 0 1 2.4 0v2z" />
      </>
    ),
  },
  zoom: {
    stroke: (
      <>
        {C(9, 9, 5)}
        {L('M13 13l4 4')}
        {L('M9 7v4')}
        {L('M7 9h4')}
      </>
    ),
    dot: dot(16, 16),
  },
  artboard: {
    stroke: (
      <>
        {R(4, 5, 12, 10, 0.5)}
        {L('M2 5h2')}
        {L('M16 5h2')}
        {L('M2 15h2')}
        {L('M16 15h2')}
      </>
    ),
    fill: <>{R(4, 5, 12, 10, 0.5)}</>,
  },
  slice: {
    stroke: (
      <>
        {R(3, 3, 14, 14, 0.3)}
        {L('M3 10h5')}
        {L('M12 10h5')}
        {L('M10 3v5')}
        {L('M10 12v5')}
      </>
    ),
  },
  ruler: {
    stroke: (
      <>
        {R(3, 7, 14, 6, 0.6)}
        {L('M6 7v2')}
        {L('M9 7v3')}
        {L('M12 7v2')}
        {L('M15 7v3')}
      </>
    ),
    fill: <>{R(3, 7, 14, 6, 0.6)}</>,
  },

  // Effects / misc
  erase: {
    stroke: (
      <>
        {L('M12 3l5 5-7 8H5l-2-2z')}
        {L('M5 16h10')}
      </>
    ),
    fill: <>{L('M12 3l5 5-7 8H5l-2-2z')}</>,
  },
  warp: {
    stroke: (
      <>
        {L('M3 10c2-3 5-3 7 0s5 3 7 0')}
        {L('M3 14c2-3 5-3 7 0s5 3 7 0')}
        {L('M3 6c2-3 5-3 7 0s5 3 7 0')}
      </>
    ),
  },
  width: {
    stroke: (
      <>
        {L('M4 10h12')}
        {L('M3 6l2 4-2 4')}
        {L('M17 6l-2 4 2 4')}
        {L('M8 8h4')}
        {L('M7 12h6')}
      </>
    ),
    fill: (
      <>
        {L('M3 6l2 4-2 4z')}
        {L('M17 6l-2 4 2 4z')}
      </>
    ),
  },
  symbolSpray: {
    stroke: (
      <>
        {C(6, 6, 1.3)}
        {C(13, 7, 1)}
        {C(10, 11, 1.6)}
        {C(15, 13, 1.1)}
        {C(6, 14, 1.3)}
      </>
    ),
    fill: (
      <>
        {C(6, 6, 1.3)}
        {C(13, 7, 1)}
        {C(10, 11, 1.6)}
        {C(15, 13, 1.1)}
        {C(6, 14, 1.3)}
      </>
    ),
  },
} satisfies Record<string, IconDef>

export type IconName = keyof typeof ICONS_RAW
export const ICONS: Record<IconName, IconDef> = ICONS_RAW

export const IconLabels: Record<IconName, string> = {
  select: 'Select', directSelect: 'Direct select', lasso: 'Lasso',
  pen: 'Pen', pencil: 'Pencil', brush: 'Brush', text: 'Type', typeArea: 'Type area',
  rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star',
  line: 'Line', arc: 'Arc',
  rotate: 'Rotate', scale: 'Scale', reflect: 'Reflect', shear: 'Shear',
  scissors: 'Scissors', knife: 'Knife', shapeBuilder: 'Shape builder',
  pathfinder: 'Pathfinder', join: 'Join',
  fill: 'Fill', gradient: 'Gradient', eyedropper: 'Eyedropper', mesh: 'Mesh', blend: 'Blend',
  hand: 'Hand', zoom: 'Zoom', artboard: 'Artboard', slice: 'Slice', ruler: 'Ruler',
  erase: 'Erase', warp: 'Warp', width: 'Width', symbolSpray: 'Symbol spray',
}

interface IconGlyphProps {
  name: IconName
  system?: IconSystem
  size?: number
}

export function IconGlyph({ name, system = 'hairline', size = 20 }: IconGlyphProps) {
  const def = ICONS[name]
  if (!def) {
    return <span style={{ fontSize: 9, color: 'red' }}>{String(name)}?</span>
  }

  const strokeW = system === 'stamped' ? 1.6 : system === 'duotone' ? 1 : 1.25
  const strokeColor = IconTheme.ink
  const fillColor = system === 'duotone' ? IconTheme.tint : 'none'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {system === 'duotone' && def.fill && (
        <g fill={fillColor} stroke="none">{def.fill}</g>
      )}
      <g stroke={strokeColor} strokeWidth={strokeW} fill="none">
        {def.stroke}
      </g>
      {system === 'stamped' && def.dot && (
        <g fill={IconTheme.dot} stroke="none">{def.dot}</g>
      )}
    </svg>
  )
}
