// @vitest-environment jsdom
/** Desktop companion row: store mirror, companion choice, commit-on-blur nickname, read-only mode. */
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { allowAllAccess, bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { CompanionRow, type CompanionRowProps } from '../src/client/CompanionRow.tsx'
import { createCompanionRowStore } from '../src/client/store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
type AttentionSnapshot = Parameters<Parameters<CompanionRowProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()

function mount(character = 'miku', nickname = '', writable = true) {
  const store = createCompanionRowStore().create()
  store.actions.sync(character, nickname, writable, 0)
  const setCharacter = vi.fn()
  const setNickname = vi.fn()
  const props: CompanionRowProps = {
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
    setCharacter, setNickname,
  }
  render(<CompanionRow {...props} />)
  return { setCharacter, setNickname }
}

describe('createCompanionRowStore', () => {
  it('mirrors the section, adopts an equal revision, and drops an older one', () => {
    const store = createCompanionRowStore().create()
    expect(store.getSnapshot()).toEqual({ character: 'miku', nickname: '', writable: false, revision: -1 })
    store.actions.sync('zhuang', 'a', true, 2)
    store.actions.sync('zhuang', 'b', true, 2)
    store.actions.sync('miku', 'c', true, 1)
    expect(store.getSnapshot()).toEqual({ character: 'zhuang', nickname: 'b', writable: true, revision: 2 })
  })
})

describe('CompanionRow', () => {
  it('marks the chosen companion and switches at once', () => {
    const b = mount('zhuang')
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '庄方宜' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'MIKU' }))
    expect(b.setCharacter).toHaveBeenCalledWith('miku')
  })

  it('writes the nickname on blur or Enter only when it changed', () => {
    const b = mount('miku', '老大')
    const field = screen.getByLabelText<HTMLInputElement>(en.nickname)
    expect(field.value).toBe('老大')
    expect(field.maxLength).toBe(16)
    fireEvent.blur(field)
    expect(b.setNickname).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: '主人' } })
    fireEvent.keyDown(field, { key: 'a' })
    expect(b.setNickname).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(b.setNickname).toHaveBeenCalledWith('主人')
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    expect(b.setNickname).toHaveBeenLastCalledWith('')
  })

  it('disables both controls when the deployment refuses writes', () => {
    mount('miku', '', false)
    for (const radio of screen.getAllByRole<HTMLInputElement>('radio')) expect(radio.disabled).toBe(true)
    expect(screen.getByLabelText<HTMLInputElement>(en.nickname).disabled).toBe(true)
  })
})
