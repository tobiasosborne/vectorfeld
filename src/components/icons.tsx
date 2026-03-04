import type { ReactNode } from 'react'

const S = { display: 'block' } as const

// Selection arrow — solid black pointer
export const SelectIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={S}>
    <path d="M4 2v14l3.5-3.5 2.5 5 2-1-2.5-5H15z" />
  </svg>
)

// Direct select — white pointer with hollow anchor point
export const DirectSelectIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" style={S}>
    <path d="M4 2v14l3.5-3.5 2.5 5 2-1-2.5-5H15z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <rect x="3" y="1" width="3" height="3" fill="currentColor" rx="0.3" />
  </svg>
)

// Pen tool — fountain pen nib
export const PenIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={S}>
    <path d="M10 2L7 12l-1 4 2 2 4-1L15 8zm0 3l2.5 6H7.5z" fillRule="evenodd" />
    <rect x="8.5" y="14" width="3" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)

// Line segment tool
export const LineIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={S}>
    <line x1="3" y1="17" x2="17" y2="3" />
  </svg>
)

// Rectangle tool
export const RectIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" style={S}>
    <rect x="3" y="4" width="14" height="12" rx="0.5" />
  </svg>
)

// Ellipse tool
export const EllipseIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" style={S}>
    <ellipse cx="10" cy="10" rx="7" ry="6" />
  </svg>
)

// Text tool — serif T
export const TextIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={S}>
    <path d="M5 4h10v2.5h-1V5.5H11V15h1.5v1h-5v-1H9V5.5H6V6.5H5z" />
  </svg>
)

// Eraser tool
export const EraserIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" style={S}>
    <path d="M12 3l5 5-7 8H5l-2-2z" />
    <line x1="7" y1="8" x2="12" y2="13" />
    <path d="M5 16h10" strokeLinecap="round" />
  </svg>
)

// Eyedropper tool
export const EyedropperIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={S}>
    <path d="M15 3l2 2-2 2-1.5-1.5L8 11l-1 3-3 1 1-3 3-1 5.5-5.5z" />
    <circle cx="16" cy="3" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

// Pencil freehand tool
export const PencilIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={S}>
    <path d="M3 17l1.5-5L15 3l2 2L8 15.5z" />
    <line x1="4.5" y1="12" x2="7" y2="14.5" />
    <path d="M3 17l0.5-2" />
  </svg>
)

// Measure tool — ruler with dimension arrows
export const MeasureIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" style={S}>
    <line x1="3" y1="16" x2="17" y2="4" />
    <path d="M3 16l2-1M3 16l1-2" />
    <path d="M17 4l-2 1M17 4l-1 2" />
    <line x1="6" y1="13" x2="7.5" y2="11.5" strokeWidth="1" opacity="0.5" />
    <line x1="9" y1="10" x2="10.5" y2="8.5" strokeWidth="1" opacity="0.5" />
    <line x1="12" y1="7" x2="13.5" y2="5.5" strokeWidth="1" opacity="0.5" />
  </svg>
)

// Lasso tool
export const LassoIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={S}>
    <path d="M3 8C2 3 10 1 14 4C18 7 17 13 12 14C9 15 7 13 8 11" />
    <circle cx="8" cy="14" r="2.5" />
    <line x1="6.5" y1="16" x2="5" y2="19" />
  </svg>
)

// Knife tool
export const KnifeIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={S}>
    <path d="M5 16L15 4" />
    <path d="M14 3L17 4L15 6" />
    <line x1="3" y1="18" x2="5" y2="16" strokeWidth="2.5" />
  </svg>
)

// Scissors tool
export const ScissorsIcon: ReactNode = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={S}>
    <circle cx="6" cy="5" r="2.5" />
    <circle cx="6" cy="15" r="2.5" />
    <line x1="8" y1="6.8" x2="17" y2="15" />
    <line x1="8" y1="13.2" x2="17" y2="5" />
  </svg>
)

export const TOOL_ICONS: Record<string, ReactNode> = {
  select: SelectIcon,
  line: LineIcon,
  rectangle: RectIcon,
  ellipse: EllipseIcon,
  pen: PenIcon,
  text: TextIcon,
  eraser: EraserIcon,
  'direct-select': DirectSelectIcon,
  eyedropper: EyedropperIcon,
  pencil: PencilIcon,
  measure: MeasureIcon,
  scissors: ScissorsIcon,
  knife: KnifeIcon,
  lasso: LassoIcon,
}
