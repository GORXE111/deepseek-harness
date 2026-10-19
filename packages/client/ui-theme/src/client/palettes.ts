/**
 * Colour palettes, custom accent, and conversation backdrops for the Appearance row.
 *
 * Palettes ship as token pairs rather than as registered themes: a theme id is the
 * light/dark preference, and a user who picks "Forest" still expects the light/dark
 * switch to keep working. Layering tokens over whichever base palette is active keeps
 * the two choices independent, which is why every palette carries both columns.
 *
 * The accent is layered last, so it wins over the palette's own accent.
 */
import { wallpaperId, wallpaperImageUrl } from '../wallpaper-paths.ts'
import type { ThemeTokenOverrides } from './index.ts'
import type { ThemeKey } from './locales.ts'

/** Palette slots, in the order they are written into the override layer. */
const TOKEN_KEYS = ['base', 'l1', 'l2', 'l3', 'primary', 'tertiary'] as const

type PaletteKey = typeof TOKEN_KEYS[number]

/** A full colour column (one per palette mode). */
type PaletteColumn = Record<PaletteKey, string>

/** Slot to alias-token mapping; a token rename lands here only. */
const TOKEN_MAP: Record<PaletteKey, string> = {
  base: '--dsw-alias-bg-base',
  l1: '--dsw-alias-bg-layer-1',
  l2: '--dsw-alias-bg-layer-2',
  l3: '--dsw-alias-bg-layer-3',
  primary: '--dsw-alias-state-business-primary',
  tertiary: '--dsw-alias-state-business-tertiary',
}

/** One selectable palette. */
export interface Palette {
  /** Persisted id. */
  id: string
  /** Swatch colour shown in the row. */
  swatch: string
  /** Row label key. */
  labelKey: ThemeKey
  /** Light column; absent on `default`, which keeps the stock palette. */
  light?: PaletteColumn
  /** Dark column; absent on `default`. */
  dark?: PaletteColumn
}

/** Selectable palettes, in row order. */
export const PALETTES: readonly Palette[] = [
  { id: 'default', swatch: '#5b7cff', labelKey: 'palette.default' },
  {
    id: 'warm',
    swatch: '#b5714a',
    labelKey: 'palette.warm',
    light: { base: '#faf6f2', l1: '#ffffff', l2: '#f5ede6', l3: '#efe4da', primary: '#b5714a', tertiary: '#f6e6da' },
    dark: { base: '#1a1613', l1: '#211c18', l2: '#272019', l3: '#2f261e', primary: '#d99b74', tertiary: '#3d2f24' },
  },
  {
    id: 'forest',
    swatch: '#3f8f6b',
    labelKey: 'palette.forest',
    light: { base: '#f4f9f6', l1: '#ffffff', l2: '#eaf3ee', l3: '#dfece5', primary: '#2f7d5b', tertiary: '#dcf0e5' },
    dark: { base: '#101815', l1: '#152019', l2: '#1a271f', l3: '#203026', primary: '#5cbf95', tertiary: '#1e3a2c' },
  },
  {
    id: 'midnight',
    swatch: '#5566c9',
    labelKey: 'palette.midnight',
    light: { base: '#f4f5fb', l1: '#ffffff', l2: '#ebedf7', l3: '#e0e4f2', primary: '#4553b8', tertiary: '#e2e6fb' },
    dark: { base: '#0c0e18', l1: '#11141f', l2: '#161a28', l3: '#1c2132', primary: '#8b9bff', tertiary: '#232a45' },
  },
  {
    id: 'sakura',
    swatch: '#d1698c',
    labelKey: 'palette.sakura',
    light: { base: '#fdf5f8', l1: '#ffffff', l2: '#f9ebf0', l3: '#f4dfe8', primary: '#c2557a', tertiary: '#fbe3ec' },
    dark: { base: '#1a1216', l1: '#20171b', l2: '#271c22', l3: '#2f222a', primary: '#eb8fae', tertiary: '#3d2530' },
  },
  {
    id: 'slate',
    swatch: '#64748b',
    labelKey: 'palette.slate',
    light: { base: '#f6f7f9', l1: '#ffffff', l2: '#eef0f4', l3: '#e3e7ed', primary: '#4a5568', tertiary: '#e6eaf1' },
    dark: { base: '#0f1115', l1: '#14171d', l2: '#191d25', l3: '#20252f', primary: '#94a3b8', tertiary: '#242b36' },
  },
]

/** A stored accent or legacy custom backdrop colour. */
const HEX = /^#[0-9a-fA-F]{6}$/u

/** One selectable conversation backdrop. */
export interface ChatPreset {
  /** Persisted id. */
  id: string
  /** Row label key. */
  labelKey: ThemeKey
  /** CSS `background` while the light palette is active; absent on `none`. */
  light?: string
  /** CSS `background` while the dark palette is active; absent on `none`. */
  dark?: string
}

/**
 * Backdrop presets, in row order.
 *
 * Each preset has a light and a dark gradient rather than one gradient faded for both:
 * the backdrop sits under body text, so it must be darker than a light ground and
 * lighter than a dark one to stay visible. A light gradient at 18% over white dissolves.
 */
export const CHAT_PRESETS: readonly ChatPreset[] = [
  { id: 'none', labelKey: 'chat.none' },
  {
    id: 'aurora',
    labelKey: 'chat.aurora',
    light: 'linear-gradient(135deg, #2540b8, #0e8f86 55%, #5b2fb0)',
    dark: 'linear-gradient(135deg, #8fb0ff, #6ff0de 55%, #c49bff)',
  },
  {
    id: 'dusk',
    labelKey: 'chat.dusk',
    light: 'linear-gradient(160deg, #b4155c, #c2410c)',
    dark: 'linear-gradient(160deg, #ff9ebd, #ffbe98)',
  },
  {
    id: 'mint',
    labelKey: 'chat.mint',
    light: 'linear-gradient(140deg, #0f766e, #15803d)',
    dark: 'linear-gradient(140deg, #7ff0dd, #c3f7d2)',
  },
  {
    id: 'ember',
    labelKey: 'chat.ember',
    light: 'linear-gradient(150deg, #b45309, #9f1239)',
    dark: 'linear-gradient(150deg, #fcc652, #ff9a8b)',
  },
]

/** Lower strength bound. */
export const CHAT_OPACITY_MIN = 0.04

/** Upper strength bound for gradients; above it the backdrop eats message text. */
export const CHAT_OPACITY_MAX = 0.45

/**
 * Upper strength bound for a wallpaper. Higher than a gradient's: a photo at 45% is
 * barely a photo, and the text keeps its own ground (bubbles and cards paint over the
 * layer), so the ceiling here is taste rather than contrast.
 */
export const WALLPAPER_OPACITY_MAX = 1

/**
 * Strength ceiling for one selection.
 * @param selection - persisted `chatBackground` value.
 * @returns the maximum the slider may reach.
 */
export function maxOpacityFor(selection: string): number {
  return wallpaperId(selection) === undefined ? CHAT_OPACITY_MAX : WALLPAPER_OPACITY_MAX
}

/**
 * Build the palette-plus-accent override layer.
 * @param paletteId - persisted palette id; an unknown id keeps the stock palette.
 * @param accent - custom accent as `#rrggbb`; anything else is ignored.
 * @returns the override layer to hand to `ThemeRuntime.overrideTokens`.
 */
export function buildOverrides(paletteId: string, accent: string): ThemeTokenOverrides {
  const tokens: ThemeTokenOverrides = {}
  const palette = PALETTES.find(entry => entry.id === paletteId)
  if (palette?.light !== undefined && palette.dark !== undefined) {
    for (const key of TOKEN_KEYS) tokens[TOKEN_MAP[key]] = { light: palette.light[key], dark: palette.dark[key] }
  }
  if (HEX.test(accent)) {
    tokens[TOKEN_MAP.primary] = { light: accent, dark: accent }
    // The tertiary is the accent's soft fill (hover grounds, selected rows), so it stays
    // a tint mixed toward each mode's ground; at full strength it would read as a second
    // primary and flatten the two states into one.
    tokens[TOKEN_MAP.tertiary] = {
      light: `color-mix(in srgb, ${accent} 14%, #ffffff)`,
      dark: `color-mix(in srgb, ${accent} 26%, #000000)`,
    }
  }
  return tokens
}

/**
 * The `background` value painting one wallpaper: `cover` and `center` without repeat,
 * because a tiled or letterboxed photo reads as a broken layout.
 * @param id - validated wallpaper id.
 * @returns the CSS `background` value.
 */
function wallpaperLayer(id: string): string {
  return `center / cover no-repeat url('${wallpaperImageUrl(id)}')`
}

/**
 * Build the conversation backdrop stylesheet.
 *
 * Anchored on `[data-conversation-backdrop]`, the whole conversation column, which does
 * not scroll: a layer positioned inside the scrollport scrolls away with the content and
 * leaves everything past the first screenful bare. The layer is a pseudo-element so the
 * strength drives its `opacity` alone without fading the transcript, and it stays out of
 * hit-testing so message text remains selectable. The column already positions its own
 * absolute chrome, so its children keep their positioning: the column isolates a stacking
 * context and the layer sits at `z-index: -1`, which paints it above the column's own
 * ground and below every child.
 *
 * Presets carry one gradient per palette mode; a wallpaper or a legacy custom colour is
 * used as chosen in both modes.
 *
 * When a backdrop is selected, two neighbours change with it: the composer seat's input
 * mask, which fades the transcript into a solid ground and would cut the backdrop into two
 * bands, turns transparent; and the conversation header becomes frosted glass so its
 * labels stay legible over the image. Without a backdrop neither rule is emitted.
 *
 * @param selection - `none`, a preset id, `wallpaper:<id>`, or a legacy `#rrggbb` colour.
 * @param opacity - backdrop strength; clamped to the selection's bounds.
 * @returns the stylesheet text, empty when no backdrop is selected.
 */
export function buildBackdropCss(selection: string, opacity: number): string {
  const wallpaper = wallpaperId(selection)
  const preset = CHAT_PRESETS.find(entry => entry.id === selection)
  // Custom colours are no longer offered, but a value saved by an earlier build still paints.
  const custom = HEX.test(selection) ? selection : undefined
  const light = wallpaper !== undefined ? wallpaperLayer(wallpaper) : preset?.light ?? custom
  const dark = wallpaper !== undefined ? wallpaperLayer(wallpaper) : preset?.dark ?? custom
  if (light === undefined || dark === undefined) return ''
  const strength = Math.min(maxOpacityFor(selection), Math.max(CHAT_OPACITY_MIN, opacity))
  return [
    '[data-conversation-backdrop] { isolation: isolate; }',
    '[data-conversation-backdrop]::before {',
    "  content: '';",
    '  position: absolute;',
    '  inset: 0;',
    '  pointer-events: none;',
    '  z-index: -1;',
    `  opacity: ${String(strength)};`,
    `  background: ${light};`,
    '}',
    `body[data-ds-dark-theme] [data-conversation-backdrop]::before { background: ${dark}; }`,
    '[data-conversation-backdrop] [data-composer-seat] { background: transparent !important; }',
    '[data-conversation-backdrop] [data-conversation-header] {',
    '  background: color-mix(in srgb, var(--dsw-alias-bg-base) 58%, transparent);',
    '  backdrop-filter: blur(20px) saturate(140%);',
    '}',
  ].join('\n')
}
