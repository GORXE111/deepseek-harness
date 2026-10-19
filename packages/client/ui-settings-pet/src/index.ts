/**
 * Desktop companion settings, Host half: owns the `pet` entry, whose live config holds the
 * companion preferences, and publishes them to the desktop bridge.
 *
 * The companion lives in a small frameless window with no settings surface of its own; putting
 * the preferences in Settings makes them reachable where users look for preferences. The desktop
 * bridge reads them through the `petSettings` service and follows `pet/settings-changed`, so a
 * companion switch shows at once.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_PET_SETTINGS, VOICE_FORMATS, VOICE_PROVIDERS, VOICE_SCOPES, type PetSettings,
} from './pet-settings.ts'

export {
  COMPANIONS, DEFAULT_PET_SETTINGS, MAX_NICKNAME_CHARS, PET_SETTINGS_NAMESPACE, VOICE_FORMATS,
  VOICE_PROVIDERS, VOICE_RATE_MAX, VOICE_RATE_MIN, VOICE_SCOPES,
  type PetSettings, type VoiceFormat, type VoiceProvider, type VoiceScope,
} from './pet-settings.ts'

/** Read access to the current companion preferences. */
export interface PetSettingsReader {
  /** @returns a copy of the current preferences. */
  get(): PetSettings
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Current desktop companion preferences, provided by the `pet` entry. */
    petSettings: PetSettingsReader
  }
  interface Events {
    /**
     * The companion preferences changed in place.
     * @mode emit
     * @param settings - the preferences after the change.
     */
    'pet/settings-changed'(settings: PetSettings): void
  }
}

/** Live configuration: every field updates in place without restarting the entry. */
export type Config = { [K in keyof PetSettings]: Volatile<PetSettings[K]> }

/** Companion preferences; the `voice*` fields have no settings row but keep validating. */
export const Config = z.object({
  character: z.string().default(DEFAULT_PET_SETTINGS.character).volatile(),
  nickname: z.string().default(DEFAULT_PET_SETTINGS.nickname).volatile(),
  voice: z.boolean().default(DEFAULT_PET_SETTINGS.voice).volatile(),
  voiceName: z.string().default(DEFAULT_PET_SETTINGS.voiceName).volatile(),
  voiceRate: z.number().default(DEFAULT_PET_SETTINGS.voiceRate).volatile(),
  voiceVolume: z.number().default(DEFAULT_PET_SETTINGS.voiceVolume).volatile(),
  voiceScope: z.union([...VOICE_SCOPES]).default(DEFAULT_PET_SETTINGS.voiceScope).volatile(),
  voiceProvider: z.union([...VOICE_PROVIDERS]).default(DEFAULT_PET_SETTINGS.voiceProvider).volatile(),
  voiceUrl: z.string().default(DEFAULT_PET_SETTINGS.voiceUrl).volatile(),
  voiceKey: z.string().default(DEFAULT_PET_SETTINGS.voiceKey).volatile(),
  voiceModel: z.string().default(DEFAULT_PET_SETTINGS.voiceModel).volatile(),
  voiceId: z.string().default(DEFAULT_PET_SETTINGS.voiceId).volatile(),
  voiceFormat: z.union([...VOICE_FORMATS]).default(DEFAULT_PET_SETTINGS.voiceFormat).volatile(),
})

/**
 * Read every field of the live config into one plain object.
 * @param config - live companion config.
 * @returns the current preferences.
 */
export function readPetSettings(config: Config): PetSettings {
  const entries = Object.entries(config).map(([key, value]) => [key, (value as Volatile<unknown>).get()])
  return Object.fromEntries(entries) as unknown as PetSettings
}

/**
 * Register the settings presentation, provide the reader, and announce in-place changes.
 * @param ctx - Host plugin context.
 * @param config - live companion config.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  ctx.provide('petSettings', { get: () => readPetSettings(config) } satisfies PetSettingsReader)
  ctx.on('loader/volatile-update', () => { ctx.root.emit('pet/settings-changed', readPetSettings(config)) })
}
