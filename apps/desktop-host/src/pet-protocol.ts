/**
 * Messages between the Desktop Host's companion bridge and the Electron shell, carried in a
 * `{ type: 'pet' }` envelope over the private Node IPC channel. The bridge sends nothing until
 * the shell sends `start`, so a shell that does not know the envelope never receives one.
 */

import type { PetSettings } from '@deepseek-ai/dsh-client-ui-settings-pet'

/** One finished turn of a non-companion session: the material for a completion notice. */
export interface PetDigest {
  /** Session whose turn ended. */
  readonly sessionId: string
  /** The human prompt that opened the turn, truncated; empty when the turn started before observation. */
  readonly prompt: string
  /** The turn's assistant text, truncated; reasoning and tool calls are excluded. */
  readonly answer: string
  /** Tool calls the turn made. */
  readonly tools: number
  /** Milliseconds from the observed prompt to the turn end. */
  readonly durationMs: number
}

/** Host → shell companion events. */
export type PetHostEvent =
  | { readonly kind: 'settings'; readonly settings: PetSettings }
  | { readonly kind: 'busy'; readonly running: boolean }
  | { readonly kind: 'digest'; readonly digest: PetDigest }
  | { readonly kind: 'speech'; readonly who: string; readonly text: string }
  /** A companion's own turn ended; `error` carries the failure when the turn failed. */
  | { readonly kind: 'turn-end'; readonly who: string; readonly error?: string }
  | {
    readonly kind: 'ask-result'
    readonly requestId: number
    readonly ok: boolean
    readonly error?: string
    /** The question opened a new day's session; the companion no longer remembers earlier days. */
    readonly newDay?: true
  }

/** Shell → Host companion commands. */
export type PetShellCommand =
  | { readonly kind: 'start' }
  | { readonly kind: 'stop' }
  | {
    readonly kind: 'ask'
    readonly requestId: number
    /** Companion id the question is for; each companion keeps its own session. */
    readonly who: string
    /** Agent preset the companion's session runs. */
    readonly preset: string
    readonly text: string
    /** Locale of the nickname note prefixed after a nickname change. */
    readonly locale: 'zh' | 'en'
  }
  | { readonly kind: 'fresh-topic'; readonly who: string }

/** Longest question the bridge forwards. */
export const MAX_PET_QUESTION_CHARS = 2000

/**
 * Narrow one IPC payload to a companion command.
 * @param value - the `command` field of a `{ type: 'pet' }` message.
 * @returns whether it is a well-formed command.
 */
export function isPetShellCommand(value: unknown): value is PetShellCommand {
  if (typeof value !== 'object' || value === null) return false
  const command = value as Record<string, unknown>
  switch (command.kind) {
    case 'start':
    case 'stop':
      return true
    case 'fresh-topic':
      return typeof command.who === 'string' && command.who !== ''
    case 'ask':
      return Number.isSafeInteger(command.requestId)
        && typeof command.who === 'string' && command.who !== ''
        && typeof command.preset === 'string' && command.preset !== ''
        && typeof command.text === 'string' && command.text.trim() !== '' && command.text.length <= MAX_PET_QUESTION_CHARS
        && (command.locale === 'zh' || command.locale === 'en')
    default:
      return false
  }
}
