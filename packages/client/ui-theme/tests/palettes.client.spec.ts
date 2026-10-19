/** Palette override layers, backdrop stylesheets, and wallpaper selection parsing. */
import { describe, expect, it } from 'vitest'
import {
  buildBackdropCss, buildOverrides, CHAT_OPACITY_MAX, CHAT_OPACITY_MIN, maxOpacityFor, PALETTES,
} from '../src/client/palettes.ts'
import { wallpaperId, wallpaperImageUrl } from '../src/wallpaper-paths.ts'

const ID = '0123456789abcdef'

describe('buildOverrides', () => {
  it('keeps the stock palette for default and for ids this build does not know', () => {
    expect(buildOverrides('default', '')).toEqual({})
    expect(buildOverrides('from-a-newer-build', '')).toEqual({})
  })

  it('writes both modes of every palette slot', () => {
    const forest = PALETTES.find(entry => entry.id === 'forest')
    const tokens = buildOverrides('forest', '')
    expect(Object.keys(tokens)).toHaveLength(6)
    expect(tokens['--dsw-alias-bg-base']).toEqual({ light: forest?.light?.base, dark: forest?.dark?.base })
    expect(tokens['--dsw-alias-state-business-primary']).toEqual({ light: '#2f7d5b', dark: '#5cbf95' })
  })

  it('lets a custom accent win over the palette primary, with a tinted tertiary', () => {
    const tokens = buildOverrides('forest', '#aa00ff')
    expect(tokens['--dsw-alias-state-business-primary']).toEqual({ light: '#aa00ff', dark: '#aa00ff' })
    expect(tokens['--dsw-alias-state-business-tertiary']).toEqual({
      light: 'color-mix(in srgb, #aa00ff 14%, #ffffff)',
      dark: 'color-mix(in srgb, #aa00ff 26%, #000000)',
    })
    expect(tokens['--dsw-alias-bg-base']).toBeDefined()
  })

  it('ignores an accent that is not #rrggbb', () => {
    expect(buildOverrides('default', 'red')).toEqual({})
    expect(buildOverrides('default', '#abc')).toEqual({})
  })
})

describe('buildBackdropCss', () => {
  it('emits nothing without a backdrop, so the stock composer mask and header stay', () => {
    expect(buildBackdropCss('none', 0.3)).toBe('')
    expect(buildBackdropCss('unknown-preset', 0.3)).toBe('')
    expect(buildBackdropCss('wallpaper:../../etc', 0.3)).toBe('')
  })

  it('paints a preset per mode beneath the column children, with its neighbours adjusted', () => {
    const css = buildBackdropCss('aurora', 0.3)
    expect(css).toContain('[data-conversation-backdrop] { isolation: isolate; }')
    expect(css).toContain('z-index: -1;')
    expect(css).toContain('opacity: 0.3;')
    expect(css).toContain('background: linear-gradient(135deg, #2540b8')
    expect(css).toContain('body[data-ds-dark-theme] [data-conversation-backdrop]::before { background: linear-gradient(135deg, #8fb0ff')
    expect(css).toContain('[data-composer-seat] { background: transparent !important; }')
    expect(css).toContain('[data-conversation-header]')
  })

  it('clamps strength to the selection bounds', () => {
    expect(buildBackdropCss('dusk', 0.9)).toContain(`opacity: ${String(CHAT_OPACITY_MAX)};`)
    expect(buildBackdropCss('dusk', 0)).toContain(`opacity: ${String(CHAT_OPACITY_MIN)};`)
    expect(buildBackdropCss(`wallpaper:${ID}`, 0.9)).toContain('opacity: 0.9;')
    expect(buildBackdropCss(`wallpaper:${ID}`, 4)).toContain('opacity: 1;')
  })

  it('covers the column with a stored wallpaper in both modes', () => {
    const css = buildBackdropCss(`wallpaper:${ID}`, 0.5)
    const layer = `center / cover no-repeat url('/api/ui-theme/wallpaper?id=${ID}')`
    expect(css).toContain(`  background: ${layer};`)
    expect(css).toContain(`[data-conversation-backdrop]::before { background: ${layer}; }`)
  })

  it('still paints a custom colour saved by an earlier build', () => {
    const css = buildBackdropCss('#334455', 0.2)
    expect(css).toContain('  background: #334455;')
    expect(css).toContain('[data-conversation-backdrop]::before { background: #334455; }')
  })
})

describe('wallpaper selections', () => {
  it('parses only well-formed wallpaper selections', () => {
    expect(wallpaperId(`wallpaper:${ID}`)).toBe(ID)
    expect(wallpaperId('wallpaper:XYZ')).toBeUndefined()
    expect(wallpaperId(`wallpaper:${ID}0`)).toBeUndefined()
    expect(wallpaperId('aurora')).toBeUndefined()
  })

  it('builds full and thumbnail image URLs', () => {
    expect(wallpaperImageUrl(ID)).toBe(`/api/ui-theme/wallpaper?id=${ID}`)
    expect(wallpaperImageUrl(ID, 'thumb')).toBe(`/api/ui-theme/wallpaper?id=${ID}&variant=thumb`)
  })

  it('lets only a wallpaper reach full strength', () => {
    expect(maxOpacityFor('aurora')).toBe(CHAT_OPACITY_MAX)
    expect(maxOpacityFor(`wallpaper:${ID}`)).toBe(1)
  })
})
