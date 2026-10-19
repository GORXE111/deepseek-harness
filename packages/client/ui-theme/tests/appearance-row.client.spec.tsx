// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { AppearanceRow } from '../src/client/AppearanceRow.tsx'
import type { AppearanceRowComponentProps } from '../src/client/AppearanceRow.tsx'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import type { ThemePreference } from '../src/client/index.ts'
import { en } from '../src/client/locales.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const COPY: Record<string, string> = en
const SELECTION = { preference: 'system', palette: 'default', accent: '', chatBackground: 'none', chatOpacity: 0.18 } as const

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<AppearanceRowComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: AppearanceRowComponentProps['useSessionStatus'] = selector => selector(noAttention)

function mount(preference: ThemePreference = 'system', layered: Partial<typeof SELECTION> | Record<string, unknown> = {}, wallpapers?: readonly string[]) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createAppearanceRowStore().create()
  store.actions.sync({ ...SELECTION, ...layered, preference }, 0)
  if (wallpapers !== undefined) store.actions.syncWallpapers(wallpapers)
  const setTheme = vi.fn()
  const setPalette = vi.fn()
  const setAccent = vi.fn()
  const setChatBackground = vi.fn()
  const setChatOpacity = vi.fn()
  const addWallpaper = vi.fn((_image: { full: string; thumb: string }) => Promise.resolve<string | undefined>('fedcba9876543210'))
  const removeWallpaper = vi.fn((_id: string) => Promise.resolve())
  const props: AppearanceRowComponentProps = {
    useSessions: emptySessions(),
    useSessionStatus,
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    useWorkspaces: emptyWorkspaces(),
    ...allowAllAccess,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setTheme, setPalette, setAccent, setChatBackground, setChatOpacity, addWallpaper, removeWallpaper,
  }
  render(<AppearanceRow {...props} />)
  return { store, setTheme, setPalette, setAccent, setChatBackground, setChatOpacity, addWallpaper, removeWallpaper }
}

const pressed = (name: RegExp): string | null =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('AppearanceRow', () => {
  it('renders the title and three cubes with the preference cube selected', () => {
    mount('dark')
    expect(screen.getByText('Appearance')).toBeDefined()
    expect(pressed(/Dark/)).toBe('true')
    expect(pressed(/Light/)).toBe('false')
    expect(pressed(/System/)).toBe('false')
  })

  it('click drives setTheme; selection follows the store mirror, not the click echo', () => {
    const b = mount('dark')
    fireEvent.click(screen.getByRole('button', { name: /Light/ }))
    expect(b.setTheme).toHaveBeenCalledWith('light')
    // No store write yet: selection is unchanged.
    expect(pressed(/Dark/)).toBe('true')
    act(() => { b.store.actions.sync({ ...SELECTION, preference: 'light' }, 1) })
    expect(pressed(/Light/)).toBe('true')
    expect(pressed(/Dark/)).toBe('false')
  })
})

describe('AppearanceRow layered selections', () => {
  it('palette swatches drive setPalette and mark the stored palette', () => {
    const b = mount('system', { palette: 'forest' })
    expect(screen.getByRole('button', { name: 'Forest' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Sakura' }))
    expect(b.setPalette).toHaveBeenCalledWith('sakura')
  })

  it('accent input shows the palette accent until set, and "follow" clears a custom accent', () => {
    const b = mount('system', { palette: 'forest' })
    const input = screen.getByLabelText<HTMLInputElement>('Accent')
    expect(input.value).toBe('#3f8f6b')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Follow palette' }).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '#123456' } })
    expect(b.setAccent).toHaveBeenCalledWith('#123456')
    cleanup()
    const custom = mount('system', { accent: '#abcdef' })
    expect(screen.getByLabelText<HTMLInputElement>('Accent').value).toBe('#abcdef')
    fireEvent.click(screen.getByRole('button', { name: 'Follow palette' }))
    expect(custom.setAccent).toHaveBeenCalledWith('')
  })

  it('falls back to the stock accent for a palette id this build does not know', () => {
    mount('system', { palette: 'from-a-newer-build' })
    expect(screen.getByLabelText<HTMLInputElement>('Accent').value).toBe('#5b7cff')
  })

  it('backdrop chips select presets; the strength slider appears only with a backdrop', () => {
    const b = mount()
    expect(screen.queryByLabelText('Strength')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Aurora' }))
    expect(b.setChatBackground).toHaveBeenCalledWith('aurora')
    cleanup()
    const tinted = mount('system', { chatBackground: 'aurora', chatOpacity: 0.3 })
    const slider = screen.getByLabelText<HTMLInputElement>('Strength')
    expect(slider.max).toBe('0.45')
    fireEvent.change(slider, { target: { value: '0.4' } })
    expect(tinted.setChatOpacity).toHaveBeenCalledWith(0.4)
  })

  it('lets a wallpaper go to full strength', () => {
    mount('system', { chatBackground: 'wallpaper:0123456789abcdef' }, ['0123456789abcdef'])
    expect(screen.getByLabelText<HTMLInputElement>('Strength').max).toBe('1')
  })
})

describe('WallpaperPicker', () => {
  const pick = async (files: File[]): Promise<void> => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Choose image'), { target: { files } })
      await Promise.resolve()
    })
  }

  it('is hidden where the Host serves no wallpaper slot', () => {
    const b = mount()
    expect(screen.getByText('Wallpaper')).toBeDefined()
    act(() => { b.store.actions.syncWallpapers(undefined) })
    expect(screen.queryByText('Wallpaper')).toBeNull()
  })

  it('offers an upload for an empty slot, and select / replace / remove for a stored image', () => {
    mount()
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
    cleanup()
    const b = mount('system', { chatBackground: 'aurora' }, ['0123456789abcdef'])
    const tile = screen.getByRole('button', { name: 'Wallpaper' })
    expect(tile.getAttribute('aria-pressed')).toBe('false')
    expect(tile.style.backgroundImage).toContain('/api/ui-theme/wallpaper?id=0123456789abcdef&variant=thumb')
    fireEvent.click(tile)
    expect(b.setChatBackground).toHaveBeenCalledWith('wallpaper:0123456789abcdef')
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(b.removeWallpaper).toHaveBeenCalledWith('0123456789abcdef')
  })

  it('opens the file chooser from the upload button', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    try {
      mount()
      fireEvent.click(screen.getByRole('button', { name: 'Choose image' }))
      expect(click).toHaveBeenCalledOnce()
    } finally {
      click.mockRestore()
    }
  })

  it('shows the image in use rather than the newest one stored', () => {
    mount('system', { chatBackground: 'wallpaper:aaaaaaaaaaaaaaaa' }, ['bbbbbbbbbbbbbbbb', 'aaaaaaaaaaaaaaaa'])
    const tile = screen.getByRole('button', { name: 'Wallpaper' })
    expect(tile.getAttribute('aria-pressed')).toBe('true')
    expect(tile.style.backgroundImage).toContain('id=aaaaaaaaaaaaaaaa')
  })

  it('rejects an oversized file before decoding it', async () => {
    const b = mount()
    const file = new File(['x'], 'huge.jpg', { type: 'image/jpeg' })
    Object.defineProperty(file, 'size', { value: 41 * 1024 * 1024 })
    await pick([file])
    expect(screen.getByRole('status').textContent).toBe(en['chat.tooBig'])
    expect(b.addWallpaper).not.toHaveBeenCalled()
  })

  it('reports a file the page cannot decode', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.reject(new Error('undecodable'))))
    try {
      const b = mount()
      await pick([new File(['not an image'], 'notes.txt')])
      expect(screen.getByRole('status').textContent).toBe(en['chat.badImage'])
      expect(b.addWallpaper).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  describe('with a working canvas', () => {
    const bitmap = { width: 3840, height: 2160, close: vi.fn() }
    const drawn: { width: number; height: number }[] = []

    const stubCanvas = (): void => {
      vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.resolve(bitmap)))
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
        drawn.push({ width: this.width, height: this.height })
        return { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' } as unknown as CanvasRenderingContext2D
      } as unknown as HTMLCanvasElement['getContext'])
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
        return `data:image/jpeg;base64,${String(this.width)}`
      })
    }
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
      drawn.length = 0
      bitmap.close.mockClear()
    })

    it('downscales the pick into a 1920px image and a 96px thumbnail, uploads, and selects it', async () => {
      stubCanvas()
      const b = mount()
      await pick([new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' })])
      expect(drawn).toEqual([{ width: 1920, height: 1080 }, { width: 96, height: 54 }])
      expect(b.addWallpaper).toHaveBeenCalledWith({ full: 'data:image/jpeg;base64,1920', thumb: 'data:image/jpeg;base64,96' })
      expect(b.setChatBackground).toHaveBeenCalledWith('wallpaper:fedcba9876543210')
      expect(bitmap.close).toHaveBeenCalled()
    })

    it('reports a rejected upload without changing the backdrop', async () => {
      stubCanvas()
      const b = mount()
      b.addWallpaper.mockResolvedValueOnce(undefined)
      await pick([new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' })])
      expect(screen.getByRole('status').textContent).toBe(en['chat.saveFailed'])
      expect(b.setChatBackground).not.toHaveBeenCalled()
    })

    it('reports a page without a 2D canvas as an undecodable image', async () => {
      stubCanvas()
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
      const b = mount()
      await pick([new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' })])
      expect(screen.getByRole('status').textContent).toBe(en['chat.badImage'])
      expect(b.addWallpaper).not.toHaveBeenCalled()
      expect(bitmap.close).toHaveBeenCalled()
    })

    it('ignores an empty pick', async () => {
      stubCanvas()
      const b = mount()
      await pick([])
      expect(b.addWallpaper).not.toHaveBeenCalled()
    })
  })
})
