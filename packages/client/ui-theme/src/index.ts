/** Host registration for the browser theme preference, pre-plugin palette, and wallpaper slot. */
import type {} from '@deepseek-ai/dsh-settings'

import type { Volatile } from '@deepseek-ai/cordis'
import type { ThemePreference } from './theme-settings.ts'
import z from '@deepseek-ai/schemastery'

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { bootThemeInjections } from './boot-theme.ts'
import {
  DEFAULT_CHAT_BACKGROUND, DEFAULT_CHAT_OPACITY, DEFAULT_PALETTE, DEFAULT_PREFERENCE, FONT_SIZE_SPECS,
  fontSizeSchema, THEME_PREFERENCES,
} from './theme-settings.ts'
import { WALLPAPER_IMAGE_PATH, WALLPAPER_REMOVE_PATH, WALLPAPER_SLOT_PATH } from './wallpaper-paths.ts'
import { createWallpaperStore, handleWallpaperImage, handleWallpaperRemove, handleWallpaperSlot } from './wallpapers.ts'

export {
  DEFAULT_CHAT_BACKGROUND, DEFAULT_CHAT_OPACITY, DEFAULT_FONT_SIZE, DEFAULT_PALETTE, DEFAULT_PREFERENCE,
  FONT_SIZE_FIELD, FONT_SIZE_MAX, FONT_SIZE_MIN, THEME_ACCENT_FIELD, THEME_CHAT_FIELD, THEME_CHAT_OPACITY_FIELD,
  THEME_PALETTE_FIELD, THEME_PREFERENCE_FIELD, THEME_PREFERENCES, THEME_SETTINGS_NAMESPACE,
  type ThemePreference, type ThemeSettings,
} from './theme-settings.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Browser palette preference. */
  preference: Volatile<ThemePreference>
  /** Browser font size in pixels. */
  fontSize: Volatile<number>
  /** Code-block font size in pixels. */
  codeFontSize: Volatile<number>
  /** Sidebar terminal font size in pixels. */
  terminalFontSize: Volatile<number>
  /** Interface and body text font list; `''` keeps the built-in stack. */
  textFontFamily: Volatile<string>
  /** Code font list; `''` keeps the built-in stack. */
  codeFontFamily: Volatile<string>
  /** Sidebar terminal font list; `''` keeps the built-in stack. */
  terminalFontFamily: Volatile<string>
  /** Colour palette id; an unknown id keeps the stock palette. */
  palette: Volatile<string>
  /** Custom accent as `#rrggbb`; `''` follows the palette. */
  accent: Volatile<string>
  /** Conversation backdrop selection. */
  chatBackground: Volatile<string>
  /** Conversation backdrop strength. */
  chatOpacity: Volatile<number>
}

/** Live theme and typography preferences. */
export const Config = z.object({
  preference: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE).volatile(),
  fontSize: fontSizeSchema(FONT_SIZE_SPECS.text).volatile(),
  codeFontSize: fontSizeSchema(FONT_SIZE_SPECS.code).volatile(),
  terminalFontSize: fontSizeSchema(FONT_SIZE_SPECS.terminal).volatile(),
  textFontFamily: z.string().default('').volatile(),
  codeFontFamily: z.string().default('').volatile(),
  terminalFontFamily: z.string().default('').volatile(),
  palette: z.string().default(DEFAULT_PALETTE).volatile(),
  accent: z.string().default('').volatile(),
  chatBackground: z.string().default(DEFAULT_CHAT_BACKGROUND).volatile(),
  chatOpacity: z.number().default(DEFAULT_CHAT_OPACITY).volatile(),
})

/** Supply the current palette before browser plugins start.
 * @param ctx Host plugin context.
 * @param config Validated live theme preferences.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  // The wallpaper slot exists only where a connection serves the browser; both
  // routes are exact Fetch routes, so only the owner reaches them.
  ctx.inject(['connection'], (child) => {
    const store = createWallpaperStore(dshHomePath('wallpapers'))
    child.effect(() => child.connection.fetch.register({
      path: WALLPAPER_SLOT_PATH, methods: ['GET', 'POST'], requestBody: 'buffered',
      fetch: request => handleWallpaperSlot(store, request),
    }), 'ui-theme: wallpaper slot route')
    child.effect(() => child.connection.fetch.register({
      path: WALLPAPER_REMOVE_PATH, methods: ['POST'], requestBody: 'buffered',
      fetch: request => handleWallpaperRemove(store, request),
    }), 'ui-theme: wallpaper removal route')
    child.effect(() => child.connection.fetch.register({
      path: WALLPAPER_IMAGE_PATH, methods: ['GET'], requestBody: 'buffered',
      fetch: request => handleWallpaperImage(store, request),
    }), 'ui-theme: wallpaper image route')
  })
  ctx.on('webserver/index-inject', (table) => {
    table.push(...bootThemeInjections(config.preference.get(), {
      text: config.fontSize.get(),
      code: config.codeFontSize.get(),
      terminal: config.terminalFontSize.get(),
    }, {
      text: config.textFontFamily.get(),
      code: config.codeFontFamily.get(),
      terminal: config.terminalFontFamily.get(),
    }))
  }, { prepend: true })
}
