/**
 * The MCP manager's tab in Settings → Plugins: the configured server list.
 *
 * Switches, the transport menu, add, and remove write at once. Text fields keep their edit in
 * the field and write on blur or Enter: every write that changes a server remounts it, so a
 * per-keystroke write would start a process for each half-typed command.
 */

import type { KeyboardEvent } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { blankServer, MCP_SERVER_NAME, MCP_TRANSPORTS, type McpServerEntry, type McpTransport } from '../mcp-settings.ts'
import type { createMcpTabStore } from './store.ts'
import css from './McpTab.module.css'

/** Injected business face: the one durable write the tab performs. */
export interface McpTabInjected {
  /** Replace the whole server list. */
  setServers: (servers: McpServerEntry[]) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type McpTabProps =
  PropsRuntime<'settings.plugins.tab'> & PropsStore<ReturnType<typeof createMcpTabStore>>
  & PropsLocale<'settings.mcp'> & McpTabInjected

/** Props of one text field that writes its value on blur or Enter. */
interface CommitInputProps {
  className: string | undefined
  value: string
  label: string
  placeholder: string
  disabled: boolean
  onCommit: (value: string) => void
}

/**
 * A text field holding its edit locally until blur or Enter. Its identity is the committed
 * value, so a saved change, or one arriving from elsewhere, remounts it showing that value.
 * @param props - committed value, label, and writer.
 * @returns the input element.
 */
function CommitInput({ className, value, label, placeholder, disabled, onCommit }: CommitInputProps) {
  const commit = (next: string): void => { if (next !== value) onCommit(next) }
  return (
    <input
      key={value}
      className={className}
      defaultValue={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={label}
      onBlur={(event) => { commit(event.currentTarget.value) }}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') commit(event.currentTarget.value) }}
    />
  )
}

/**
 * Render the MCP servers tab.
 * @param props - composed slot props.
 * @returns the tab element tree.
 */
export function McpTab({ t, useStore, setServers }: McpTabProps) {
  const servers = useStore(s => s.servers)
  const writable = useStore(s => s.writable)

  // A duplicate name shadows the other server's tools, so the losing row says so.
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const server of servers) {
    if (server.name !== '' && seen.has(server.name)) duplicated.add(server.name)
    seen.add(server.name)
  }

  const patch = (index: number, next: Partial<McpServerEntry>): void => {
    setServers(servers.map((server, at) => at === index ? { ...server, ...next } : server))
  }

  return (
    <div className={css.section}>
      <p className={css.description}>{t('description')}</p>
      {!writable && <p className={css.warning}>{t('readOnly')}</p>}

      {servers.length === 0
        ? <p className={css.empty}>{t('empty')}</p>
        : (
          <ul className={css.rows}>
            {servers.map((server, index) => (
              // Rows carry no id of their own; the position is the row's identity.
              <li key={index} className={css.row}>
                <label className={css.toggle}>
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    disabled={!writable}
                    onChange={(event) => { patch(index, { enabled: event.target.checked }) }}
                  />
                  {t('enabledLabel')}
                </label>

                <CommitInput
                  className={css.name}
                  value={server.name}
                  label={t('name')}
                  placeholder={t('namePlaceholder')}
                  disabled={!writable}
                  onCommit={(name) => { patch(index, { name }) }}
                />

                <select
                  className={css.transport}
                  value={server.transport}
                  disabled={!writable}
                  aria-label={t('transport')}
                  onChange={(event) => { patch(index, { transport: event.target.value as McpTransport }) }}
                >
                  {MCP_TRANSPORTS.map(transport => (
                    <option key={transport} value={transport}>{transport === 'stdio' ? t('stdio') : t('http')}</option>
                  ))}
                </select>

                {server.transport === 'stdio'
                  ? (
                    <>
                      <CommitInput
                        className={css.target}
                        value={server.command}
                        label={t('command')}
                        placeholder={t('commandPlaceholder')}
                        disabled={!writable}
                        onCommit={(command) => { patch(index, { command }) }}
                      />
                      <CommitInput
                        className={css.target}
                        value={server.args.join(' ')}
                        label={t('args')}
                        placeholder={t('argsPlaceholder')}
                        disabled={!writable}
                        onCommit={(raw) => { patch(index, { args: raw.trim() === '' ? [] : raw.trim().split(/\s+/u) }) }}
                      />
                    </>
                  )
                  : (
                    <CommitInput
                      className={css.wideTarget}
                      value={server.url}
                      label={t('url')}
                      placeholder={t('urlPlaceholder')}
                      disabled={!writable}
                      onCommit={(url) => { patch(index, { url }) }}
                    />
                  )}

                <button
                  type="button"
                  className={css.remove}
                  disabled={!writable}
                  onClick={() => { setServers(servers.filter((_, at) => at !== index)) }}
                >
                  {t('remove')}
                </button>

                {server.name !== '' && !MCP_SERVER_NAME.test(server.name) && <p className={css.warning}>{t('invalidName')}</p>}
                {duplicated.has(server.name) && <p className={css.warning}>{t('duplicate')}</p>}
              </li>
            ))}
          </ul>
        )}

      <div className={css.footer}>
        <button type="button" className={css.add} disabled={!writable} onClick={() => { setServers([...servers, blankServer()]) }}>
          {t('add')}
        </button>
      </div>
      <p className={css.hint}>{t('nameHint')}</p>
      <p className={css.hint}>{t('advancedHint')}</p>
    </div>
  )
}
