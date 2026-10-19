/**
 * Appearance and font row slot stores: mirrors of the theme service
 * snapshot. The plugin's apply-world change listener is the only writer; the
 * row components read via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import {
  DEFAULT_CHAT_BACKGROUND, DEFAULT_CHAT_OPACITY, DEFAULT_FONT_SIZES, DEFAULT_PALETTE,
  type FontFamilies, type FontSizes, type ThemePreference,
} from '../theme-settings.ts'

/** The Appearance row's selections: the light/dark preference plus the layers painted over it. */
export interface AppearanceSelection {
  /** Persisted preference (selection state reads this, never the resolved active theme). */
  preference: ThemePreference
  /** Palette id. */
  palette: string
  /** Custom accent as `#rrggbb`; `''` follows the palette. */
  accent: string
  /** Conversation backdrop selection. */
  chatBackground: string
  /** Conversation backdrop strength. */
  chatOpacity: number
}

/** Store state mirrored from the theme snapshot, the layered selections, and the wallpaper slot. */
export interface AppearanceRowState extends AppearanceSelection {
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
  /** Stored wallpaper ids, newest first; normally zero or one. */
  wallpapers: readonly string[]
  /** False once the Host proves it serves no wallpaper slot, which hides the picker. */
  wallpapersSupported: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
type AppearanceRowActions = {
  sync: (draft: AppearanceRowState, next: AppearanceSelection, revision: number) => void
  syncWallpapers: (draft: AppearanceRowState, items: readonly string[] | undefined) => void
}

/**
 * Declares the Appearance row state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore(): EngineStoreHandle<AppearanceRowState, AppearanceRowActions> {
  return defineStore({
    init: (): AppearanceRowState => ({
      preference: 'system',
      palette: DEFAULT_PALETTE,
      accent: '',
      chatBackground: DEFAULT_CHAT_BACKGROUND,
      chatOpacity: DEFAULT_CHAT_OPACITY,
      revision: -1,
      wallpapers: [],
      wallpapersSupported: true,
    }),
    actions: {
      sync: (d, next: AppearanceSelection, revision: number) => {
        if (revision <= d.revision) return
        d.preference = next.preference
        d.palette = next.palette
        d.accent = next.accent
        d.chatBackground = next.chatBackground
        d.chatOpacity = next.chatOpacity
        d.revision = revision
      },
      // `undefined` means the listing failed: no slot on this Host.
      syncWallpapers: (d, items: readonly string[] | undefined) => {
        d.wallpapersSupported = items !== undefined
        d.wallpapers = items ?? []
      },
    },
  })
}

/** Store state mirrored from the theme snapshot's fonts (shared by the font-size row and the font settings group). */
export interface FontRowState {
  /** Persisted font sizes in px by role. */
  fontSizes: FontSizes
  /** Persisted normalized font lists by role. */
  fontFamilies: FontFamilies
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type FontRowActions = {
  sync: (draft: FontRowState, fontSizes: FontSizes, fontFamilies: FontFamilies, revision: number) => void
}

/**
 * Declares the font rows' state and write surface.
 * @returns the store handle.
 */
export function createFontRowStore(): EngineStoreHandle<FontRowState, FontRowActions> {
  return defineStore({
    init: (): FontRowState => ({ fontSizes: DEFAULT_FONT_SIZES, fontFamilies: { text: '', code: '', terminal: '' }, revision: -1 }),
    actions: {
      sync: (d, fontSizes: FontSizes, fontFamilies: FontFamilies, revision: number) => {
        if (revision <= d.revision) return
        d.fontSizes = fontSizes
        d.fontFamilies = fontFamilies
        d.revision = revision
      },
    },
  })
}
