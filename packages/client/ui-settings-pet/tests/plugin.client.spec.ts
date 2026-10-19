/** Desktop companion settings browser half: row registration, settings mirror, and writes. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, SETTINGS_NS } from '../src/client/index.ts'
import type { CompanionRowInjected } from '../src/client/CompanionRow.tsx'
import type { createCompanionRowStore } from '../src/client/store.ts'
import { DEFAULT_PET_SETTINGS, type PetSettings } from '../src/pet-settings.ts'

async function bench() {
  const host = stubConfigForm<PetSettings>()
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('remote', {} as never)
  ctx.provide('configForms', { get: (ns: string) => { expect(ns).toBe('pet'); return host.scope } } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'settings.general.item': { kind: 'list', scope: 'root' } } } as never, () => null)
  await ctx.plugin({ inject: [...inject], apply }).await()
  const entry = slots.entries('settings.general.item')[0]!
  const instance = (entry.store as ReturnType<typeof createCompanionRowStore>).create()
  const face = (entry.inject as unknown as (a: typeof instance.actions) => CompanionRowInjected)(instance.actions)
  return { host, entry, instance, face }
}

describe('ui-settings-pet browser plugin', () => {
  it('declares the services it reads', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'configForms'])
  })

  it('registers the companion row after Appearance and mirrors the durable section', async () => {
    const { host, entry, instance } = await bench()
    expect(entry.options).toMatchObject({ id: 'pet-companion', order: 12 })
    expect(entry.locale).toBe(SETTINGS_NS)
    expect(instance.getSnapshot()).toMatchObject({ character: 'miku', nickname: '' })
    host.publish({ status: 'ready', value: { ...DEFAULT_PET_SETTINGS, character: 'zhuang', nickname: '老大' }, revision: 4, writable: true })
    expect(instance.getSnapshot()).toEqual({ character: 'zhuang', nickname: '老大', writable: true, revision: 4 })
  })

  it('writes the companion as chosen and the nickname trimmed to the limit', async () => {
    const { host, face } = await bench()
    face.setCharacter('zhuang')
    expect(host.set).toHaveBeenCalledWith('character', 'zhuang')
    face.setNickname('  一二三四五六七八九十一二三四五六七  ')
    expect(host.set).toHaveBeenCalledWith('nickname', '一二三四五六七八九十一二三四五六')
  })
})
