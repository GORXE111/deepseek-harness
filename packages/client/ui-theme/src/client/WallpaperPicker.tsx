/**
 * The conversation backdrop's wallpaper slot: one image, replaced in place.
 *
 * One slot rather than a library, because the backdrop shows a single image; a row of
 * stored thumbnails would suggest a collection that does nothing but take space. The
 * image bytes live with the Host and never enter the settings document, which keeps only
 * `wallpaper:<id>`. The picker hides itself where the Host serves no slot.
 */
import { useRef, useState } from 'react'
import clsx from 'clsx'
import type { ThemeKey } from './locales.ts'
import { WALLPAPER_PREFIX, wallpaperId, wallpaperImageUrl } from '../wallpaper-paths.ts'
import css from './AppearanceRow.module.css'

/** Longest edge of the stored image; a backdrop gains nothing beyond it. */
const FULL_EDGE = 1920

/** Longest edge of the picker thumbnail. */
const THUMB_EDGE = 96

const FULL_QUALITY = 0.82
const THUMB_QUALITY = 0.7

/** Rejected before decoding: a RAW file or a video would otherwise stall the page. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024

/** One picked image, re-encoded for upload. */
export interface EncodedWallpaper {
  /** Full image as a JPEG data URI. */
  full: string
  /** Thumbnail as a JPEG data URI. */
  thumb: string
}

/** Props: the slot's state, the selection, and the writers. */
export interface WallpaperPickerProps {
  /** Persisted `chatBackground` value. */
  selection: string
  /** Stored ids, newest first. */
  wallpapers: readonly string[]
  /** Switch the backdrop to the given selection. */
  onSelect: (value: string) => void
  /**
   * Store one encoded image, replacing the slot's previous one.
   * @returns the stored id, or `undefined` when the Host rejected it.
   */
  addWallpaper: (image: EncodedWallpaper) => Promise<string | undefined>
  /** Delete one stored image; the backdrop leaves it when it was in use. */
  removeWallpaper: (id: string) => Promise<void>
  /** Locale lookup shared with the row. */
  t: (key: ThemeKey) => string
}

/**
 * Re-encode one picked file into the stored image and its thumbnail. Encoding happens
 * in the page, which already has a full graphics stack, so the Host needs no codec.
 * The canvas is flattened onto white first: JPEG has no alpha, and unfilled pixels
 * would export as black.
 * @param file - the user's pick.
 * @returns both encodings as JPEG data URIs.
 */
async function encode(file: File): Promise<EncodedWallpaper> {
  const bitmap = await createImageBitmap(file)
  try {
    const draw = (edge: number, quality: number): string => {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (context === null) throw new Error('canvas 2d context unavailable')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', quality)
    }
    return { full: draw(FULL_EDGE, FULL_QUALITY), thumb: draw(THUMB_EDGE, THUMB_QUALITY) }
  } finally {
    bitmap.close()
  }
}

/**
 * Render the wallpaper slot.
 * @param props - slot state, selection, writers, and locale seat.
 * @returns the picker element tree.
 */
export function WallpaperPicker({ selection, wallpapers, onSelect, addWallpaper, removeWallpaper, t }: WallpaperPickerProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ThemeKey | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)

  const current = wallpaperId(selection)
  // Prefer the image the backdrop is using over the newest on disk, so "replace" never
  // evicts a picture other than the one on screen.
  const stored = wallpapers.find(id => id === current) ?? wallpapers[0]

  const onPick = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0]
    if (file === undefined) return
    setError(undefined)
    if (file.size > MAX_SOURCE_BYTES) { setError('chat.tooBig'); return }
    setBusy(true)
    try {
      const encoded = await encode(file).catch(() => undefined)
      if (encoded === undefined) { setError('chat.badImage'); return }
      const id = await addWallpaper(encoded)
      if (id === undefined) { setError('chat.saveFailed'); return }
      onSelect(WALLPAPER_PREFIX + id)
    } finally {
      setBusy(false)
      // Clear the input so picking the same file again still fires a change.
      input.value = ''
    }
  }

  return (
    <>
      <div className={css.subTitle}>{t('chat.wallpaper')}</div>
      <div className={css.controlRow}>
        {stored !== undefined && (
          <button
            type="button"
            className={clsx(css.wallTile, current === stored && css.wallTileSelected)}
            aria-label={t('chat.wallpaper')}
            aria-pressed={current === stored}
            style={{ backgroundImage: `url('${wallpaperImageUrl(stored, 'thumb')}')` }}
            onClick={() => { onSelect(WALLPAPER_PREFIX + stored) }}
          />
        )}
        <button type="button" className={css.ghostButton} disabled={busy} onClick={() => { fileRef.current?.click() }}>
          {busy ? t('chat.adding') : stored === undefined ? t('chat.add') : t('chat.replace')}
        </button>
        {stored !== undefined && (
          <button type="button" className={css.ghostButton} onClick={() => { void removeWallpaper(stored) }}>
            {t('chat.remove')}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          aria-label={t('chat.add')}
          onChange={(event) => { void onPick(event.currentTarget) }}
        />
        {error !== undefined && <span className={css.hint} role="status">{t(error)}</span>}
      </div>
    </>
  )
}
