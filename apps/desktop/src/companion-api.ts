/** IPC contract between the companion window's preload and the main process. */

/** Channels of the companion window. */
export const COMPANION_IPC = {
  resize: 'dsh-companion:resize',
  move: 'dsh-companion:move',
  menu: 'dsh-companion:menu',
  ask: 'dsh-companion:ask',
  ready: 'dsh-companion:ready',
  say: 'dsh-companion:say',
  play: 'dsh-companion:play',
  state: 'dsh-companion:state',
  character: 'dsh-companion:character',
} as const

/** Window sizes: resting, speaking, and asking. */
export type CompanionMode = 'idle' | 'bubble' | 'open'

/** What the agents are doing, as the companion shows it. */
export type CompanionState = 'idle' | 'running'

/** Moments the companion acts out once; each character picks her own animation. */
export type CompanionMoment = 'done' | 'reply' | 'error' | 'greet'

/** Speech parameters sent with one bubble; null bubbles stay silent. */
export interface CompanionSpeech {
  readonly name: string
  readonly rate: number
  readonly volume: number
}

/** Outcome of one question, shown in the bubble when it failed. */
export type CompanionAskResult = { readonly ok: true } | { readonly ok: false; readonly error: string }

/** Command-line switch carrying the window's language to its sandboxed preload. */
export const COMPANION_LOCALE_SWITCH = '--dsh-companion-locale='
