/** Desktop companion bridge: silence before start, turn observation, busy state, companion sessions, and asks. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { DEFAULT_PET_SETTINGS, type PetSettings } from '@deepseek-ai/dsh-client-ui-settings-pet'
import { installDesktopPet, localDay, MAX_OBSERVED_SESSIONS, PET_WORKSPACE_TITLE, textOf } from '../src/pet.ts'
import { isPetShellCommand, type PetHostEvent, type PetShellCommand } from '../src/pet-protocol.ts'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'dsh-pet-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

const text = (value: string) => [{ type: 'text', text: value }]

interface BenchOptions {
  settings?: Partial<PetSettings>
  sessions?: boolean
  workspaces?: boolean
  petSettings?: boolean
  /** Install with the production storage root and clock. */
  defaults?: boolean
}

function bench(options: BenchOptions = {}) {
  const ctx = new Context()
  const clock = { now: new Date(2026, 9, 19, 10, 0, 0) }
  let settings: PetSettings = { ...DEFAULT_PET_SETTINGS, ...options.settings }
  let sessionCount = 0
  const sessionController = {
    create: vi.fn((_request: { workspaceId: string; agentPreset: string }) =>
      Promise.resolve({ sessionId: `pet-session-${String(++sessionCount)}` })),
    prompt: vi.fn((_request: { sessionId: string; mode: string; content: { text: string }[] }, _signal: AbortSignal) =>
      Promise.resolve({ accepted: true })),
  }
  const workspaceController = {
    create: vi.fn((request: { path: string }) =>
      Promise.resolve({ workspace: { workspaceId: 'ws-pet', path: request.path }, created: true })),
    rename: vi.fn(() => Promise.resolve({})),
    archiveSession: vi.fn((_request: { sessionId: string }) => Promise.resolve({})),
  }
  if (options.sessions !== false) ctx.provide('sessionController', sessionController as never)
  if (options.workspaces !== false) ctx.provide('workspaceController', workspaceController as never)
  if (options.petSettings !== false) ctx.provide('petSettings', { get: () => settings } as never)
  const events: PetHostEvent[] = []
  const handle = options.defaults === true
    ? installDesktopPet(ctx, (event) => { events.push(event) })
    : installDesktopPet(ctx, (event) => { events.push(event) }, { root, now: () => clock.now })
  const sessionEvent = (sessionId: string, type: string, data: unknown, parentSession?: string) => {
    ctx.emit('session/event', { id: sessionId, header: { parentSession } } as unknown as Session, { type, data } as unknown as SessionEvent)
  }
  const agent = (id: string) => ({ id }) as unknown as Agent
  const status = (id: string, value: 'running' | 'idle') => { ctx.emit('agent/status', { agent: agent(id), status: value }) }
  const ask = (id: number, who = 'miku', question = '你好', locale: 'zh' | 'en' = 'zh') =>
    handle({ kind: 'ask', requestId: id, who, preset: who === 'miku' ? 'pet' : 'pet-zhuang', text: question, locale })
  const result = (id: number) => vi.waitFor(() => {
    const found = events.find(event => event.kind === 'ask-result' && event.requestId === id)
    if (found === undefined) throw new Error('pending')
    return found
  })
  return {
    ctx, clock, events, handle, sessionController, workspaceController, sessionEvent, status, ask, result,
    setSettings: (patch: Partial<PetSettings>) => { settings = { ...settings, ...patch } },
  }
}

describe('companion protocol', () => {
  it('accepts only well-formed shell commands', () => {
    const ask = { kind: 'ask', requestId: 1, who: 'miku', preset: 'pet', text: 'hi', locale: 'zh' }
    expect([{ kind: 'start' }, { kind: 'stop' }, { kind: 'fresh-topic', who: 'miku' }, ask].every(isPetShellCommand)).toBe(true)
    for (const bad of [null, 'start', { kind: 'other' }, { kind: 'fresh-topic', who: '' }, { ...ask, requestId: 1.5 },
      { ...ask, text: '   ' }, { ...ask, text: 'x'.repeat(2001) }, { ...ask, locale: 'fr' }, { ...ask, preset: '' }, { ...ask, who: 3 }]) {
      expect(isPetShellCommand(bad)).toBe(false)
    }
  })

  it('keys days locally and reads only text blocks', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-1-5')
    expect(textOf([{ type: 'reasoning', text: 'x' }, { type: 'text', text: ' a ' }, { type: 'text', text: 'b' }, null])).toBe('a \nb')
    expect(textOf('not content')).toBe('')
  })
})

describe('companion bridge events', () => {
  it('stays silent until the shell starts it, then reports settings and busy state', () => {
    const b = bench({ settings: { nickname: '老大' } })
    b.status('main', 'running')
    expect(b.events).toEqual([])
    b.handle({ kind: 'start' })
    expect(b.events).toEqual([
      { kind: 'settings', settings: { ...DEFAULT_PET_SETTINGS, nickname: '老大' } },
      { kind: 'busy', running: true },
    ])
    b.handle({ kind: 'stop' })
    b.status('main', 'idle')
    expect(b.events).toHaveLength(2)
  })

  it('reports a finished human turn with its prompt, answer, tools, and duration', () => {
    const b = bench()
    b.handle({ kind: 'start' })
    b.sessionEvent('s1', 'user/message', { source: { kind: 'user' }, content: text('整理一下 README') })
    b.sessionEvent('s1', 'tool/call', {})
    b.sessionEvent('s1', 'assistant/message', { message: { content: [{ type: 'reasoning', text: 'hmm' }, ...text('改好了')] } })
    b.sessionEvent('s1', 'assistant/message', { message: { content: [] } })
    b.clock.now = new Date(b.clock.now.getTime() + 30_000)
    b.sessionEvent('s1', 'turn/end', { reason: 'completed' })
    expect(b.events.filter(event => event.kind === 'digest')).toEqual([{
      kind: 'digest', digest: { sessionId: 's1', prompt: '整理一下 README', answer: '改好了', tools: 1, durationMs: 30_000 },
    }])
  })

  it('ignores injected context, subagent sessions, empty turns, and unmatched turn ends', () => {
    const b = bench()
    b.handle({ kind: 'start' })
    b.sessionEvent('s1', 'user/message', { source: { kind: 'inject' }, content: text('file changed') })
    b.sessionEvent('s1', 'turn/end', {})
    b.sessionEvent('child', 'user/message', { source: { kind: 'user' }, content: text('sub task') }, 'parent')
    b.sessionEvent('child', 'turn/end', {}, 'parent')
    b.sessionEvent('s2', 'tool/call', {})
    b.sessionEvent('s2', 'turn/end', {})
    b.sessionEvent('s3', 'step/start', {})
    expect(b.events.filter(event => event.kind === 'digest')).toEqual([])
  })

  it('reports a turn joined mid-way, measured from first sight', () => {
    const b = bench()
    b.handle({ kind: 'start' })
    b.sessionEvent('s1', 'assistant/message', { message: { content: text('done') } })
    b.clock.now = new Date(b.clock.now.getTime() + 5000)
    b.sessionEvent('s1', 'turn/end', {})
    expect(b.events.at(-1)).toEqual({ kind: 'digest', digest: { sessionId: 's1', prompt: '', answer: 'done', tools: 0, durationMs: 5000 } })
  })

  it('bounds observed sessions by dropping the oldest', () => {
    const b = bench()
    b.handle({ kind: 'start' })
    for (let index = 0; index <= MAX_OBSERVED_SESSIONS; index++) {
      b.sessionEvent(`s${String(index)}`, 'user/message', { source: { kind: 'user' }, content: text('q') })
    }
    b.sessionEvent('s0', 'turn/end', {})
    b.sessionEvent(`s${String(MAX_OBSERVED_SESSIONS)}`, 'turn/end', {})
    expect(b.events.filter(event => event.kind === 'digest').map(event => event.kind === 'digest' && event.digest.sessionId))
      .toEqual([`s${String(MAX_OBSERVED_SESSIONS)}`])
  })

  it('reports busy only on change and forgets disposed agents', () => {
    const b = bench()
    b.handle({ kind: 'start' })
    b.status('a', 'running')
    b.status('b', 'running')
    b.status('a', 'idle')
    b.ctx.emit('agent/disposed', { agent: { id: 'b' } as unknown as Agent })
    expect(b.events.filter(event => event.kind === 'busy')).toEqual([
      { kind: 'busy', running: false }, { kind: 'busy', running: true }, { kind: 'busy', running: false },
    ])
  })

  it('starts without settings when the companion entry is off', () => {
    const b = bench({ petSettings: false })
    b.handle({ kind: 'start' })
    expect(b.events).toEqual([{ kind: 'busy', running: false }])
  })

  it('forwards settings changes', () => {
    const b = bench()
    b.handle({ kind: 'start' })
    const next = { ...DEFAULT_PET_SETTINGS, character: 'zhuang' }
    b.ctx.emit('pet/settings-changed', next)
    expect(b.events.at(-1)).toEqual({ kind: 'settings', settings: next })
  })
})

describe('companion sessions', () => {
  it('opens the companion Workspace and session on first ask, introduces the nickname once, and persists', async () => {
    const b = bench({ settings: { nickname: '老大' } })
    b.handle({ kind: 'start' })
    b.ask(1)
    expect(await b.result(1)).toEqual({ kind: 'ask-result', requestId: 1, ok: true })
    expect(b.workspaceController.create).toHaveBeenCalledWith({ path: root })
    expect(b.workspaceController.rename).toHaveBeenCalledWith({ workspaceId: 'ws-pet', title: PET_WORKSPACE_TITLE })
    expect(b.sessionController.create).toHaveBeenCalledWith({ workspaceId: 'ws-pet', agentPreset: 'pet' })
    expect(b.sessionController.prompt.mock.calls[0]![0]).toMatchObject({
      sessionId: 'pet-session-1', mode: 'queue', content: [{ type: 'text', text: '（称呼我为「老大」）\n\n你好' }],
    })
    b.ask(2, 'miku', '再问一个')
    await b.result(2)
    expect(b.sessionController.create).toHaveBeenCalledOnce()
    expect(b.sessionController.prompt.mock.calls[1]![0].content).toEqual([{ type: 'text', text: '再问一个' }])
    b.setSettings({ nickname: 'Boss' })
    b.ask(3, 'miku', 'hi', 'en')
    await b.result(3)
    expect(b.sessionController.prompt.mock.calls[2]![0].content).toEqual([{ type: 'text', text: '(Call me “Boss”.)\n\nhi' }])
    b.setSettings({ nickname: '' })
    b.ask(4, 'miku', 'no name')
    await b.result(4)
    expect(b.sessionController.prompt.mock.calls[3]![0].content).toEqual([{ type: 'text', text: 'no name' }])
    expect(JSON.parse(readFileSync(join(root, 'sessions.json'), 'utf8'))).toEqual({
      sessions: { miku: { id: 'pet-session-1', day: localDay(b.clock.now), greetedAs: '' } },
    })
  })

  it('routes a companion reply as her speech and keeps her turns out of digests and busy state', async () => {
    const b = bench()
    b.handle({ kind: 'start' })
    b.ask(1, 'zhuang')
    await b.result(1)
    expect(b.sessionController.create).toHaveBeenCalledWith({ workspaceId: 'ws-pet', agentPreset: 'pet-zhuang' })
    b.status('pet-session-1', 'running')
    b.sessionEvent('pet-session-1', 'user/message', { source: { kind: 'user' }, content: text('你好') })
    b.sessionEvent('pet-session-1', 'assistant/message', { message: { content: text('在。') } })
    b.sessionEvent('pet-session-1', 'assistant/message', { message: { content: [] } })
    b.sessionEvent('pet-session-1', 'turn/end', {})
    expect(b.events.filter(event => event.kind !== 'ask-result' && event.kind !== 'settings')).toEqual([
      { kind: 'busy', running: false }, { kind: 'speech', who: 'zhuang', text: '在。' },
    ])
  })

  it('archives yesterday\'s session and opens a new one on a new day; a fresh topic does the same at once', async () => {
    const b = bench()
    b.handle({ kind: 'start' })
    b.ask(1)
    await b.result(1)
    b.clock.now = new Date(2026, 9, 20, 9, 0, 0)
    b.ask(2)
    expect(await b.result(2)).toEqual({ kind: 'ask-result', requestId: 2, ok: true, newDay: true })
    expect(b.workspaceController.archiveSession).toHaveBeenCalledWith({ sessionId: 'pet-session-1' })
    expect(b.sessionController.prompt.mock.calls[1]![0].sessionId).toBe('pet-session-2')
    b.handle({ kind: 'fresh-topic', who: 'miku' })
    b.handle({ kind: 'fresh-topic', who: 'zhuang' })
    await vi.waitFor(() => { expect(b.workspaceController.archiveSession).toHaveBeenCalledWith({ sessionId: 'pet-session-2' }) })
    b.ask(3)
    // A fresh topic is the user's own choice; only a day change is announced.
    expect(await b.result(3)).toEqual({ kind: 'ask-result', requestId: 3, ok: true })
    expect(b.sessionController.prompt.mock.calls[2]![0].sessionId).toBe('pet-session-3')
  })

  it('keeps a refused archive visible and still opens the new session', async () => {
    const b = bench()
    b.workspaceController.archiveSession.mockRejectedValue(new Error('workspace/session-active'))
    b.handle({ kind: 'start' })
    b.ask(1)
    await b.result(1)
    b.handle({ kind: 'fresh-topic', who: 'miku' })
    b.ask(2)
    expect(await b.result(2)).toMatchObject({ ok: true })
  })

  it('continues the stored session after a restart and ignores an unreadable store', async () => {
    const day = localDay(new Date(2026, 9, 19, 10, 0, 0))
    writeFileSync(join(root, 'sessions.json'), JSON.stringify({ sessions: {
      miku: { id: 'kept', day, greetedAs: '老大' }, zhuang: { id: 'hers', day }, broken: { id: 3 },
    } }))
    const b = bench({ settings: { nickname: '老大' } })
    b.handle({ kind: 'start' })
    b.ask(1)
    await b.result(1)
    expect(b.sessionController.create).not.toHaveBeenCalled()
    expect(b.sessionController.prompt.mock.calls[0]![0]).toMatchObject({ sessionId: 'kept', content: [{ type: 'text', text: '你好' }] })
    b.sessionEvent('hers', 'assistant/message', { message: { content: text('早') } })
    expect(b.events.at(-1)).toEqual({ kind: 'speech', who: 'zhuang', text: '早' })

    for (const unusable of ['{}', '{']) {
      writeFileSync(join(root, 'sessions.json'), unusable)
      const fresh = bench()
      fresh.handle({ kind: 'start' })
      fresh.ask(1)
      await fresh.result(1)
      expect(fresh.sessionController.create).toHaveBeenCalledOnce()
    }
  })

  it('defaults to the Harness home and the wall clock, and asks without settings', async () => {
    vi.stubEnv('DSH_HOME', root)
    try {
      const b = bench({ defaults: true, petSettings: false })
      b.handle({ kind: 'start' })
      b.ask(1)
      await b.result(1)
      expect(b.workspaceController.create).toHaveBeenCalledWith({ path: join(root, 'pet') })
      expect(b.sessionController.prompt.mock.calls[0]![0].content).toEqual([{ type: 'text', text: '你好' }])
      expect(JSON.parse(readFileSync(join(root, 'pet', 'sessions.json'), 'utf8')).sessions.miku.day).toBe(localDay(new Date()))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('reports missing services', async () => {
    const noWorkspaces = bench({ workspaces: false })
    noWorkspaces.handle({ kind: 'start' })
    noWorkspaces.ask(1)
    expect(await noWorkspaces.result(1)).toEqual({
      kind: 'ask-result', requestId: 1, ok: false, error: 'companion: the Workspace service is unavailable',
    })
    rmSync(join(root, 'sessions.json'), { force: true })
    const noSessions = bench({ sessions: false })
    noSessions.handle({ kind: 'start' })
    noSessions.ask(1)
    expect(await noSessions.result(1)).toMatchObject({ ok: false, error: 'companion: the Session service is unavailable' })
    // A stored session skips creation, so the prompt itself finds the service missing.
    writeFileSync(join(root, 'sessions.json'), JSON.stringify({ sessions: { miku: { id: 'kept', day: localDay(noSessions.clock.now) } } }))
    const stored = bench({ sessions: false })
    stored.handle({ kind: 'start' })
    stored.ask(1)
    expect(await stored.result(1)).toMatchObject({ ok: false, error: 'companion: the Session service is unavailable' })
  })

  it('reports failures without breaking later asks', async () => {
    const b = bench()
    b.handle({ kind: 'start' })
    b.workspaceController.create.mockRejectedValueOnce(new Error('disk full'))
    b.ask(1)
    expect(await b.result(1)).toMatchObject({ ok: false, error: 'disk full' })
    b.sessionController.prompt.mockRejectedValueOnce('refused')
    b.ask(2)
    expect(await b.result(2)).toMatchObject({ ok: false, error: 'refused' })
    b.ask(3)
    expect(await b.result(3)).toMatchObject({ ok: true })
    // The failed open was retried once and then kept.
    expect(b.workspaceController.create).toHaveBeenCalledTimes(2)
    expect(b.workspaceController.rename).toHaveBeenCalledOnce()
  })

  it('keeps the title of a Workspace that was already registered', async () => {
    const b = bench()
    b.workspaceController.create.mockResolvedValue({ workspace: { workspaceId: 'ws-pet', path: root }, created: false })
    b.handle({ kind: 'start' })
    b.ask(1)
    await b.result(1)
    expect(b.workspaceController.rename).not.toHaveBeenCalled()
  })
})

describe('companion commands', () => {
  it('drops a fresh topic for a companion without a session', () => {
    const b = bench()
    const command: PetShellCommand = { kind: 'fresh-topic', who: 'miku' }
    expect(() => { b.handle(command) }).not.toThrow()
    expect(b.workspaceController.archiveSession).not.toHaveBeenCalled()
  })
})
