/** Wire paths and identifiers of the conversation backdrop's wallpaper slot, shared by the Host routes and the browser. */

/** Slot listing (`GET`) and replacement upload (`POST`). */
export const WALLPAPER_SLOT_PATH = '/api/ui-theme/wallpapers'

/** Removal of one stored image (`POST ?id=`); exact Fetch routes accept no `DELETE`. */
export const WALLPAPER_REMOVE_PATH = '/api/ui-theme/wallpapers/remove'

/** One stored image (`GET ?id=` for the full image, `&variant=thumb` for the picker thumbnail). */
export const WALLPAPER_IMAGE_PATH = '/api/ui-theme/wallpaper'

/** Prefix marking a `chatBackground` selection that names a stored wallpaper. */
export const WALLPAPER_PREFIX = 'wallpaper:'

/** A wallpaper id: the first 16 hex digits of the full image's SHA-256, so a new image is a new URL. */
export const WALLPAPER_ID = /^[0-9a-f]{16}$/u

/**
 * URL of one stored image. The id is validated before it reaches here, so it carries
 * nothing that could escape a CSS `url()`.
 * @param id - stored wallpaper id.
 * @param variant - full image or picker thumbnail.
 * @returns the document-relative URL.
 */
export function wallpaperImageUrl(id: string, variant: 'full' | 'thumb' = 'full'): string {
  return `${WALLPAPER_IMAGE_PATH}?id=${id}${variant === 'thumb' ? '&variant=thumb' : ''}`
}

/**
 * The wallpaper id inside a backdrop selection.
 * @param selection - persisted `chatBackground` value.
 * @returns the id, or `undefined` when the selection is not a well-formed wallpaper.
 */
export function wallpaperId(selection: string): string | undefined {
  if (!selection.startsWith(WALLPAPER_PREFIX)) return undefined
  const id = selection.slice(WALLPAPER_PREFIX.length)
  return WALLPAPER_ID.test(id) ? id : undefined
}
