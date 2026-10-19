/** MCP manager browser half: tab registration, settings mirror, and the list write. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, SETTINGS_NS } from '../src/client/index.ts'
import type { McpTabInjected } from '../src/client/McpTab.tsx'
import type { createMcpTabStore } from '../src/client/store.ts'
import { blankServer, type McpSettings } from '../src/mcp-settings.ts'

async function bench() {
  const host = stubConfigForm<McpSettings>()
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('remote', {} as never)
  ctx.provide('configForms', { get: (ns: string) => { expect(ns).toBe('mcp-servers'); return host.scope } } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } } } as never, () => null)
  await ctx.plugin({ inject: [...inject], apply }).await()
  const entry = slots.entries('settings.plugins.tab')[0]!
  const instance = (entry.store as ReturnType<typeof createMcpTabStore>).create()
  const face = (entry.inject as unknown as (a: typeof instance.actions) => McpTabInjected)(instance.actions)
  return { host, entry, instance, face }
}

describe('ui-settings-mcp browser plugin', () => {
  it('declares the services it reads', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'configForms'])
  })

  it('registers the localized MCP tab in the Plugins section', async () => {
    const { entry } = await bench()
    expect(entry.options).toMatchObject({ id: 'mcp-servers', order: 20 })
    expect(entry.locale).toBe(SETTINGS_NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('MCP servers')
  })

  it('mirrors the durable list into the tab store and writes the whole list back', async () => {
    const { host, instance, face } = await bench()
    expect(instance.getSnapshot()).toMatchObject({ servers: [], writable: false })
    const servers = [{ ...blankServer(), name: 'files', command: 'npx' }]
    host.publish({ status: 'ready', value: { servers }, revision: 3, writable: true })
    expect(instance.getSnapshot()).toEqual({ servers, writable: true, revision: 3 })
    face.setServers([])
    expect(host.set).toHaveBeenCalledWith('servers', [])
  })
})
