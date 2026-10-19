/**
 * Host storage and Fetch routes for the conversation backdrop's wallpaper slot.
 *
 * One slot, not a library: the backdrop shows one image at a time, so storing a new
 * image evicts the previous one. Images live on disk under `$DSH_HOME/wallpapers`; the
 * settings document keeps only `wallpaper:<id>`, because every settings read would
 * otherwise carry the image bytes.
 *
 * The browser re-encodes a pick to JPEG before upload (full image plus thumbnail), so
 * the Host needs no image codec and accepts only JPEG data URIs. The id is the content
 * hash, so a replaced image gets a new URL and can be cached immutably.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WALLPAPER_ID } from './wallpaper-paths.ts'

/** Stored images per slot. Replacing is the point: picking a new image means using it. */
export const WALLPAPER_SLOT_SIZE = 1

/** Largest accepted full image. The browser downscales to 1920px first, so more means a broken client. */
export const WALLPAPER_MAX_BYTES = 8 * 1024 * 1024

const EXTENSION = { full: '.jpg', thumb: '.t.jpg' } as const
const JPEG_DATA_URI = 'data:image/jpeg;base64,'

/** One stored image variant. */
export type WallpaperVariant = keyof typeof EXTENSION

/** Result of storing an upload. */
export type WallpaperAddResult = { ok: true; id: string } | { ok: false; error: string }

/** Disk-backed wallpaper slot. */
export interface WallpaperStore {
  /** @returns stored ids, newest first; normally zero or one. */
  list(): string[]
  /**
   * Store one image and evict older ones beyond the slot size.
   * @param full - full JPEG bytes.
   * @param thumb - thumbnail JPEG bytes.
   * @returns the content-hash id, or the reason the upload was rejected.
   */
  add(full: Buffer, thumb: Buffer): WallpaperAddResult
  /**
   * Delete one image and its thumbnail.
   * @param id - stored id.
   * @returns whether anything was deleted.
   */
  remove(id: string): boolean
  /**
   * Read one image.
   * @param id - stored id; anything not matching the id pattern is refused, which keeps paths inside the directory.
   * @param variant - full image or thumbnail.
   * @returns the bytes, or `undefined` when absent.
   */
  read(id: string, variant: WallpaperVariant): Buffer | undefined
}

/**
 * Create the slot over one directory, created on first write.
 * @param directory - absolute storage directory.
 * @param slotSize - images kept after an upload.
 * @param maxBytes - largest accepted full image.
 * @returns the store.
 */
export function createWallpaperStore(
  directory: string,
  slotSize = WALLPAPER_SLOT_SIZE,
  maxBytes = WALLPAPER_MAX_BYTES,
): WallpaperStore {
  const file = (id: string, variant: WallpaperVariant): string => join(directory, id + EXTENSION[variant])

  const list = (): string[] => {
    let names: string[]
    // A missing directory is an empty slot: nothing has been uploaded yet.
    try { names = readdirSync(directory) } catch { return [] }
    const stored: { id: string; mtime: number }[] = []
    for (const name of names) {
      if (!name.endsWith(EXTENSION.full) || name.endsWith(EXTENSION.thumb)) continue
      const id = name.slice(0, -EXTENSION.full.length)
      if (!WALLPAPER_ID.test(id)) continue
      stored.push({ id, mtime: statSync(join(directory, name)).mtimeMs })
    }
    return stored.sort((a, b) => b.mtime - a.mtime).map(entry => entry.id)
  }

  const remove = (id: string): boolean => {
    if (!WALLPAPER_ID.test(id)) return false
    let removed = false
    for (const variant of ['full', 'thumb'] as const) {
      // An absent variant is already the requested state.
      try { unlinkSync(file(id, variant)); removed = true } catch { /* already absent */ }
    }
    return removed
  }

  return {
    list,
    remove,
    add(full, thumb) {
      if (full.length === 0 || thumb.length === 0) return { ok: false, error: 'empty image' }
      if (full.length > maxBytes) return { ok: false, error: `image exceeds ${String(maxBytes)} bytes` }
      if (full[0] !== 0xff || full[1] !== 0xd8 || thumb[0] !== 0xff || thumb[1] !== 0xd8) return { ok: false, error: 'not JPEG data' }
      const id = createHash('sha256').update(full).digest('hex').slice(0, 16)
      mkdirSync(directory, { recursive: true })
      writeFileSync(file(id, 'full'), full)
      writeFileSync(file(id, 'thumb'), thumb)
      for (const stale of list().filter(entry => entry !== id).slice(slotSize - 1)) remove(stale)
      return { ok: true, id }
    },
    read(id, variant) {
      if (!WALLPAPER_ID.test(id)) return undefined
      // An absent file is an unknown id; the caller answers 404.
      try { return readFileSync(file(id, variant)) } catch { return undefined }
    },
  }
}

/**
 * Decode one uploaded JPEG data URI.
 * @param value - request field.
 * @returns the bytes, or `undefined` for anything but a non-empty base64 JPEG data URI.
 */
export function decodeJpegDataUri(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || !value.startsWith(JPEG_DATA_URI)) return undefined
  const bytes = Buffer.from(value.slice(JPEG_DATA_URI.length), 'base64')
  return bytes.length === 0 ? undefined : bytes
}

const json = (value: unknown, status = 200): Response => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })

/**
 * Handle the slot path: list (`GET`) and upload (`POST`).
 * @param store - wallpaper slot.
 * @param request - Fetch request already admitted as the owner.
 * @returns the JSON response.
 */
export async function handleWallpaperSlot(store: WallpaperStore, request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ items: store.list(), slotSize: WALLPAPER_SLOT_SIZE })
  let payload: unknown
  // A non-JSON body is a client error, answered as such.
  try { payload = await request.json() } catch { return json({ error: 'body is not JSON' }, 400) }
  const fields = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {}
  const full = decodeJpegDataUri(fields.full)
  const thumb = decodeJpegDataUri(fields.thumb)
  if (full === undefined || thumb === undefined) return json({ error: 'full and thumb must be JPEG data URIs' }, 400)
  const added = store.add(full, thumb)
  return added.ok ? json({ id: added.id }) : json({ error: added.error }, 400)
}

/**
 * Remove one stored image named by the `id` query parameter.
 * @param store - wallpaper slot.
 * @param request - Fetch request already admitted as the owner.
 * @returns `{ ok: true }`, or 404 when nothing was stored under the id.
 */
export function handleWallpaperRemove(store: WallpaperStore, request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  return Promise.resolve(store.remove(id) ? json({ ok: true }) : json({ error: 'unknown wallpaper' }, 404))
}

/**
 * Serve one stored image. The id is a content hash, so the bytes behind a URL never change.
 * @param store - wallpaper slot.
 * @param request - Fetch request already admitted as the owner.
 * @returns the image, or 404.
 */
export function handleWallpaperImage(store: WallpaperStore, request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams
  const bytes = store.read(query.get('id') ?? '', query.get('variant') === 'thumb' ? 'thumb' : 'full')
  if (bytes === undefined) return Promise.resolve(json({ error: 'unknown wallpaper' }, 404))
  return Promise.resolve(new Response(new Uint8Array(bytes), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' },
  }))
}
