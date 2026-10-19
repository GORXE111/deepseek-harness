/** Host wallpaper slot: disk store, eviction, path safety, the Fetch route handlers, and their registration. */
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import { apply, Config } from '../src/index.ts'
import {
  createWallpaperStore, decodeJpegDataUri, handleWallpaperImage, handleWallpaperRemove, handleWallpaperSlot,
  WALLPAPER_MAX_BYTES, type WallpaperStore,
} from '../src/wallpapers.ts'

const jpeg = (marker: number): Buffer => Buffer.from([0xff, 0xd8, 0xff, marker])
const dataUri = (bytes: Buffer): string => `data:image/jpeg;base64,${bytes.toString('base64')}`
const at = (path: string, method = 'GET', body?: unknown): Request =>
  new Request(`http://127.0.0.1${path}`, { method, ...body === undefined ? {} : { body: JSON.stringify(body) } })

let directory: string
let store: WallpaperStore
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'dsh-wallpapers-'))
  store = createWallpaperStore(join(directory, 'wallpapers'))
})
afterEach(() => { rmSync(directory, { recursive: true, force: true }) })

describe('createWallpaperStore', () => {
  it('starts empty without creating its directory', () => {
    expect(store.list()).toEqual([])
    expect(readdirSync(directory)).toEqual([])
  })

  it('stores an image under its content hash and serves both variants', () => {
    const added = store.add(jpeg(1), jpeg(2))
    if (!added.ok) throw new Error(added.error)
    expect(added.id).toMatch(/^[0-9a-f]{16}$/u)
    expect(store.list()).toEqual([added.id])
    expect(store.read(added.id, 'full')).toEqual(jpeg(1))
    expect(store.read(added.id, 'thumb')).toEqual(jpeg(2))
    expect(store.add(jpeg(1), jpeg(3))).toEqual({ ok: true, id: added.id })
  })

  it('keeps one image: storing another evicts the previous one', () => {
    const first = store.add(jpeg(1), jpeg(1))
    const second = store.add(jpeg(2), jpeg(2))
    if (!first.ok || !second.ok) throw new Error('upload rejected')
    expect(store.list()).toEqual([second.id])
    expect(store.read(first.id, 'full')).toBeUndefined()
  })

  it('lists newest first when a larger slot keeps several', () => {
    const roomy = createWallpaperStore(join(directory, 'roomy'), 2)
    const older = roomy.add(jpeg(1), jpeg(1))
    if (!older.ok) throw new Error(older.error)
    utimesSync(join(directory, 'roomy', `${older.id}.jpg`), new Date(1000), new Date(1000))
    const newer = roomy.add(jpeg(2), jpeg(2))
    if (!newer.ok) throw new Error(newer.error)
    expect(roomy.list()).toEqual([newer.id, older.id])
    const third = roomy.add(jpeg(3), jpeg(3))
    if (!third.ok) throw new Error(third.error)
    expect(roomy.list()).toEqual([third.id, newer.id])
  })

  it('rejects empty, oversized, and non-JPEG uploads', () => {
    expect(store.add(Buffer.alloc(0), jpeg(1))).toEqual({ ok: false, error: 'empty image' })
    expect(store.add(jpeg(1), Buffer.alloc(0))).toEqual({ ok: false, error: 'empty image' })
    const oversized = Buffer.alloc(WALLPAPER_MAX_BYTES + 1, 0xff)
    expect(store.add(oversized, jpeg(1))).toMatchObject({ ok: false })
    expect(store.add(Buffer.from('PNG?'), jpeg(1))).toEqual({ ok: false, error: 'not JPEG data' })
    expect(store.add(jpeg(1), Buffer.from('PNG?'))).toEqual({ ok: false, error: 'not JPEG data' })
    expect(store.list()).toEqual([])
  })

  it('refuses ids outside the content-hash pattern, which keeps reads and deletes inside the directory', () => {
    expect(store.read('../../secret', 'full')).toBeUndefined()
    expect(store.remove('../../secret')).toBe(false)
    expect(store.read('0123456789abcdef', 'full')).toBeUndefined()
  })

  it('ignores stray files in the directory', () => {
    const added = store.add(jpeg(1), jpeg(1))
    if (!added.ok) throw new Error(added.error)
    writeFileSync(join(directory, 'wallpapers', 'notes.jpg'), 'x')
    writeFileSync(join(directory, 'wallpapers', 'readme.txt'), 'x')
    expect(store.list()).toEqual([added.id])
  })

  it('removes both variants once', () => {
    const added = store.add(jpeg(1), jpeg(1))
    if (!added.ok) throw new Error(added.error)
    expect(store.remove(added.id)).toBe(true)
    expect(store.remove(added.id)).toBe(false)
    expect(store.list()).toEqual([])
  })
})

describe('decodeJpegDataUri', () => {
  it('accepts only non-empty base64 JPEG data URIs', () => {
    expect(decodeJpegDataUri(dataUri(jpeg(1)))).toEqual(jpeg(1))
    expect(decodeJpegDataUri('data:image/jpeg;base64,')).toBeUndefined()
    expect(decodeJpegDataUri('data:image/png;base64,AAAA')).toBeUndefined()
    expect(decodeJpegDataUri(42)).toBeUndefined()
  })
})

describe('wallpaper routes', () => {
  it('lists the slot', async () => {
    const response = await handleWallpaperSlot(store, at('/api/ui-theme/wallpapers'))
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ items: [], slotSize: 1 })
  })

  it('stores an upload and answers its id', async () => {
    const response = await handleWallpaperSlot(store, at('/api/ui-theme/wallpapers', 'POST', {
      full: dataUri(jpeg(1)), thumb: dataUri(jpeg(2)),
    }))
    const { id } = await response.json() as { id: string }
    expect(store.list()).toEqual([id])
  })

  it('answers 400 for a body that is not JSON, lacks images, or carries no JPEG', async () => {
    const notJson = new Request('http://127.0.0.1/api/ui-theme/wallpapers', { method: 'POST', body: '{' })
    expect((await handleWallpaperSlot(store, notJson)).status).toBe(400)
    expect((await handleWallpaperSlot(store, at('/api/ui-theme/wallpapers', 'POST', null))).status).toBe(400)
    expect((await handleWallpaperSlot(store, at('/api/ui-theme/wallpapers', 'POST', { full: dataUri(jpeg(1)) }))).status).toBe(400)
    const rejected = await handleWallpaperSlot(store, at('/api/ui-theme/wallpapers', 'POST', {
      full: dataUri(Buffer.from('PNG?')), thumb: dataUri(jpeg(2)),
    }))
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toEqual({ error: 'not JPEG data' })
  })

  it('serves stored images as immutable JPEG and answers 404 otherwise', async () => {
    const added = store.add(jpeg(1), jpeg(2))
    if (!added.ok) throw new Error(added.error)
    const full = await handleWallpaperImage(store, at(`/api/ui-theme/wallpaper?id=${added.id}`))
    expect(full.headers.get('content-type')).toBe('image/jpeg')
    expect(full.headers.get('cache-control')).toContain('immutable')
    expect(Buffer.from(await full.arrayBuffer())).toEqual(jpeg(1))
    const thumb = await handleWallpaperImage(store, at(`/api/ui-theme/wallpaper?id=${added.id}&variant=thumb`))
    expect(Buffer.from(await thumb.arrayBuffer())).toEqual(jpeg(2))
    expect((await handleWallpaperImage(store, at('/api/ui-theme/wallpaper?id=ffffffffffffffff'))).status).toBe(404)
    expect((await handleWallpaperImage(store, at('/api/ui-theme/wallpaper'))).status).toBe(404)
  })

  it('removes by id and answers 404 for an unknown one', async () => {
    const added = store.add(jpeg(1), jpeg(2))
    if (!added.ok) throw new Error(added.error)
    const removed = await handleWallpaperRemove(store, at(`/api/ui-theme/wallpapers/remove?id=${added.id}`, 'POST'))
    expect(await removed.json()).toEqual({ ok: true })
    expect((await handleWallpaperRemove(store, at(`/api/ui-theme/wallpapers/remove?id=${added.id}`, 'POST'))).status).toBe(404)
    expect((await handleWallpaperRemove(store, at('/api/ui-theme/wallpapers/remove', 'POST'))).status).toBe(404)
  })
})

describe('ui-theme host wallpaper routes', () => {
  it('registers the slot routes under $DSH_HOME/wallpapers while a connection serves the browser, and removes them with the fiber', async () => {
    vi.stubEnv('DSH_HOME', directory)
    try {
      const ctx = new Context()
      const routes = new Map<string, ConnectionFetchRoute>()
      ctx.provide('connection', {
        fetch: {
          register: (route: ConnectionFetchRoute) => {
            routes.set(route.path, route)
            return () => { routes.delete(route.path); return Promise.resolve() }
          },
        },
      } as never)
      const { fiber } = await liveConfig(ctx, { Config, apply })
      expect([...routes.keys()].sort()).toEqual([
        '/api/ui-theme/wallpaper', '/api/ui-theme/wallpapers', '/api/ui-theme/wallpapers/remove',
      ])
      expect(routes.get('/api/ui-theme/wallpapers')?.methods).toEqual(['GET', 'POST'])

      const uploaded = await routes.get('/api/ui-theme/wallpapers')!.fetch(at('/api/ui-theme/wallpapers', 'POST', {
        full: dataUri(jpeg(1)), thumb: dataUri(jpeg(2)),
      }))
      const { id } = await uploaded.json() as { id: string }
      expect(readdirSync(join(directory, 'wallpapers')).sort()).toEqual([`${id}.jpg`, `${id}.t.jpg`])
      const image = await routes.get('/api/ui-theme/wallpaper')!.fetch(at(`/api/ui-theme/wallpaper?id=${id}`))
      expect(image.status).toBe(200)
      const removed = await routes.get('/api/ui-theme/wallpapers/remove')!.fetch(at(`/api/ui-theme/wallpapers/remove?id=${id}`, 'POST'))
      expect(removed.status).toBe(200)

      await fiber.dispose()
      expect(routes.size).toBe(0)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
