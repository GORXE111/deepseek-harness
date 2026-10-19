// @vitest-environment jsdom
/** MCP servers tab: store mirror, row editing, commit-on-blur fields, warnings, and read-only mode. */
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { McpTab, type McpTabProps } from '../src/client/McpTab.tsx'
import { createMcpTabStore } from '../src/client/store.ts'
import { en } from '../src/client/locales.ts'
import { blankServer, type McpServerEntry } from '../src/mcp-settings.ts'

afterEach(cleanup)

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
type AttentionSnapshot = Parameters<Parameters<McpTabProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()

function mount(servers: McpServerEntry[], writable = true) {
  const store = createMcpTabStore().create()
  store.actions.sync(servers, writable, 0)
  const setServers = vi.fn()
  const props: McpTabProps = {
    useSessions: bindSnapshotSelector(createSnapshotStore<SessionListState>({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })),
    useWorkspaces: bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>({
      items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    })),
    useSessionStatus: selector => selector(noAttention),
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    ...allowAllAccess,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => (en as Record<string, string>)[key] ?? key,
    setServers,
  }
  render(<McpTab {...props} />)
  return { setServers, store }
}

const files: McpServerEntry = { ...blankServer(), name: 'files', command: 'npx', args: ['-y', 'fs'] }
const lastWrite = (setServers: ReturnType<typeof vi.fn>): McpServerEntry[] => setServers.mock.calls.at(-1)?.[0] as McpServerEntry[]

describe('createMcpTabStore', () => {
  it('mirrors the list, adopts an equal revision, and drops an older one', () => {
    const store = createMcpTabStore().create()
    expect(store.getSnapshot()).toEqual({ servers: [], writable: false, revision: -1 })
    store.actions.sync([files], true, 2)
    store.actions.sync([], true, 2)
    expect(store.getSnapshot().servers).toEqual([])
    store.actions.sync([files], false, 1)
    expect(store.getSnapshot()).toEqual({ servers: [], writable: true, revision: 2 })
  })
})

describe('McpTab', () => {
  it('shows the empty state and adds a blank stdio row', () => {
    const { setServers } = mount([])
    expect(screen.getByText(en.empty)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.add }))
    expect(setServers).toHaveBeenCalledWith([blankServer()])
  })

  it('writes switches and removal at once', () => {
    const { setServers } = mount([files, { ...files, name: 'other' }])
    fireEvent.click(screen.getAllByRole('checkbox')[0]!)
    expect(lastWrite(setServers)[0]).toMatchObject({ name: 'files', enabled: false })
    fireEvent.click(screen.getAllByRole('button', { name: en.remove })[1]!)
    expect(lastWrite(setServers)).toEqual([files])
  })

  it('keeps a text edit in the field until blur or Enter, and skips an unchanged commit', () => {
    const { setServers } = mount([files])
    const name = screen.getByLabelText(en.name)
    fireEvent.change(name, { target: { value: 'files2' } })
    expect(setServers).not.toHaveBeenCalled()
    fireEvent.blur(name)
    expect(lastWrite(setServers)[0]?.name).toBe('files2')

    const command = screen.getByLabelText(en.command)
    fireEvent.change(command, { target: { value: 'uvx' } })
    fireEvent.keyDown(command, { key: 'a' })
    expect(lastWrite(setServers)[0]?.command).toBe('npx')
    fireEvent.keyDown(command, { key: 'Enter' })
    expect(lastWrite(setServers)[0]?.command).toBe('uvx')

    setServers.mockClear()
    fireEvent.blur(screen.getByLabelText(en.args))
    expect(setServers).not.toHaveBeenCalled()
  })

  it('splits arguments on whitespace and clears them when emptied', () => {
    const { setServers } = mount([files])
    const args = screen.getByLabelText(en.args)
    expect((args as HTMLInputElement).value).toBe('-y fs')
    fireEvent.change(args, { target: { value: '  --root   /data ' } })
    fireEvent.blur(args)
    expect(lastWrite(setServers)[0]?.args).toEqual(['--root', '/data'])
    fireEvent.change(args, { target: { value: '   ' } })
    fireEvent.blur(args)
    expect(lastWrite(setServers)[0]?.args).toEqual([])
  })

  it('switches transport and edits the HTTP endpoint', () => {
    const { setServers } = mount([{ ...files, transport: 'streamable-http', url: 'http://a/mcp' }])
    expect(screen.queryByLabelText(en.command)).toBeNull()
    const url = screen.getByLabelText(en.url)
    fireEvent.change(url, { target: { value: 'http://b/mcp' } })
    fireEvent.blur(url)
    expect(lastWrite(setServers)[0]?.url).toBe('http://b/mcp')
    fireEvent.change(screen.getByLabelText(en.transport), { target: { value: 'stdio' } })
    expect(lastWrite(setServers)[0]?.transport).toBe('stdio')
  })

  it('flags duplicate and invalid names on the affected rows', () => {
    mount([files, { ...files }, { ...files, name: 'bad name' }])
    expect(screen.getAllByText(en.duplicate)).toHaveLength(2)
    expect(screen.getAllByText(en.invalidName)).toHaveLength(1)
  })

  it('disables every control when the deployment refuses writes', () => {
    mount([files], false)
    expect(screen.getByText(en.readOnly)).toBeDefined()
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('textbox'), screen.getByRole('checkbox'), screen.getByRole('combobox')]) {
      expect((control as HTMLInputElement).disabled).toBe(true)
    }
  })
})
