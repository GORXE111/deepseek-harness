/** Appearance and font-size row stores: snapshot-mirror actions and the revision guards. */
import { describe, expect, it } from 'vitest'
import { createAppearanceRowStore, createFontRowStore } from '../src/client/settings-store.ts'

const SELECTION = { preference: 'system', palette: 'default', accent: '', chatBackground: 'none', chatOpacity: 0.18 } as const

describe('createAppearanceRowStore', () => {
  it('init shape: stock selections, revision at -1, an empty supported wallpaper slot', () => {
    const store = createAppearanceRowStore().create()
    expect(store.getSnapshot()).toEqual({ ...SELECTION, revision: -1, wallpapers: [], wallpapersSupported: true })
  })

  it('sync mirrors every selection and advances the revision', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync({ ...SELECTION, preference: 'dark', palette: 'forest', accent: '#112233' }, 0)
    expect(store.getSnapshot()).toMatchObject({ preference: 'dark', palette: 'forest', accent: '#112233', revision: 0 })
    store.actions.sync({ ...SELECTION, preference: 'light', chatBackground: 'aurora', chatOpacity: 0.3 }, 2)
    expect(store.getSnapshot()).toMatchObject({
      preference: 'light', palette: 'default', accent: '', chatBackground: 'aurora', chatOpacity: 0.3, revision: 2,
    })
  })

  it('revision guard drops stale and duplicate writes', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync({ ...SELECTION, preference: 'dark' }, 3)
    store.actions.sync({ ...SELECTION, palette: 'sakura' }, 2)
    store.actions.sync({ ...SELECTION, palette: 'sakura' }, 3)
    expect(store.getSnapshot()).toMatchObject({ preference: 'dark', palette: 'default', revision: 3 })
  })

  it('mirrors the wallpaper listing, and a failed listing marks the slot unsupported', () => {
    const store = createAppearanceRowStore().create()
    store.actions.syncWallpapers(['0123456789abcdef'])
    expect(store.getSnapshot()).toMatchObject({ wallpapers: ['0123456789abcdef'], wallpapersSupported: true })
    store.actions.syncWallpapers(undefined)
    expect(store.getSnapshot()).toMatchObject({ wallpapers: [], wallpapersSupported: false })
  })
})

describe('createFontRowStore', () => {
  it('init shape: default size with revision at -1', () => {
    const store = createFontRowStore().create()
    expect(store.getSnapshot()).toEqual({ fontSizes: { text: 14, code: 11, terminal: 13 }, fontFamilies: { text: '', code: '', terminal: '' }, revision: -1 })
  })

  it('sync mirrors the size; the revision guard drops stale and duplicate writes', () => {
    const store = createFontRowStore().create()
    const sizes = { text: 16, code: 12, terminal: 14 }
    const fonts = { text: '"Inter"', code: '', terminal: '' }
    store.actions.sync(sizes, { ...fonts }, 3)
    expect(store.getSnapshot()).toEqual({ fontSizes: sizes, fontFamilies: fonts, revision: 3 })
    store.actions.sync({ ...sizes, text: 12 }, fonts, 2)
    store.actions.sync({ ...sizes, text: 12 }, fonts, 3)
    expect(store.getSnapshot().fontSizes.text).toBe(16)
    expect(store.getSnapshot().revision).toBe(3)
  })
})
