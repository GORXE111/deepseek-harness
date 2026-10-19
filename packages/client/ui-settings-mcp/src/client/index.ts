/**
 * MCP manager, browser half: contributes the server-list tab to Settings → Plugins, over the
 * `mcp-servers` settings namespace the Host half owns.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the ctx.configForms and settings slot Context merges.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { MCP_SETTINGS_NAMESPACE, type McpSettings } from '../mcp-settings.ts'
import { McpTab, type McpTabInjected } from './McpTab.tsx'
import { createMcpTabStore } from './store.ts'
import { en, zh, type McpKey } from './locales.ts'

export type { McpTabInjected, McpTabProps } from './McpTab.tsx'
export type { McpTabState } from './store.ts'
export type { McpKey } from './locales.ts'

/** Namespace owning this tab's copy. */
export const SETTINGS_NS = 'settings.mcp'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The MCP servers tab's copy. */
    'settings.mcp': McpKey
  }
}

/** Services this plugin reads: slots and locale for the tab, configForms for the server list. */
export const inject = ['slots', 'locale', 'remote', 'configForms']

/**
 * Register the MCP servers tab into the Plugins settings section.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh, en }), 'ui-settings-mcp: tab dictionaries')
  const t = ctx.locale.bind(SETTINGS_NS)
  const host = ctx.configForms.get<McpSettings>(MCP_SETTINGS_NAMESPACE)

  const store = createMcpTabStore()
  let bound: BoundActions<typeof store> | undefined
  const publish = (): void => {
    const snapshot = host.getSnapshot()
    bound?.sync(snapshot.value?.servers ?? [], snapshot.writable, snapshot.revision ?? -1)
  }
  ctx.effect(() => host.subscribe(publish), 'ui-settings-mcp: adopt the durable server list')

  const injected = (actions: BoundActions<typeof store>): McpTabInjected => {
    bound = actions
    // Re-read so nothing is lost between registration and first render.
    publish()
    return { setServers: (servers) => { void host.set('servers', servers) } }
  }

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: MCP_SETTINGS_NAMESPACE,
    order: 20,
    label: () => t('tab'),
    locale: SETTINGS_NS,
    store,
    inject: injected,
  }, McpTab))
}
