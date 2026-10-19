/**
 * The companion's floating window: a small transparent frameless window that stays on top, out
 * of the taskbar, and never takes focus unless the question input is open.
 *
 * The window always hugs its visible content (resting, speaking, asking). Transparent margins
 * still block clicks to the windows below, and avoiding that needs per-frame hit testing.
 */

import { BrowserWindow, ipcMain, Menu, screen, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import {
  COMPANION_IPC, COMPANION_LOCALE_SWITCH, type CompanionAskResult, type CompanionMode, type CompanionMoment,
  type CompanionSpeech, type CompanionState,
} from './companion-api.ts'

/** Window sizes; the speaking height is a minimum, raised to the height the page measures for its text. */
export const COMPANION_BOUNDS: Readonly<Record<CompanionMode, { readonly width: number; readonly height: number }>> = {
  idle: { width: 144, height: 144 },
  bubble: { width: 480, height: 144 },
  open: { width: 496, height: 144 },
}

/** Tallest speaking window; taller stops being a word on the desktop and becomes a window in the way. */
export const MAX_BUBBLE_HEIGHT = 520

/** Delay before a moved position is persisted. */
const PERSIST_DELAY_MS = 400

/** A screen position in device-independent pixels. */
export interface CompanionPosition {
  readonly x: number
  readonly y: number
}

/** Presentation commands the controller sends to the companion window. */
export interface CompanionView {
  say(text: string, ms: number, speech: CompanionSpeech | null): void
  play(moment: CompanionMoment): void
  setState(state: CompanionState): void
  setCharacter(id: string): void
  destroy(): void
}

/** Construction inputs and the window's requests to its controller. */
export interface CompanionWindowOptions {
  /** Built sandboxed preload. */
  readonly preload: string
  /** Companion page. */
  readonly page: string
  /** Character drawn first, so the page never shows the default character before the chosen one. */
  readonly character: string
  readonly locale: 'zh' | 'en'
  readonly position: CompanionPosition | undefined
  readonly menuLabels: { readonly open: string; readonly fresh: string }
  readonly onMoved: (position: CompanionPosition) => void
  readonly onActivate: () => void
  readonly onFreshTopic: () => void
  readonly onAsk: (text: string) => Promise<CompanionAskResult>
  /** The page decoded its sprites and can receive state. */
  readonly onReady: () => void
}

/**
 * Size and place the window for a mode, keeping the character still and the window on her display.
 * @param mode - the requested mode.
 * @param measured - page-measured content height; only the speaking mode uses it.
 * @param old - current window bounds.
 * @param workArea - work area of the display the window is on.
 * @returns the new bounds.
 */
export function companionBounds(
  mode: CompanionMode, measured: number | undefined, old: Electron.Rectangle, workArea: Electron.Rectangle,
): Electron.Rectangle {
  const base = COMPANION_BOUNDS[mode]
  const height = mode === 'bubble' && measured !== undefined && Number.isFinite(measured)
    ? Math.min(MAX_BUBBLE_HEIGHT, Math.max(base.height, Math.round(measured)))
    : base.height
  // She is centered vertically; moving the top by half the height change keeps her in place.
  const y = old.y + Math.round((old.height - height) / 2)
  return {
    x: Math.max(workArea.x, Math.min(old.x, workArea.x + workArea.width - base.width)),
    y: Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height)),
    width: base.width,
    height,
  }
}

/** One companion window and the IPC it owns while it exists. */
export class CompanionWindow implements CompanionView {
  private readonly window: BrowserWindow
  private persistTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  /** @param options - page, initial state, and the controller's handlers. */
  constructor(private readonly options: CompanionWindowOptions) {
    const fallback = (): CompanionPosition => {
      // Bottom right by default, near the tray, usually the emptiest corner.
      const { workArea } = screen.getPrimaryDisplay()
      return {
        x: workArea.x + workArea.width - COMPANION_BOUNDS.idle.width - 28,
        y: workArea.y + workArea.height - COMPANION_BOUNDS.idle.height - 96,
      }
    }
    const spot = options.position ?? fallback()
    const window = new BrowserWindow({
      ...COMPANION_BOUNDS.idle,
      x: spot.x,
      y: spot.y,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      // Clicking her must not interrupt what the user was doing.
      focusable: false,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: options.preload,
        additionalArguments: [`${COMPANION_LOCALE_SWITCH}${options.locale}`],
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: false,
      },
    })
    this.window = window
    // Visible above full-screen applications too, or she disappears whenever one is open.
    window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => { event.preventDefault() })
    // System moves (a display change) still arrive as events.
    window.on('moved', () => { this.schedulePersist() })
    window.once('ready-to-show', () => { window.showInactive() })
    window.once('closed', () => { this.dispose() })

    ipcMain.handle(COMPANION_IPC.resize, (event, mode: unknown, height: unknown) => {
      if (!this.owns(event)) return
      if (mode !== 'idle' && mode !== 'bubble' && mode !== 'open') return
      this.resize(mode, typeof height === 'number' ? height : undefined)
    })
    ipcMain.handle(COMPANION_IPC.ask, async (event, text: unknown): Promise<CompanionAskResult> => {
      if (!this.owns(event) || typeof text !== 'string') return { ok: false, error: 'rejected' }
      return options.onAsk(text)
    })
    ipcMain.on(COMPANION_IPC.move, this.onMove)
    ipcMain.on(COMPANION_IPC.menu, this.onMenu)
    ipcMain.on(COMPANION_IPC.ready, this.onReady)
    void window.loadFile(options.page, { query: { who: options.character } }).catch((error: unknown) => {
      console.error('desktop companion: page failed to load', error)
    })
  }

  private owns(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
    return !this.disposed && !this.window.isDestroyed() && event.sender === this.window.webContents
      && event.senderFrame === this.window.webContents.mainFrame
  }

  // Dragging is drawn by the page rather than `-webkit-app-region: drag`: a system drag swallows
  // pointer events, so the page could not act out being held. Deltas, not positions: the window
  // moves under the pointer, so window-relative positions would compound every frame.
  private readonly onMove = (event: IpcMainEvent, dx: unknown, dy: unknown): void => {
    if (!this.owns(event) || typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    const [x, y] = this.window.getPosition() as [number, number]
    this.window.setPosition(Math.round(x + dx), Math.round(y + dy))
    // Driven by the move itself: Windows emits no `moved` for programmatic setPosition.
    this.schedulePersist()
  }

  // No "close companion" here: right-click is where mistakes happen, and losing her costs more
  // than the trip to the application menu.
  private readonly onMenu = (event: IpcMainEvent): void => {
    if (!this.owns(event)) return
    Menu.buildFromTemplate([
      { label: this.options.menuLabels.open, click: () => { this.options.onActivate() } },
      { type: 'separator' },
      { label: this.options.menuLabels.fresh, click: () => { this.options.onFreshTopic() } },
    ]).popup({ window: this.window })
  }

  private readonly onReady = (event: IpcMainEvent): void => {
    if (this.owns(event)) this.options.onReady()
  }

  private schedulePersist(): void {
    clearTimeout(this.persistTimer)
    // Destroying the window clears this timer, so it always reads a live window.
    this.persistTimer = setTimeout(() => {
      const [x, y] = this.window.getPosition() as [number, number]
      this.options.onMoved({ x, y })
    }, PERSIST_DELAY_MS)
  }

  /**
   * Resize for a mode. Only the open input may take focus; speaking and resting never steal it.
   * @param mode - target mode.
   * @param measured - page-measured speaking height.
   */
  private resize(mode: CompanionMode, measured: number | undefined): void {
    const old = this.window.getBounds()
    const { workArea } = screen.getDisplayMatching(old)
    this.window.setFocusable(mode === 'open')
    this.window.setBounds(companionBounds(mode, measured, old, workArea))
    if (mode === 'open') this.window.focus()
  }

  private send(channel: string, ...args: unknown[]): void {
    // A message before the page listens is dropped; the page asks for state once it is ready.
    if (!this.window.isDestroyed()) this.window.webContents.send(channel, ...args)
  }

  say(text: string, ms: number, speech: CompanionSpeech | null): void { this.send(COMPANION_IPC.say, text, ms, speech) }
  play(moment: CompanionMoment): void { this.send(COMPANION_IPC.play, moment) }
  setState(state: CompanionState): void { this.send(COMPANION_IPC.state, state) }
  setCharacter(id: string): void { this.send(COMPANION_IPC.character, id) }

  private dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.persistTimer)
    ipcMain.removeHandler(COMPANION_IPC.resize)
    ipcMain.removeHandler(COMPANION_IPC.ask)
    ipcMain.off(COMPANION_IPC.move, this.onMove)
    ipcMain.off(COMPANION_IPC.menu, this.onMenu)
    ipcMain.off(COMPANION_IPC.ready, this.onReady)
  }

  destroy(): void {
    this.dispose()
    if (!this.window.isDestroyed()) this.window.destroy()
  }
}
