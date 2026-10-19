/**
 * MCP manager, Host half: owns the `mcp-servers` settings namespace and mounts one MCP client
 * plugin per enabled, complete entry.
 *
 * The shipped way to attach an MCP server is one Loader entry per server, which a running
 * application cannot manage from its own settings. Keeping the list in this entry's live config
 * makes the servers manageable from the product.
 *
 * Mounting is diffed, not rebuilt: the list is a volatile field, so an edit updates it in place
 * and `loader/volatile-update` triggers a diff. A server keeps its connection and its tool
 * generation while its own configuration is unchanged; only added, removed, or edited servers
 * mount or unmount.
 */

import type { Context, Fiber, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-settings'
// A function plugin: named exports (name/inject/Config/apply), no default export, so it is
// imported as a namespace for the Loader-equivalent `ctx.plugin` call.
import * as MCPClient from '@deepseek-ai/dsh-mcp-client'
import z from '@deepseek-ai/schemastery'
import { isMountable, MCP_TRANSPORTS, type McpServerEntry, type McpServerView } from './mcp-settings.ts'

export {
  blankServer, isMountable, MCP_SERVER_NAME, MCP_SETTINGS_NAMESPACE, MCP_TRANSPORTS,
  type McpServerEntry, type McpServerView, type McpSettings, type McpTransport,
} from './mcp-settings.ts'

/** One server entry's schema. */
export const McpServerSchema: z<McpServerEntry> = z.object({
  name: z.string().default(''),
  enabled: z.boolean().default(true),
  transport: z.union([...MCP_TRANSPORTS]).default('stdio'),
  command: z.string().default(''),
  args: z.array(String).default([]),
  env: z.dict(String).default({}),
  url: z.string().default(''),
  headers: z.dict(String).default({}),
})

/** Live configuration: the server list the settings card edits. */
export interface Config {
  /** Configured servers, in display order. */
  servers: Volatile<McpServerEntry[]>
}

/** The server list, updated in place without restarting the manager. */
export const Config = z.object({
  servers: z.array(McpServerSchema).default([]).volatile(),
})

/**
 * Translate one entry into the MCP client plugin's config, reading only its transport's fields.
 * @param entry - a mountable server entry.
 * @returns config for the transport the entry names.
 */
export function toClientConfig(entry: McpServerView): MCPClient.Config {
  return entry.transport === 'stdio'
    ? { transport: 'stdio', serverName: entry.name, command: entry.command, args: [...entry.args], env: { ...entry.env } } as MCPClient.Config
    : { transport: 'streamable-http', serverName: entry.name, url: entry.url, headers: { ...entry.headers } } as MCPClient.Config
}

/**
 * Register the settings presentation and keep the mounted servers matching the list.
 * @param ctx - Host plugin context.
 * @param config - live server list.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })

  const mounted = new Map<string, { key: string; fiber: Fiber }>()
  const sync = (): void => {
    const wanted = new Map<string, { key: string; config: MCPClient.Config }>()
    for (const entry of config.servers.get()) {
      if (!isMountable(entry)) continue
      // Tool names carry the server name, so two entries sharing one would shadow each
      // other's tools. The first wins; the card flags the duplicate.
      if (wanted.has(entry.name)) continue
      const clientConfig = toClientConfig(entry)
      wanted.set(entry.name, { key: JSON.stringify(clientConfig), config: clientConfig })
    }
    for (const [name, live] of [...mounted]) {
      if (wanted.get(name)?.key === live.key) continue
      void live.fiber.dispose()
      mounted.delete(name)
    }
    for (const [name, next] of wanted) {
      if (mounted.has(name)) continue
      mounted.set(name, { key: next.key, fiber: ctx.plugin(MCPClient, next.config) })
    }
  }
  sync()
  ctx.on('loader/volatile-update', () => { sync() })
}
