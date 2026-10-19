/**
 * Desktop companion settings, browser half: contributes the companion row to Settings → General,
 * after Appearance. One short preference block does not earn a settings section of its own.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ctx.configForms and settings slot Context merges.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { DEFAULT_PET_SETTINGS, MAX_NICKNAME_CHARS, PET_SETTINGS_NAMESPACE, type PetSettings } from '../pet-settings.ts'
import { CompanionRow, type CompanionRowInjected } from './CompanionRow.tsx'
import { createCompanionRowStore } from './store.ts'
import { en, zh, type PetKey } from './locales.ts'

export type { CompanionRowInjected, CompanionRowProps } from './CompanionRow.tsx'
export type { CompanionRowState } from './store.ts'
export type { PetKey } from './locales.ts'

/** Namespace owning this row's copy. */
export const SETTINGS_NS = 'settings.pet'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The desktop companion row's copy. */
    'settings.pet': PetKey
  }
}

/** Services this plugin reads: slots and locale for the row, configForms for the preferences. */
export const inject = ['slots', 'locale', 'remote', 'configForms']

/**
 * Register the companion row into the General section.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-settings-pet: row dictionaries')
  const host = ctx.configForms.get<PetSettings>(PET_SETTINGS_NAMESPACE)

  const store = createCompanionRowStore()
  let bound: BoundActions<typeof store> | undefined
  const publish = (): void => {
    const snapshot = host.getSnapshot()
    const value = snapshot.value ?? DEFAULT_PET_SETTINGS
    bound?.sync(value.character, value.nickname, snapshot.writable, snapshot.revision ?? -1)
  }
  ctx.effect(() => host.subscribe(publish), 'ui-settings-pet: adopt the durable preferences')

  const injected = (actions: BoundActions<typeof store>): CompanionRowInjected => {
    bound = actions
    // Re-read so nothing is lost between registration and first render.
    publish()
    return {
      setCharacter: (id) => { void host.set('character', id) },
      setNickname: (nickname) => { void host.set('nickname', nickname.trim().slice(0, MAX_NICKNAME_CHARS)) },
    }
  }

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'pet-companion',
    // After Appearance (10) and font size (11): a decoration preference belongs last.
    order: 12,
    locale: SETTINGS_NS,
    store,
    inject: injected,
  }, CompanionRow))
}
