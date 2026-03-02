import type { ReactNode } from 'react'

const iconStyle = { display: 'block' }

export const SelectIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={iconStyle}>
    <path d="M3 1L3 14L7 10L10 15L12 14L9 9L14 8Z" />
  </svg>
)

export const LineIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={iconStyle}>
    <line x1="2" y1="14" x2="14" y2="2" />
  </svg>
)

export const RectIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
    <rect x="2" y="3" width="12" height="10" rx="0.5" />
  </svg>
)

export const EllipseIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
    <ellipse cx="8" cy="8" rx="6" ry="5" />
  </svg>
)

export const PenIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
    <path d="M2 14C4 8 6 4 8 6C10 8 12 2 14 2" />
    <circle cx="2" cy="14" r="1.5" fill="currentColor" />
  </svg>
)

export const TextIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={iconStyle}>
    <text x="3" y="13" fontSize="14" fontWeight="bold" fontFamily="serif">T</text>
  </svg>
)

export const EraserIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
    <path d="M10 3L14 7L8 13H4L2 11L10 3Z" />
    <line x1="6" y1="7" x2="10" y2="11" />
  </svg>
)

export const DirectSelectIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={iconStyle}>
    <path d="M3 2L3 13L6.5 10L9.5 14L11 13L8 9L12.5 8Z" />
    <rect x="2" y="1" width="2" height="2" fill="currentColor" stroke="none" />
  </svg>
)

export const EyedropperIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
    <path d="M13 2L14 3L10 7L8 9L6 10L7 8L9 6L13 2Z" />
    <path d="M6 10L3 13" />
    <circle cx="13.5" cy="2.5" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const PencilIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
    <path d="M2 14L3 10L12 2L14 4L5 13Z" />
    <line x1="3" y1="10" x2="5" y2="13" />
  </svg>
)

export const MeasureIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={iconStyle}>
    <line x1="2" y1="13" x2="14" y2="3" />
    <line x1="2" y1="13" x2="2" y2="10" />
    <line x1="2" y1="13" x2="5" y2="13" />
    <line x1="14" y1="3" x2="14" y2="6" />
    <line x1="14" y1="3" x2="11" y2="3" />
  </svg>
)

export const ScissorsIcon: ReactNode = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={iconStyle}>
    <circle cx="5" cy="4" r="2.5" />
    <circle cx="5" cy="12" r="2.5" />
    <line x1="7" y1="5.5" x2="14" y2="12" />
    <line x1="7" y1="10.5" x2="14" y2="4" />
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
}
