/**
 * Desktop companion controller: turns Host companion events into what she shows and says, and
 * routes her questions to the Host.
 *
 * The Host reports facts (finished turns, whether agents run, her own replies, the settings);
 * this controller decides whether and how she speaks. She is off by default: something that
 * floats above every other window should not appear on its own after installation. Whether she
 * is shown and where she stands are shell preferences, kept beside the shell settings.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createAnnouncer, composeAnnouncement, type Announcer, type AnnouncerOptions } from './companion-announce.ts'
import type { CompanionAskResult, CompanionSpeech } from './companion-api.ts'
import { companionCharacter, type CompanionLines } from './companion-characters.ts'
import {
  MAX_COMPANION_QUESTION_CHARS, type CompanionDigest, type CompanionHostEvent, type CompanionSettings, type CompanionShellCommand,
} from './companion-protocol.ts'
import type { CompanionPosition, CompanionView, CompanionWindowOptions } from './companion-window.ts'

/** How long a question waits for the Host to accept it. */
export const ASK_DEADLINE_MS = 30_000

/** Stored shell preferences of the companion. */
export interface CompanionPreferences {
  readonly enabled: boolean
  readonly position?: CompanionPosition
}

/** Handlers the controller gives a new window. */
export type CompanionWindowHandlers = Pick<CompanionWindowOptions,
  'character' | 'locale' | 'position' | 'menuLabels' | 'onMoved' | 'onActivate' | 'onFreshTopic' | 'onAsk' | 'onReady'>

/** Environment of the controller. */
export interface DesktopCompanionOptions {
  /** Preference document, `<userData>/desktop/companion.json`. */
  readonly storePath: string
  /** Current shell language. */
  readonly language: () => 'zh' | 'en'
  readonly menuLabels: () => { readonly open: string; readonly fresh: string }
  /** Whether the main window has focus; its output is then in front of the user already. */
  readonly mainWindowFocused: () => boolean
  readonly openMainWindow: () => void
  readonly openWindow: (handlers: CompanionWindowHandlers) => CompanionView
  /** Called after the shown state changes, so menus can update their check marks. */
  readonly onEnabledChange?: () => void
  /** Announcer clock and timer overrides for tests. */
  readonly announcer?: Omit<AnnouncerOptions, 'emit'>
  readonly askDeadlineMs?: number
}

function readPreferences(path: string): CompanionPreferences {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const position = value.position as Record<string, unknown> | undefined
    return {
      enabled: value.enabled === true,
      ...typeof position === 'object' && position !== null && Number.isFinite(position.x) && Number.isFinite(position.y)
        ? { position: { x: position.x as number, y: position.y as number } } : {},
    }
  } catch { return { enabled: false } }
}

/** The companion's lifetime across Host restarts and show/hide toggles. */
export class DesktopCompanion {
  private preferences: CompanionPreferences
  private view: CompanionView | undefined
  private send: ((command: CompanionShellCommand) => void) | undefined
  private started = false
  private settings: CompanionSettings | undefined
  private busy = false
  private nextRequest = 1
  private readonly asks = new Map<number, {
    resolve: (result: CompanionAskResult & { newDay?: true }) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  private readonly announcer: Announcer

  /** @param options - storage, environment, and window factory. */
  constructor(private readonly options: DesktopCompanionOptions) {
    this.preferences = readPreferences(options.storePath)
    this.announcer = createAnnouncer({ ...options.announcer, emit: (digests) => { this.announce(digests) } })
  }

  /** Whether the companion is set to be shown. */
  get enabled(): boolean { return this.preferences.enabled }

  private get character(): string { return companionCharacter(this.settings?.character ?? '').id }

  private lines(): CompanionLines {
    const { lines } = companionCharacter(this.character)
    return this.options.language() === 'zh' ? lines.zh : lines.en
  }

  private persist(next: CompanionPreferences): void {
    this.preferences = next
    try {
      mkdirSync(dirname(this.options.storePath), { recursive: true })
      writeFileSync(this.options.storePath, `${JSON.stringify(next, undefined, 2)}\n`)
    } catch (error) { console.warn('desktop companion: preferences could not be saved', error) }
  }

  /**
   * Show or hide the companion; the choice persists. Hiding drops collected announcements, which
   * would otherwise surface minutes late the next time she appears.
   * @param enabled - whether she is shown.
   */
  setEnabled(enabled: boolean): void {
    if (enabled === this.preferences.enabled) return
    this.persist({ ...this.preferences, enabled })
    if (enabled) this.show()
    else this.hide()
    this.options.onEnabledChange?.()
  }

  private show(): void {
    // Opened once the Host has started, so she appears as the chosen character rather than the default one first.
    if (this.view !== undefined || !this.preferences.enabled || !this.started) return
    this.view = this.options.openWindow({
      character: this.character,
      locale: this.options.language(),
      position: this.preferences.position,
      menuLabels: this.options.menuLabels(),
      onMoved: (position) => { this.persist({ ...this.preferences, position }) },
      onActivate: () => { this.options.openMainWindow() },
      onFreshTopic: () => { this.freshTopic() },
      onAsk: text => this.ask(text),
      onReady: () => {
        this.view?.setState(this.busy ? 'running' : 'idle')
        this.view?.play('greet')
      },
    })
  }

  private hide(): void {
    this.announcer.cancel()
    this.view?.destroy()
    this.view = undefined
  }

  /**
   * Connect a running Host. It stays silent until this sends `start`.
   * @param send - delivers one command to the Host.
   */
  attach(send: (command: CompanionShellCommand) => void): void {
    this.send = send
    this.started = false
    send({ kind: 'start' })
  }

  /** Forget a stopped Host; pending questions fail, and the agents are no longer running. */
  detach(): void {
    this.send = undefined
    for (const [requestId, ask] of this.asks) {
      clearTimeout(ask.timer)
      this.asks.delete(requestId)
      ask.resolve({ ok: false, error: this.lines().noSession })
    }
    if (this.busy) {
      this.busy = false
      this.view?.setState('idle')
    }
  }

  /**
   * Act on one Host companion event.
   * @param event - validated event.
   */
  receive(event: CompanionHostEvent): void {
    switch (event.kind) {
      case 'settings': {
        const before = this.character
        this.settings = event.settings
        if (this.character !== before) this.view?.setCharacter(this.character)
        return
      }
      case 'busy':
        this.busy = event.running
        // The Host answers `start` with settings first and busy state last; she can appear now.
        // A window kept open across a Host restart only takes the new state.
        if (!this.started) {
          this.started = true
          if (this.view === undefined) { this.show(); return }
        }
        this.view?.setState(event.running ? 'running' : 'idle')
        return
      case 'digest':
        if (this.view !== undefined) this.announcer.offer(event.digest)
        return
      case 'speech':
        this.speak(event.who, event.text)
        return
      case 'ask-result': {
        const ask = this.asks.get(event.requestId)
        if (ask === undefined) return
        clearTimeout(ask.timer)
        this.asks.delete(event.requestId)
        ask.resolve(event.ok
          ? { ok: true, ...event.newDay === true ? { newDay: true } : {} }
          : { ok: false, error: event.error ?? this.lines().noSession })
      }
    }
  }

  private speech(alert: boolean): CompanionSpeech | null {
    const settings = this.settings
    if (settings?.voice !== true) return null
    // Her answers to your own questions are read aloud only when the scope says so; you are looking at them.
    if (!alert && settings.voiceScope !== 'all') return null
    return { name: settings.voiceName, rate: settings.voiceRate, volume: settings.voiceVolume }
  }

  private speak(who: string, text: string): void {
    // Only the current character speaks; another companion's late reply is not hers to say.
    if (this.view === undefined || who !== this.character) return
    this.view.play('reply')
    this.view.setState(this.busy ? 'running' : 'idle')
    this.view.say(text, Math.min(24_000, Math.max(6000, text.length * 220)), this.speech(false))
  }

  private announce(digests: CompanionDigest[]): void {
    const view = this.view
    if (view === undefined) return
    // The main window is in front of the user with the full output; a bubble would only cover it.
    if (this.options.mainWindowFocused()) { view.play('done'); return }
    const text = composeAnnouncement(digests, this.settings?.nickname ?? '', this.lines())
    view.play('done')
    view.say(text, Math.min(20_000, 6000 + digests.length * 2000), this.speech(true))
  }

  /**
   * Send a question to the current character's session.
   * @param text - the question.
   * @returns whether the Host accepted it; failures carry text for the bubble.
   */
  async ask(text: string): Promise<CompanionAskResult> {
    const question = text.trim()
    if (question === '') return { ok: false, error: this.lines().noSession }
    const send = this.send
    if (send === undefined) return { ok: false, error: this.lines().noSession }
    const requestId = this.nextRequest++
    const character = companionCharacter(this.character)
    const result = await new Promise<CompanionAskResult & { newDay?: true }>((resolve) => {
      const timer = setTimeout(() => {
        this.asks.delete(requestId)
        resolve({ ok: false, error: this.lines().noSession })
      }, this.options.askDeadlineMs ?? ASK_DEADLINE_MS)
      this.asks.set(requestId, { resolve, timer })
      send({
        kind: 'ask', requestId, who: character.id, preset: character.preset,
        text: question.slice(0, MAX_COMPANION_QUESTION_CHARS), locale: this.options.language(),
      })
    })
    if (!result.ok) return result
    // She is thinking now; her reply returns her to the agents' state.
    this.view?.setState('running')
    // Forgetting yesterday must be said, or she seems to lose her memory for no reason.
    if (result.newDay === true) this.view?.say(this.lines().newDay, 3600, null)
    return { ok: true }
  }

  /** Set the current character's conversation aside; her next question opens a new one. */
  freshTopic(): void {
    this.send?.({ kind: 'fresh-topic', who: this.character })
    this.view?.say(this.lines().fresh, 2600, null)
  }

  /** Close the window for quitting; the stored preference stays. */
  dispose(): void {
    this.hide()
    this.detach()
  }
}
