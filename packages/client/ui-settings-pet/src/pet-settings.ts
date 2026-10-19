/**
 * Desktop companion preferences in the `pet` settings namespace, shared by the Host entry, the
 * desktop bridge, and the browser row. Dependency-free on purpose: the browser bundle imports it,
 * and the schema library stays on the Host side (src/index.ts).
 */

/**
 * Settings namespace and Loader entry id. It keeps the 0.1 build's `settings.yaml` section name,
 * so the one-time legacy import lands the existing preferences here.
 */
export const PET_SETTINGS_NAMESPACE = 'pet'

/** Longest nickname the bubble carries without pushing the message out of view. */
export const MAX_NICKNAME_CHARS = 16

/** Speech rate bounds; outside them the voice stops being intelligible. */
export const VOICE_RATE_MIN = 0.7

/** Upper speech-rate bound. */
export const VOICE_RATE_MAX = 1.6

/** Where the speech comes from. */
export const VOICE_PROVIDERS = ['system', 'http'] as const

/** One speech source. */
export type VoiceProvider = typeof VOICE_PROVIDERS[number]

/** Audio encodings an OpenAI-compatible speech endpoint may return. */
export const VOICE_FORMATS = ['mp3', 'wav', 'opus', 'aac', 'flac'] as const

/** One requested audio encoding. */
export type VoiceFormat = typeof VOICE_FORMATS[number]

/** What the companion reads aloud. */
export const VOICE_SCOPES = ['alerts', 'all'] as const

/** One read-aloud scope. */
export type VoiceScope = typeof VOICE_SCOPES[number]

/**
 * Selectable desktop companions, in row order. The desktop shell owns what each one looks like
 * and which agent preset she speaks with; an id it does not know falls back to the first.
 */
export const COMPANIONS = [
  { id: 'miku', name: 'MIKU' },
  { id: 'zhuang', name: '庄方宜' },
] as const

/** Durable companion preferences. */
export interface PetSettings {
  /** Who sits on the desktop. A free string, so an id from a newer build falls back instead of rejecting the document. */
  character: string
  /** What the companion calls the user; `''` addresses nobody rather than inventing a name. */
  nickname: string
  /**
   * Read notifications aloud. No settings row drives this or the other `voice*` fields: the
   * Chinese system voices sound like a public address system, so speech stays an extension point
   * a user enables by editing the settings document.
   */
  voice: boolean
  /** System voice name; `''` picks automatically, and a name the machine lacks falls back. */
  voiceName: string
  /** Speech rate, within the voice-rate bounds. There is no pitch field: on Windows pitch has no effect. */
  voiceRate: number
  /** Speech volume, 0 to 1. */
  voiceVolume: number
  /** `alerts` reads what asks for the user; `all` also reads chat answers. */
  voiceScope: VoiceScope
  /** `system` uses installed voices; `http` posts to an OpenAI-compatible `/v1/audio/speech` endpoint. */
  voiceProvider: VoiceProvider
  /** Full endpoint URL. */
  voiceUrl: string
  /** Bearer token for that endpoint; empty sends no Authorization header. */
  voiceKey: string
  /** Model id the endpoint expects. */
  voiceModel: string
  /** Voice id the endpoint expects. */
  voiceId: string
  /** Audio encoding to request. */
  voiceFormat: VoiceFormat
}

/** Preferences when the settings document has no `pet` section. */
export const DEFAULT_PET_SETTINGS: Readonly<PetSettings> = Object.freeze({
  character: 'miku',
  nickname: '',
  voice: false,
  voiceName: '',
  voiceRate: 1.1,
  voiceVolume: 0.85,
  voiceScope: 'alerts',
  voiceProvider: 'system',
  voiceUrl: '',
  voiceKey: '',
  voiceModel: '',
  voiceId: '',
  voiceFormat: 'mp3',
})
