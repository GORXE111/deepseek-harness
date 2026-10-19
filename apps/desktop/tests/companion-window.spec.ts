import type { MenuItemConstructorOptions } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPANION_IPC } from '../src/companion-api.ts'
import { COMPANION_BOUNDS, CompanionWindow, companionBounds, MAX_BUBBLE_HEIGHT, type CompanionWindowOptions } from '../src/companion-window.ts'

const native = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  const windows: FakeWindow[] = []
  const page = { load: (): Promise<void> => Promise.resolve() }
  class FakeContents extends EventEmitter {
    readonly mainFrame = { name: 'main' }
    readonly send = vi.fn()
    readonly setWindowOpenHandler = vi.fn()
  }
  class FakeWindow extends EventEmitter {
    readonly webContents = new FakeContents()
    bounds: { x: number; y: number; width: number; height: number }
    destroyed = false
    readonly setAlwaysOnTop = vi.fn()
    readonly setVisibleOnAllWorkspaces = vi.fn()
    readonly showInactive = vi.fn()
    readonly setFocusable = vi.fn()
    readonly focus = vi.fn()
    readonly loadFile = vi.fn(() => page.load())
    constructor(readonly options: { x: number; y: number; width: number; height: number }) {
      super()
      this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }
      windows.push(this)
    }
    isDestroyed() { return this.destroyed }
    destroy() { this.destroyed = true; this.emit('closed') }
    getPosition() { return [this.bounds.x, this.bounds.y] }
    setPosition(x: number, y: number) { this.bounds = { ...this.bounds, x, y } }
    getBounds() { return this.bounds }
    setBounds(bounds: { x: number; y: number; width: number; height: number }) { this.bounds = bounds }
  }
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  const menus: MenuItemConstructorOptions[][] = []
  const popup = vi.fn()
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
  return {
    windows, FakeWindow, page, handlers, listeners, menus, popup, workArea,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        if (handlers.has(channel)) throw new Error(`second handler for ${channel}`)
        handlers.set(channel, handler)
      }),
      removeHandler: vi.fn((channel: string) => { handlers.delete(channel) }),
      on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        listeners.set(channel, (listeners.get(channel) ?? new Set()).add(listener))
      }),
      off: vi.fn((channel: string, listener: (...args: unknown[]) => void) => { listeners.get(channel)?.delete(listener) }),
    },
  }
})
vi.mock('electron', () => ({
  BrowserWindow: native.FakeWindow,
  ipcMain: native.ipcMain,
  Menu: { buildFromTemplate: (template: MenuItemConstructorOptions[]) => { native.menus.push(template); return { popup: native.popup } } },
  screen: { getPrimaryDisplay: () => ({ workArea: native.workArea }), getDisplayMatching: () => ({ workArea: native.workArea }) },
}))

afterEach(() => {
  for (const window of native.windows) if (!window.destroyed) window.destroy()
  native.windows.length = 0
  native.menus.length = 0
  vi.clearAllMocks()
})

function open(over: Partial<CompanionWindowOptions> = {}) {
  const options = {
    preload: 'C:/app/lib/preload-companion.cjs', page: 'C:/app/renderer/companion/companion.html', character: 'zhuang', locale: 'zh' as const,
    position: { x: 100, y: 200 }, menuLabels: { open: 'Open', fresh: 'Fresh' },
    onMoved: vi.fn(), onActivate: vi.fn(), onFreshTopic: vi.fn(), onReady: vi.fn(), onClosed: vi.fn(),
    onAsk: vi.fn(() => Promise.resolve({ ok: true as const })),
    ...over,
  }
  const companion = new CompanionWindow(options)
  const window = native.windows.at(-1)!
  const from = (contents: unknown = window.webContents, frame: unknown = window.webContents.mainFrame) =>
    ({ sender: contents, senderFrame: frame })
  const invoke = (channel: string, event: unknown, ...args: unknown[]) => native.handlers.get(channel)!(event, ...args)
  const emit = (channel: string, event: unknown, ...args: unknown[]) => {
    for (const listener of native.listeners.get(channel) ?? []) listener(event, ...args)
  }
  return { companion, window, options, from, invoke, emit }
}

describe('companion window', () => {
  it('opens a transparent, unfocusable, always-on-top window at the stored spot with the chosen character', () => {
    const f = open()
    expect(f.window.options).toMatchObject({
      x: 100, y: 200, ...COMPANION_BOUNDS.idle, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
      focusable: false, show: false,
      webPreferences: { preload: 'C:/app/lib/preload-companion.cjs', additionalArguments: ['--dsh-companion-locale=zh'], sandbox: true, contextIsolation: true },
    })
    expect(f.window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating')
    expect(f.window.loadFile).toHaveBeenCalledWith('C:/app/renderer/companion/companion.html', { query: { who: 'zhuang' } })
    f.window.emit('ready-to-show')
    expect(f.window.showInactive).toHaveBeenCalledOnce()
    expect(f.window.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({ action: 'deny' })
    const navigation = { preventDefault: vi.fn() }
    f.window.webContents.emit('will-navigate', navigation)
    expect(navigation.preventDefault).toHaveBeenCalledOnce()
  })

  it('defaults to the bottom right of the primary display and reports a failed page load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    native.page.load = () => Promise.reject(new Error('missing'))
    try {
      const f = open({ position: undefined })
      expect(f.window.options).toMatchObject({ x: 1920 - 144 - 28, y: 1040 - 144 - 96 })
      await vi.waitFor(() => { expect(error).toHaveBeenCalledOnce() })
    } finally {
      native.page.load = () => Promise.resolve()
      error.mockRestore()
    }
  })

  it('accepts requests only from its own main frame', async () => {
    const f = open()
    expect(await f.invoke(COMPANION_IPC.ask, f.from({}), 'hi')).toEqual({ ok: false, error: 'rejected' })
    expect(await f.invoke(COMPANION_IPC.ask, f.from(undefined, {}), 'hi')).toEqual({ ok: false, error: 'rejected' })
    expect(await f.invoke(COMPANION_IPC.ask, f.from(), 3)).toEqual({ ok: false, error: 'rejected' })
    expect(await f.invoke(COMPANION_IPC.ask, f.from(), 'hi')).toEqual({ ok: true })
    expect(f.options.onAsk).toHaveBeenCalledWith('hi')
    f.emit(COMPANION_IPC.ready, f.from({}))
    expect(f.options.onReady).not.toHaveBeenCalled()
    f.emit(COMPANION_IPC.ready, f.from())
    expect(f.options.onReady).toHaveBeenCalledOnce()
  })

  it('resizes by mode, focusing only for the question input', () => {
    const f = open()
    void f.invoke(COMPANION_IPC.resize, f.from(), 'open')
    expect(f.window.setFocusable).toHaveBeenLastCalledWith(true)
    expect(f.window.focus).toHaveBeenCalledOnce()
    expect(f.window.bounds).toMatchObject(COMPANION_BOUNDS.open)
    void f.invoke(COMPANION_IPC.resize, f.from(), 'bubble', 300)
    expect(f.window.setFocusable).toHaveBeenLastCalledWith(false)
    expect(f.window.bounds).toMatchObject({ width: 480, height: 300 })
    void f.invoke(COMPANION_IPC.resize, f.from(), 'idle', 'tall')
    expect(f.window.bounds).toMatchObject(COMPANION_BOUNDS.idle)
    const before = f.window.bounds
    void f.invoke(COMPANION_IPC.resize, f.from(), 'huge')
    void f.invoke(COMPANION_IPC.resize, f.from({}), 'open')
    expect(f.window.bounds).toBe(before)
  })

  it('moves by drag deltas and persists the spot once the drag settles', () => {
    vi.useFakeTimers()
    try {
      const f = open()
      f.emit(COMPANION_IPC.move, f.from(), 5, -3)
      f.emit(COMPANION_IPC.move, f.from(), 5.4, 1)
      f.emit(COMPANION_IPC.move, f.from(), Number.NaN, 1)
      f.emit(COMPANION_IPC.move, f.from(), '1', 1)
      f.emit(COMPANION_IPC.move, f.from({}), 50, 50)
      expect(f.window.getPosition()).toEqual([110, 198])
      vi.advanceTimersByTime(400)
      expect(f.options.onMoved).toHaveBeenCalledExactlyOnceWith({ x: 110, y: 198 })
      f.window.emit('moved')
      f.window.destroy()
      vi.advanceTimersByTime(400)
      expect(f.options.onMoved).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })

  it('offers the main window and a fresh topic from its context menu', () => {
    const f = open()
    f.emit(COMPANION_IPC.menu, f.from({}))
    expect(native.menus).toEqual([])
    f.emit(COMPANION_IPC.menu, f.from())
    const [openItem, , fresh] = native.menus[0]!
    expect([openItem!.label, fresh!.label]).toEqual(['Open', 'Fresh'])
    ;(openItem as { click: () => void }).click()
    ;(fresh as { click: () => void }).click()
    expect(f.options.onActivate).toHaveBeenCalledOnce()
    expect(f.options.onFreshTopic).toHaveBeenCalledOnce()
    expect(native.popup).toHaveBeenCalledWith({ window: f.window })
  })

  it('forwards presentation commands until it is destroyed, then releases its channels', () => {
    const f = open()
    f.companion.say('hi', 4000, null)
    f.companion.play('done')
    f.companion.setState('running')
    f.companion.setCharacter('miku')
    expect(f.window.webContents.send.mock.calls).toEqual([
      [COMPANION_IPC.say, 'hi', 4000, null], [COMPANION_IPC.play, 'done'], [COMPANION_IPC.state, 'running'], [COMPANION_IPC.character, 'miku'],
    ])
    f.companion.destroy()
    f.companion.destroy()
    expect(f.options.onClosed).not.toHaveBeenCalled()
    f.companion.say('late', 1, null)
    expect(f.window.webContents.send).toHaveBeenCalledTimes(4)
    expect(native.handlers.size).toBe(0)
    expect([...native.listeners.values()].every(set => set.size === 0)).toBe(true)
    // The channels are free for the next window.
    expect(() => open()).not.toThrow()
  })
})

describe('companion window closed by the user', () => {
  it('reports the close once and releases its channels', () => {
    const f = open()
    f.window.emit('closed')
    expect(f.options.onClosed).toHaveBeenCalledOnce()
    expect(native.handlers.size).toBe(0)
    f.window.destroyed = true
    f.companion.destroy()
    expect(f.options.onClosed).toHaveBeenCalledOnce()
  })
})

describe('companion bounds', () => {
  const workArea = { x: 0, y: 0, width: 1000, height: 800 }
  it('keeps her vertically in place and on her display', () => {
    expect(companionBounds('bubble', 244, { x: 100, y: 300, width: 144, height: 144 }, workArea)).toEqual({ x: 100, y: 250, width: 480, height: 244 })
    expect(companionBounds('bubble', 9999, { x: 900, y: 0, width: 144, height: 144 }, workArea))
      .toEqual({ x: 520, y: 0, width: 480, height: MAX_BUBBLE_HEIGHT })
    expect(companionBounds('bubble', 10, { x: -50, y: 790, width: 144, height: 144 }, workArea)).toEqual({ x: 0, y: 656, width: 480, height: 144 })
    expect(companionBounds('idle', 400, { x: 10, y: 10, width: 480, height: 300 }, workArea)).toEqual({ x: 10, y: 88, width: 144, height: 144 })
  })
})
