/**
 * Desktop companion messages exchanged with the Host's companion bridge inside a `{ type: 'pet' }`
 * envelope on the private Host IPC channel. The shapes mirror `apps/desktop-host/src/pet-protocol.ts`;
 * the shell validates every event here because an invalid Host message stops the Host.
 */

/** Companion preferences the shell acts on; the Host sends the whole `pet` entry, and other fields are ignored. */
export interface CompanionSettings {
  readonly character: string
  readonly nickname: string
  readonly voice: boolean
  readonly voiceName: string
  readonly voiceRate: number
  readonly voiceVolume: number
  readonly voiceScope: 'alerts' | 'all'
}

/** One finished turn of a non-companion session. */
export interface CompanionDigest {
  readonly sessionId: string
  /** The human prompt that opened the turn; empty when the turn started before observation. */
  readonly prompt: string
  readonly answer: string
  readonly tools: number
  readonly durationMs: number
}

/** Host → shell companion events. */
export type CompanionHostEvent =
  | { readonly kind: 'settings'; readonly settings: CompanionSettings }
  | { readonly kind: 'busy'; readonly running: boolean }
  | { readonly kind: 'digest'; readonly digest: CompanionDigest }
  | { readonly kind: 'speech'; readonly who: string; readonly text: string }
  | {
    readonly kind: 'ask-result'
    readonly requestId: number
    readonly ok: boolean
    readonly error?: string
    /** The question opened a new day's session. */
    readonly newDay?: true
  }

/** Shell → Host companion commands. */
export type CompanionShellCommand =
  | { readonly kind: 'start' }
  | { readonly kind: 'stop' }
  | {
    readonly kind: 'ask'
    readonly requestId: number
    readonly who: string
    readonly preset: string
    readonly text: string
    readonly locale: 'zh' | 'en'
  }
  | { readonly kind: 'fresh-topic'; readonly who: string }

/** Longest question the Host accepts. */
export const MAX_COMPANION_QUESTION_CHARS = 2000

const string = (value: unknown): value is string => typeof value === 'string'
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function settingsOf(value: unknown): CompanionSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const settings = value as Record<string, unknown>
  if (!string(settings.character) || !string(settings.nickname) || typeof settings.voice !== 'boolean'
    || !string(settings.voiceName) || !finite(settings.voiceRate) || !finite(settings.voiceVolume)) return undefined
  return {
    character: settings.character,
    nickname: settings.nickname,
    voice: settings.voice,
    voiceName: settings.voiceName,
    voiceRate: settings.voiceRate,
    voiceVolume: settings.voiceVolume,
    voiceScope: settings.voiceScope === 'all' ? 'all' : 'alerts',
  }
}

/**
 * Validate one companion event from the Host and keep only the fields the shell reads.
 * @param value - the `event` field of a `{ type: 'pet' }` Host message.
 * @returns the normalized event, or undefined when it is malformed.
 */
export function readCompanionHostEvent(value: unknown): CompanionHostEvent | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const event = value as Record<string, unknown>
  switch (event.kind) {
    case 'settings': {
      const settings = settingsOf(event.settings)
      return settings === undefined ? undefined : { kind: 'settings', settings }
    }
    case 'busy':
      return typeof event.running === 'boolean' ? { kind: 'busy', running: event.running } : undefined
    case 'digest': {
      const digest = event.digest as Record<string, unknown> | null | undefined
      if (typeof digest !== 'object' || digest === null || !string(digest.sessionId) || !string(digest.prompt)
        || !string(digest.answer) || !finite(digest.tools) || !finite(digest.durationMs)) return undefined
      return { kind: 'digest', digest: {
        sessionId: digest.sessionId, prompt: digest.prompt, answer: digest.answer, tools: digest.tools, durationMs: digest.durationMs,
      } }
    }
    case 'speech':
      return string(event.who) && string(event.text) ? { kind: 'speech', who: event.who, text: event.text } : undefined
    case 'ask-result':
      if (!Number.isSafeInteger(event.requestId) || typeof event.ok !== 'boolean'
        || (event.error !== undefined && !string(event.error)) || (event.newDay !== undefined && event.newDay !== true)) return undefined
      return {
        kind: 'ask-result', requestId: event.requestId as number, ok: event.ok,
        ...event.error === undefined ? {} : { error: event.error as string },
        ...event.newDay === true ? { newDay: true } : {},
      }
    default:
      return undefined
  }
}
