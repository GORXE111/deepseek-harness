/** MCP manager Host half: entry validation, client config translation, diffed mounting over live config. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { blankServer, isMountable, MCP_SETTINGS_NAMESPACE, type McpServerEntry } from '../src/mcp-settings.ts'

// One fake MCP client per mounted server: records what mounts and what is disposed, so the
// diff is observable without starting processes.
const events = vi.hoisted(() => [] as string[])
vi.mock('@deepseek-ai/dsh-mcp-client', () => ({
  name: 'mcp-client',
  Config: undefined,
  inject: undefined,
  apply: (ctx: Context, config: { serverName: string; transport: string; command?: string; url?: string }) => {
    events.push(`mount ${config.serverName} ${config.transport} ${config.command ?? config.url ?? ''}`)
    ctx.effect(() => () => { events.push(`unmount ${config.serverName}`) }, 'fake mcp client')
  },
}))

const { apply, Config, toClientConfig } = await import('../src/index.ts')

const server = (patch: Partial<McpServerEntry>): McpServerEntry => ({ ...blankServer(), ...patch })
const files = server({ name: 'files', command: 'npx', args: ['-y', 'server-filesystem'], env: { ROOT: '/tmp' } })
const web = server({ name: 'web', transport: 'streamable-http', url: 'http://localhost:3000/mcp', headers: { A: 'b' } })

describe('mcp-settings', () => {
  it('keeps the 0.1 settings.yaml section id', () => {
    expect(MCP_SETTINGS_NAMESPACE).toBe('mcp-servers')
  })

  it('mounts only enabled, complete entries with a valid name', () => {
    expect(isMountable(files)).toBe(true)
    expect(isMountable(web)).toBe(true)
    expect(isMountable(server({ ...files, enabled: false }))).toBe(false)
    expect(isMountable(server({ ...files, name: '' }))).toBe(false)
    expect(isMountable(server({ ...files, name: 'has space' }))).toBe(false)
    expect(isMountable(server({ ...files, name: 'x'.repeat(33) }))).toBe(false)
    expect(isMountable(server({ ...files, command: '' }))).toBe(false)
    expect(isMountable(server({ ...web, url: '' }))).toBe(false)
  })

  it('translates each transport into the MCP client config, reading only its own fields', () => {
    expect(toClientConfig(files)).toEqual({
      transport: 'stdio', serverName: 'files', command: 'npx', args: ['-y', 'server-filesystem'], env: { ROOT: '/tmp' },
    })
    expect(toClientConfig({ ...web, command: 'ignored' })).toEqual({
      transport: 'streamable-http', serverName: 'web', url: 'http://localhost:3000/mcp', headers: { A: 'b' },
    })
  })
})

describe('mcp-servers manager', () => {
  it('keeps its own fiber off the generated settings pages', async () => {
    await omitsGeneratedPage(async (ctx) => {
      const fiber = ctx.plugin({ Config, apply })
      await fiber.await()
      return fiber
    })
  })

  it('mounts the valid entries, then remounts only what an edit changes, without restarting itself', async () => {
    events.length = 0
    const ctx = new Context()
    const live = await liveConfig(ctx, { Config, apply }, {
      servers: [files, web, server({ name: 'off', command: 'x', enabled: false }), server({ name: 'files', command: 'other' }), server({})],
    })
    expect(events.sort()).toEqual([
      'mount files stdio npx',
      'mount web streamable-http http://localhost:3000/mcp',
    ])
    const fiber = live.entry.fiber

    events.length = 0
    await live.replace({ servers: [files, { ...web, url: 'http://localhost:4000/mcp' }] })
    expect(events).toEqual(['unmount web', 'mount web streamable-http http://localhost:4000/mcp'])
    expect(live.entry.fiber).toBe(fiber)

    events.length = 0
    await live.replace({ servers: [{ ...web, url: 'http://localhost:4000/mcp' }, server({ name: 'git', command: 'uvx' })] })
    expect(events).toEqual(['unmount files', 'mount git stdio uvx'])

    events.length = 0
    await fiber?.dispose()
    expect(events.sort()).toEqual(['unmount git', 'unmount web'])
  })
})
