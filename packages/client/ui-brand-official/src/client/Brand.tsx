import { useId } from 'react'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the DeepSeek Client mark with the presentation requested by its host surface: the
 * application icon's interlocked rings without their tile, so the mark sits on the sidebar's own
 * surface in both themes.
 *
 * The front ring is masked open at its upper crossing so the back ring passes through it there.
 * The mask id is per instance because the mark renders more than once (collapsed and expanded rail).
 * @param props - Host-supplied mark presentation.
 * @returns the DeepSeek Client mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  const cut = `dsh-client-mark-${useId().replace(/[^A-Za-z0-9_-]/gu, '')}`
  return (
    <svg width={size} height={size} viewBox="256 254 516 516" fill="none" aria-hidden="true">
      <mask id={cut} maskUnits="userSpaceOnUse" x="256" y="254" width="516" height="516">
        <rect x="256" y="254" width="516" height="516" fill="#fff" />
        <circle cx="512" cy="390.5" r="34" fill="#000" />
      </mask>
      <circle cx="424" cy="512" r="150" stroke="#8e96a6" strokeWidth="34" strokeOpacity="0.75" />
      <circle cx="600" cy="512" r="150" stroke="#5b7cff" strokeWidth="44" mask={`url(#${cut})`} />
    </svg>
  )
}

/**
 * Render the product name without its independently slotted mark. Plain text in the inherited
 * colour, so it follows the sidebar's theme and the platform UI font.
 * @returns the DeepSeek Client name.
 */
export function OfficialBrandName() {
  return (
    <span style={{ fontSize: 15, fontWeight: 600, lineHeight: '24px', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
      DeepSeek Client
    </span>
  )
}
