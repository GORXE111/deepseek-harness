/**
 * MCP tab slot store: a mirror of the durable server list. The plugin's apply-world
 * subscription is the only writer; the tab reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { McpServerEntry } from '../mcp-settings.ts'

/** Store state mirrored from the durable section. */
export interface McpTabState {
  /** Configured servers, in document order. */
  servers: readonly McpServerEntry[]
  /** Whether this deployment accepts settings writes. */
  writable: boolean
  /** Section revision; -1 until the first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type McpTabActions = {
  sync: (draft: McpTabState, servers: readonly McpServerEntry[], writable: boolean, revision: number) => void
}

/**
 * Declares the MCP tab state and write surface.
 * @returns the store handle.
 */
export function createMcpTabStore(): EngineStoreHandle<McpTabState, McpTabActions> {
  return defineStore({
    init: (): McpTabState => ({ servers: [], writable: false, revision: -1 }),
    actions: {
      // A local edit republishes at the same revision until the Host accepts it, so an equal
      // revision is adopted; only an older one is dropped.
      sync: (d, servers: readonly McpServerEntry[], writable: boolean, revision: number) => {
        if (revision < d.revision) return
        d.servers = servers
        d.writable = writable
        d.revision = revision
      },
    },
  })
}
