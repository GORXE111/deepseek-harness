/**
 * Narrow bridge of the companion window: the page states intents, and the main process decides
 * window size, menu entries, and where a question goes.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  COMPANION_IPC, COMPANION_LOCALE_SWITCH, type CompanionAskResult, type CompanionMode, type CompanionMoment,
  type CompanionSpeech, type CompanionState,
} from './companion-api.ts'

const locale = process.argv.find(argument => argument.startsWith(COMPANION_LOCALE_SWITCH))?.slice(COMPANION_LOCALE_SWITCH.length)

const subscribe = <Args extends unknown[]>(channel: string, listener: (...args: Args) => void): void => {
  ipcRenderer.on(channel, (_event: IpcRendererEvent, ...args: unknown[]) => { listener(...args as Args) })
}

contextBridge.exposeInMainWorld('dshCompanion', {
  locale: locale === 'zh' ? 'zh' : 'en',
  /** Resize the window; resolves once the window has its new size, so the page can animate after it. */
  resize: (mode: CompanionMode, height?: number) => ipcRenderer.invoke(COMPANION_IPC.resize, mode, height) as Promise<void>,
  /** Move by a delta; one message per drag frame, unanswered so the window keeps up with the pointer. */
  moveBy: (dx: number, dy: number) => { ipcRenderer.send(COMPANION_IPC.move, dx, dy) },
  /** Native context menus are drawn by the main process. */
  menu: () => { ipcRenderer.send(COMPANION_IPC.menu) },
  ask: (text: string) => ipcRenderer.invoke(COMPANION_IPC.ask, text) as Promise<CompanionAskResult>,
  /** The sprites are decoded; the main process answers with the current state. */
  ready: () => { ipcRenderer.send(COMPANION_IPC.ready) },
  onSay: (listener: (text: string, ms: number, speech: CompanionSpeech | null) => void) => { subscribe(COMPANION_IPC.say, listener) },
  onPlay: (listener: (moment: CompanionMoment) => void) => { subscribe(COMPANION_IPC.play, listener) },
  onState: (listener: (state: CompanionState) => void) => { subscribe(COMPANION_IPC.state, listener) },
  onCharacter: (listener: (id: string) => void) => { subscribe(COMPANION_IPC.character, listener) },
})
