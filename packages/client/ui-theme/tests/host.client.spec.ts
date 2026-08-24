import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { SettingsProvider, settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  DEFAULT_CHAT_BACKGROUND, DEFAULT_CHAT_OPACITY, DEFAULT_PALETTE, DEFAULT_PREFERENCE,
  THEME_SETTINGS_NAMESPACE, apply,
} from '@deepseek-ai/dsh-client-ui-theme'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

describe('ui-theme host', () => {
  it('registers, validates, and disposes the durable theme namespace with its fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    const ns = settingsNamespace(THEME_SETTINGS_NAMESPACE)
    // The whole section defaults, not just the preference: the palette,
    // accent, and backdrop fields ride the same durable namespace.
    const defaults = {
      preference: DEFAULT_PREFERENCE,
      palette: DEFAULT_PALETTE,
      accent: '',
      chatBackground: DEFAULT_CHAT_BACKGROUND,
      chatOpacity: DEFAULT_CHAT_OPACITY,
    }
    expect(ctx.settings.get(ns)).toEqual(defaults)
    await ctx.settings.update(ns, { preference: 'dark' })
    expect(ctx.settings.get(ns)).toEqual({ ...defaults, preference: 'dark' })
    await ctx.settings.update(ns, { palette: 'forest', accent: '#7744ff' })
    expect(ctx.settings.get(ns)).toEqual({
      ...defaults, preference: 'dark', palette: 'forest', accent: '#7744ff',
    })
    await expect(ctx.settings.update(ns, { preference: 'sepia' })).rejects.toThrow()
    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
  })

  it('renders the current durable preference and disposes the index transform', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    let transform: ((html: string) => string) | undefined
    let disposed = false
    ctx.provide('webServer', {
      tapIndex: (next: (html: string) => string) => {
        transform = next
        return () => { disposed = true }
      },
    } as WebServer)
    const fiber = ctx.plugin({ apply })
    await fiber.await()
    expect(transform?.('<body></body>')).toContain('const preference = "system"')
    await ctx.settings.update(settingsNamespace(THEME_SETTINGS_NAMESPACE), { preference: 'dark' })
    expect(transform?.('<body></body>')).toContain('const preference = "dark"')
    await fiber.dispose()
    expect(disposed).toBe(true)
    expect(transform?.('<body></body>')).toContain('const preference = "system"')
  })

  it('uses the system preference when only an HTTP server exists', async () => {
    const ctx = new Context()
    let transform: ((html: string) => string) | undefined
    ctx.provide('webServer', {
      tapIndex: (next: (html: string) => string) => {
        transform = next
        return () => undefined
      },
    } as WebServer)
    await ctx.plugin({ apply }).await()
    expect(transform?.('<body></body>')).toContain('const preference = "system"')
  })
})
