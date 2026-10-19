/**
 * MCP server list stored in the `mcp-servers` settings namespace, shared by the Host manager and
 * the browser tab. Dependency-free on purpose: the browser bundle imports it, and the schema
 * library stays on the Host side (src/index.ts).
 */

/**
 * Settings namespace and Loader entry id of the MCP manager. It keeps the id the 0.1 build's
 * `settings.yaml` section used, so the one-time legacy import lands the existing list here.
 */
export const MCP_SETTINGS_NAMESPACE = 'mcp-servers'

/** Transports the MCP client plugin accepts. */
export const MCP_TRANSPORTS = ['stdio', 'streamable-http'] as const

/** One transport name. */
export type McpTransport = typeof MCP_TRANSPORTS[number]

/**
 * One configured server. The two transports need disjoint fields, but the entry keeps both
 * sets flat rather than a union: the settings document is hand-editable, and the unused half
 * stays empty. The manager reads only the fields its transport names.
 */
export interface McpServerEntry {
  /**
   * Server namespace. Tools arrive as `mcp__<name>__<rawName>`, so this is model-visible and
   * must stay stable once a session has seen it.
   */
  name: string
  /** Whether the manager mounts this server. */
  enabled: boolean
  /** Which transport the entry describes. */
  transport: McpTransport
  /** stdio: executable to run. */
  command: string
  /** stdio: arguments. */
  args: string[]
  /** stdio: extra environment. */
  env: Record<string, string>
  /** streamable-http: endpoint. */
  url: string
  /** streamable-http: extra request headers. */
  headers: Record<string, string>
}

/** A deeply read-only server entry, as a volatile config snapshot or the tab's store holds it. */
export type McpServerView = Readonly<Omit<McpServerEntry, 'args' | 'env' | 'headers'>> & {
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly headers: Readonly<Record<string, string>>
}

/** Durable MCP section. */
export interface McpSettings {
  /** Configured servers, in display order. */
  servers: McpServerEntry[]
}

/** Server names the MCP client plugin accepts; they become tool-name segments. */
export const MCP_SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/u

/**
 * Whether an entry is complete enough to mount. Checked at mount time rather than at the
 * settings boundary: a half-written entry is a normal intermediate state of a hand-editable
 * document, not a reason to reject the whole list.
 * @param entry - one configured server.
 * @returns true when the manager can mount it.
 */
export function isMountable(entry: McpServerView): boolean {
  if (!entry.enabled || !MCP_SERVER_NAME.test(entry.name)) return false
  return entry.transport === 'stdio' ? entry.command !== '' : entry.url !== ''
}

/** A new row: stdio is the common case, and the empty name keeps it unmounted until named. */
export function blankServer(): McpServerEntry {
  return { name: '', enabled: true, transport: 'stdio', command: '', args: [], env: {}, url: '', headers: {} }
}
