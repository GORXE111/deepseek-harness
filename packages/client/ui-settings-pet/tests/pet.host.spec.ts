/** Desktop companion settings Host half: defaults, the reader service, and in-place change events. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { apply, Config, DEFAULT_PET_SETTINGS, PET_SETTINGS_NAMESPACE, type PetSettings } from '../src/index.ts'

describe('pet settings entry', () => {
  it('keeps the 0.1 settings.yaml section id', () => {
    expect(PET_SETTINGS_NAMESPACE).toBe('pet')
  })

  it('keeps its own fiber off the generated settings pages', async () => {
    await omitsGeneratedPage(async (ctx) => {
      const fiber = ctx.plugin({ Config, apply })
      await fiber.await()
      return fiber
    })
  })

  it('provides the current preferences and announces in-place changes without restarting', async () => {
    const ctx = new Context()
    const changes: PetSettings[] = []
    ctx.on('pet/settings-changed', (settings) => { changes.push(settings) })
    const live = await liveConfig(ctx, { Config, apply })
    expect(ctx.petSettings.get()).toEqual(DEFAULT_PET_SETTINGS)
    const fiber = live.entry.fiber

    await live.update({ character: 'zhuang', nickname: '老大' })
    expect(live.entry.fiber).toBe(fiber)
    expect(ctx.petSettings.get()).toMatchObject({ character: 'zhuang', nickname: '老大', voice: false })
    expect(changes.at(-1)).toMatchObject({ character: 'zhuang', nickname: '老大' })

    await expect(live.update({ voiceScope: 'everything' })).rejects.toThrow()
    await fiber?.dispose()
  })
})
