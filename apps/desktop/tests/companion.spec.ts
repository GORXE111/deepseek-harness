import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BATCH_MS } from '../src/companion-announce.ts'
import { ASK_DEADLINE_MS, DesktopCompanion, type CompanionWindowHandlers } from '../src/companion.ts'
import type { CompanionSettings, CompanionShellCommand } from '../src/companion-protocol.ts'
import type { CompanionView } from '../src/companion-window.ts'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'dsh-companion-')); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); rmSync(root, { recursive: true, force: true }) })

const SETTINGS: CompanionSettings = {
  character: 'miku', nickname: '', voice: false, voiceName: '', voiceRate: 1.1, voiceVolume: 0.85, voiceScope: 'alerts',
}

function fakeView() {
  return {
    say: vi.fn<CompanionView['say']>(), play: vi.fn<CompanionView['play']>(), setState: vi.fn<CompanionView['setState']>(),
    setCharacter: vi.fn<CompanionView['setCharacter']>(), destroy: vi.fn<CompanionView['destroy']>(),
  } satisfies CompanionView
}

function bench(options: { language?: 'zh' | 'en'; focused?: boolean; stored?: unknown } = {}) {
  const storePath = join(root, 'desktop', 'companion.json')
  if (options.stored !== undefined) {
    rmSync(join(root, 'desktop'), { recursive: true, force: true })
    writeFileSync(join(root, 'companion.json'), typeof options.stored === 'string' ? options.stored : JSON.stringify(options.stored))
  }
  const views: ReturnType<typeof fakeView>[] = []
  const handlers: CompanionWindowHandlers[] = []
  const commands: CompanionShellCommand[] = []
  const openMainWindow = vi.fn()
  const onEnabledChange = vi.fn()
  let focused = options.focused ?? false
  const companion = new DesktopCompanion({
    storePath: options.stored === undefined ? storePath : join(root, 'companion.json'),
    language: () => options.language ?? 'zh',
    menuLabels: () => ({ open: 'Open', fresh: 'Fresh' }),
    mainWindowFocused: () => focused,
    openMainWindow,
    openWindow: (next) => { handlers.push(next); const view = fakeView(); views.push(view); return view },
    onEnabledChange,
  })
  const start = (settings: CompanionSettings | undefined = SETTINGS, running = false) => {
    companion.attach((command) => { commands.push(command) })
    if (settings !== undefined) companion.receive({ kind: 'settings', settings })
    companion.receive({ kind: 'busy', running })
  }
  const lastAsk = () => commands.filter(command => command.kind === 'ask').at(-1) as Extract<CompanionShellCommand, { kind: 'ask' }>
  return {
    companion, views, handlers, commands, openMainWindow, onEnabledChange, start, lastAsk, storePath,
    setFocused: (value: boolean) => { focused = value },
    view: () => views.at(-1)!,
  }
}

describe('companion visibility', () => {
  it('is off by default and appears, as the chosen character, once the Host has started', () => {
    const b = bench()
    expect(b.companion.enabled).toBe(false)
    b.start({ ...SETTINGS, character: 'zhuang' })
    expect(b.commands).toEqual([{ kind: 'start' }])
    expect(b.views).toEqual([])
    b.companion.setEnabled(true)
    expect(b.onEnabledChange).toHaveBeenCalledOnce()
    expect(b.handlers[0]).toMatchObject({ character: 'zhuang', locale: 'zh', position: undefined, menuLabels: { open: 'Open', fresh: 'Fresh' } })
    expect(JSON.parse(readFileSync(b.storePath, 'utf8'))).toEqual({ enabled: true })
    b.companion.setEnabled(true)
    expect(b.views).toHaveLength(1)
    b.companion.setEnabled(false)
    expect(b.view().destroy).toHaveBeenCalledOnce()
    expect(b.onEnabledChange).toHaveBeenCalledTimes(2)
  })

  it('restores the stored choice and position, and waits for the Host before showing', () => {
    const b = bench({ stored: { enabled: true, position: { x: 10, y: 20 } } })
    expect(b.companion.enabled).toBe(true)
    expect(b.views).toEqual([])
    b.start(undefined, true)
    expect(b.handlers[0]).toMatchObject({ character: 'miku', position: { x: 10, y: 20 } })
    b.handlers[0]!.onReady()
    expect(b.view().setState).toHaveBeenCalledWith('running')
    expect(b.view().play).toHaveBeenCalledWith('greet')
    b.handlers[0]!.onMoved({ x: 30, y: 40 })
    expect(JSON.parse(readFileSync(join(root, 'companion.json'), 'utf8'))).toEqual({ enabled: true, position: { x: 30, y: 40 } })
  })

  it('keeps working when its preferences cannot be saved', () => {
    writeFileSync(join(root, 'blocker'), '')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const companion = new DesktopCompanion({
      storePath: join(root, 'blocker', 'companion.json'), language: () => 'zh', menuLabels: () => ({ open: '', fresh: '' }),
      mainWindowFocused: () => false, openMainWindow: () => undefined, openWindow: () => fakeView(),
    })
    companion.setEnabled(true)
    expect(companion.enabled).toBe(true)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('ignores unreadable or malformed preferences', () => {
    expect(bench({ stored: '{' }).companion.enabled).toBe(false)
    expect(bench({ stored: { enabled: 'yes', position: { x: 'a', y: 1 } } }).companion.enabled).toBe(false)
  })

  it('keeps the window across a Host restart and only refreshes its state', () => {
    const b = bench({ stored: { enabled: true } })
    b.start()
    b.companion.receive({ kind: 'busy', running: true })
    expect(b.view().setState).toHaveBeenLastCalledWith('running')
    b.companion.detach()
    expect(b.view().setState).toHaveBeenLastCalledWith('idle')
    b.companion.detach()
    b.start(SETTINGS, true)
    expect(b.views).toHaveLength(1)
    expect(b.view().setState).toHaveBeenLastCalledWith('running')
  })

  it('switches character in place and routes the window menu', () => {
    const b = bench({ stored: { enabled: true } })
    b.start()
    b.companion.receive({ kind: 'settings', settings: { ...SETTINGS, nickname: 'x' } })
    expect(b.view().setCharacter).not.toHaveBeenCalled()
    b.companion.receive({ kind: 'settings', settings: { ...SETTINGS, character: 'zhuang' } })
    expect(b.view().setCharacter).toHaveBeenCalledWith('zhuang')
    b.handlers[0]!.onActivate()
    expect(b.openMainWindow).toHaveBeenCalledOnce()
    b.handlers[0]!.onFreshTopic()
    expect(b.commands.at(-1)).toEqual({ kind: 'fresh-topic', who: 'zhuang' })
    expect(b.view().say).toHaveBeenCalledWith('好，另起一件', 2600, null)
  })

  it('treats closing her window directly as hiding her', () => {
    const b = bench({ stored: { enabled: true } })
    b.start()
    b.handlers[0]!.onClosed()
    expect(b.companion.enabled).toBe(false)
    expect(b.onEnabledChange).toHaveBeenCalledOnce()
    expect(JSON.parse(readFileSync(join(root, 'companion.json'), 'utf8'))).toEqual({ enabled: false })
    b.companion.setEnabled(true)
    expect(b.views).toHaveLength(2)
  })

  it('closes on dispose without forgetting the stored choice', () => {
    const b = bench({ stored: { enabled: true } })
    b.start()
    b.companion.dispose()
    expect(b.view().destroy).toHaveBeenCalledOnce()
    expect(JSON.parse(readFileSync(join(root, 'companion.json'), 'utf8'))).toEqual({ enabled: true })
  })
})

describe('companion announcements and speech', () => {
  const work = (prompt: string) => ({ kind: 'digest' as const, digest: { sessionId: 's', prompt, answer: '', tools: 1, durationMs: 1 } })

  it('announces finished work by name, with the nickname, spoken when the voice is on', () => {
    const b = bench({ stored: { enabled: true } })
    b.start({ ...SETTINGS, nickname: '老大', voice: true, voiceName: 'Yaoyao' })
    b.companion.receive(work('整理 README'))
    vi.advanceTimersByTime(BATCH_MS)
    expect(b.view().play).toHaveBeenCalledWith('done')
    expect(b.view().say).toHaveBeenCalledWith('老大，你的「整理 README」任务搞定啦~', 8000, { name: 'Yaoyao', rate: 1.1, volume: 0.85 })
  })

  it('only claps while the main window has focus, and collects nothing while hidden', () => {
    const b = bench({ focused: true })
    b.start()
    b.companion.receive(work('甲'))
    b.companion.setEnabled(true)
    vi.advanceTimersByTime(BATCH_MS)
    expect(b.view().play).not.toHaveBeenCalled()
    b.companion.receive(work('乙'))
    vi.advanceTimersByTime(BATCH_MS)
    expect(b.view().play).toHaveBeenCalledWith('done')
    expect(b.view().say).not.toHaveBeenCalled()
    b.setFocused(false)
    b.companion.receive(work('丙'))
    b.companion.setEnabled(false)
    vi.advanceTimersByTime(60_000)
    expect(b.view().say).not.toHaveBeenCalled()
  })

  it('says the current character\'s replies, aloud only when the scope covers replies', () => {
    const b = bench({ stored: { enabled: true } })
    b.start({ ...SETTINGS, voice: true })
    b.companion.receive({ kind: 'speech', who: 'zhuang', text: '不是她' })
    b.companion.receive({ kind: 'speech', who: 'miku', text: '在' })
    expect(b.view().play).toHaveBeenCalledWith('reply')
    expect(b.view().setState).toHaveBeenLastCalledWith('idle')
    expect(b.view().say).toHaveBeenCalledOnce()
    expect(b.view().say).toHaveBeenCalledWith('在', 6000, null)
    b.companion.receive({ kind: 'settings', settings: { ...SETTINGS, voice: true, voiceScope: 'all' } })
    b.companion.receive({ kind: 'busy', running: true })
    const long = 'x'.repeat(200)
    b.companion.receive({ kind: 'speech', who: 'miku', text: long })
    expect(b.view().setState).toHaveBeenLastCalledWith('running')
    expect(b.view().say).toHaveBeenLastCalledWith(long, 24_000, { name: '', rate: 1.1, volume: 0.85 })
  })

  it('announces silently in English without settings, and follows the agents going idle', () => {
    const b = bench({ stored: { enabled: true }, language: 'en' })
    b.start(undefined)
    b.handlers[0]!.onReady()
    expect(b.view().setState).toHaveBeenLastCalledWith('idle')
    b.companion.receive({ kind: 'busy', running: true })
    b.companion.receive({ kind: 'busy', running: false })
    expect(b.view().setState).toHaveBeenLastCalledWith('idle')
    b.companion.receive(work('fix the build'))
    vi.advanceTimersByTime(BATCH_MS)
    expect(b.view().say).toHaveBeenCalledWith('your task “fix the build” is done~', 8000, null)
  })

  it('stops thinking when her turn ends, and says why when it failed', async () => {
    const b = bench({ stored: { enabled: true } })
    b.start()
    const asked = b.companion.ask('你好')
    b.companion.receive({ kind: 'ask-result', requestId: 1, ok: true })
    await asked
    expect(b.view().setState).toHaveBeenLastCalledWith('running')
    b.companion.receive({ kind: 'turn-end', who: 'zhuang', error: 'not hers' })
    expect(b.view().setState).toHaveBeenLastCalledWith('running')
    b.companion.receive({ kind: 'turn-end', who: 'miku', error: '401 Unauthorized' })
    expect(b.view().setState).toHaveBeenLastCalledWith('idle')
    expect(b.view().play).toHaveBeenLastCalledWith('error')
    expect(b.view().say).toHaveBeenLastCalledWith('呜，MIKU 没能回答：401 Unauthorized', 8000, null)
    b.companion.receive({ kind: 'turn-end', who: 'miku' })
    expect(b.view().say).toHaveBeenCalledOnce()
  })

  it('drops speech and digests while hidden', () => {
    const b = bench()
    b.start()
    b.companion.receive({ kind: 'speech', who: 'miku', text: '在' })
    b.companion.receive(work('甲'))
    expect(b.views).toEqual([])
  })
})

describe('companion questions', () => {
  it('sends the question to the current character\'s preset and thinks until her reply', async () => {
    const b = bench({ stored: { enabled: true }, language: 'en' })
    b.start({ ...SETTINGS, character: 'zhuang' })
    const asked = b.handlers[0]!.onAsk('  hello  ')
    expect(b.lastAsk()).toEqual({ kind: 'ask', requestId: 1, who: 'zhuang', preset: 'pet-zhuang', text: 'hello', locale: 'en' })
    b.companion.receive({ kind: 'ask-result', requestId: 99, ok: true })
    b.companion.receive({ kind: 'ask-result', requestId: 1, ok: true })
    await expect(asked).resolves.toEqual({ ok: true })
    expect(b.view().setState).toHaveBeenLastCalledWith('running')
    expect(b.view().say).not.toHaveBeenCalled()
  })

  it('announces a new day and reports refusals', async () => {
    const b = bench({ stored: { enabled: true } })
    b.start()
    const first = b.companion.ask('早')
    b.companion.receive({ kind: 'ask-result', requestId: 1, ok: true, newDay: true })
    await expect(first).resolves.toEqual({ ok: true })
    expect(b.view().say).toHaveBeenCalledWith('新的一天啦，昨天的事 MIKU 忘光光咯', 3600, null)
    const refused = b.companion.ask('再问')
    b.companion.receive({ kind: 'ask-result', requestId: 2, ok: false, error: 'workspace unavailable' })
    await expect(refused).resolves.toEqual({ ok: false, error: 'workspace unavailable' })
    const bare = b.companion.ask('再问')
    b.companion.receive({ kind: 'ask-result', requestId: 3, ok: false })
    await expect(bare).resolves.toEqual({ ok: false, error: '没能建立 MIKU 的会话' })
  })

  it('fails without a Host, on an empty question, at the deadline, and when the Host stops', async () => {
    const b = bench()
    await expect(b.companion.ask('hi')).resolves.toEqual({ ok: false, error: '没能建立 MIKU 的会话' })
    b.start()
    await expect(b.companion.ask('   ')).resolves.toMatchObject({ ok: false })
    const late = b.companion.ask('hi')
    vi.advanceTimersByTime(ASK_DEADLINE_MS)
    await expect(late).resolves.toMatchObject({ ok: false })
    const stopped = b.companion.ask('hi')
    b.companion.detach()
    await expect(stopped).resolves.toMatchObject({ ok: false })
    expect(b.lastAsk().text).toBe('hi')
  })

  it('caps the question length', () => {
    const b = bench()
    b.start()
    void b.companion.ask('x'.repeat(5000))
    expect(b.lastAsk().text).toHaveLength(2000)
  })
})
