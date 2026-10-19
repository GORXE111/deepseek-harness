import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BATCH_MS, brief, composeAnnouncement, createAnnouncer, isWorthAnnouncing, MAX_BRIEF_CHARS, MIN_ANSWER_CHARS, MIN_DURATION_MS, QUIET_MS,
} from '../src/companion-announce.ts'
import { companionCharacter } from '../src/companion-characters.ts'
import type { CompanionDigest } from '../src/companion-protocol.ts'

const MIKU_ZH = companionCharacter('miku').lines.zh
const MIKU_EN = companionCharacter('miku').lines.en
const ZHUANG_ZH = companionCharacter('zhuang').lines.zh

/** A casual question: instant, no tools, short answer. */
const casual = (over: Partial<CompanionDigest> = {}): CompanionDigest =>
  ({ sessionId: 's', prompt: '这个函数干嘛的', answer: '取个配置', tools: 0, durationMs: 800, ...over })
const work = (prompt: string): CompanionDigest => casual({ tools: 1, prompt })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('announcement threshold', () => {
  it('counts tools, duration, or a long answer as work', () => {
    expect(isWorthAnnouncing(casual())).toBe(false)
    expect(isWorthAnnouncing(casual({ tools: 1 }))).toBe(true)
    expect(isWorthAnnouncing(casual({ durationMs: MIN_DURATION_MS }))).toBe(true)
    expect(isWorthAnnouncing(casual({ durationMs: MIN_DURATION_MS - 1 }))).toBe(false)
    expect(isWorthAnnouncing(casual({ answer: 'x'.repeat(MIN_ANSWER_CHARS) }))).toBe(true)
    expect(isWorthAnnouncing(casual({ answer: 'x'.repeat(MIN_ANSWER_CHARS - 1) }))).toBe(false)
    expect(isWorthAnnouncing(casual({ durationMs: 10 }), { minDurationMs: 10 })).toBe(true)
    expect(isWorthAnnouncing(casual({ answer: 'xx' }), { minAnswerChars: 2 })).toBe(true)
  })
})

describe('announcement batching', () => {
  const setup = () => {
    const said: CompanionDigest[][] = []
    const announcer = createAnnouncer({ emit: (batch) => { said.push(batch) } })
    return { said, announcer }
  }

  it('drops casual turns and speaks a batch after the batch window', () => {
    const { said, announcer } = setup()
    expect(announcer.offer(casual())).toBe(false)
    expect(announcer.size()).toBe(0)
    expect(announcer.offer(work('甲'))).toBe(true)
    vi.advanceTimersByTime(BATCH_MS - 1)
    expect(said).toEqual([])
    vi.advanceTimersByTime(1)
    expect(said.map(batch => batch.map(digest => digest.prompt))).toEqual([['甲']])
    expect(announcer.size()).toBe(0)
  })

  it('joins turns finishing together into one sentence, without postponing a scheduled batch', () => {
    const { said, announcer } = setup()
    announcer.offer(work('甲'))
    vi.advanceTimersByTime(500)
    announcer.offer(work('乙'))
    vi.advanceTimersByTime(BATCH_MS)
    expect(said.map(batch => batch.length)).toEqual([2])
  })

  it('speaks during a steady stream of finished turns', () => {
    const { said, announcer } = setup()
    for (let index = 0; index < 10; index++) { announcer.offer(work(`T${String(index)}`)); vi.advanceTimersByTime(1000) }
    expect(said[0]?.map(digest => digest.prompt)).toEqual(['T0', 'T1', 'T2', 'T3'])
  })

  it('keeps quiet after speaking and collects meanwhile', () => {
    const { said, announcer } = setup()
    announcer.offer(work('甲'))
    vi.advanceTimersByTime(BATCH_MS)
    vi.advanceTimersByTime(5000)
    announcer.offer(work('乙'))
    vi.advanceTimersByTime(BATCH_MS)
    expect(said).toHaveLength(1)
    expect(announcer.size()).toBe(1)
    vi.advanceTimersByTime(QUIET_MS)
    expect(said.map(batch => batch[0]!.prompt)).toEqual(['甲', '乙'])
  })

  it('speaks now on flush and forgets on cancel', () => {
    const { said, announcer } = setup()
    announcer.flush()
    expect(said).toEqual([])
    announcer.offer(work('甲'))
    announcer.flush()
    expect(said).toHaveLength(1)
    announcer.offer(work('乙'))
    announcer.cancel()
    vi.advanceTimersByTime(QUIET_MS * 2)
    expect(said).toHaveLength(1)
    expect(announcer.size()).toBe(0)
  })

  it('accepts injected timers', () => {
    const timers: Array<() => void> = []
    const clear = vi.fn()
    const said: CompanionDigest[][] = []
    const announcer = createAnnouncer({
      emit: (batch) => { said.push(batch) }, now: () => 0, setTimer: (callback) => { timers.push(callback); return timers.length },
      clearTimer: clear, batchMs: 1, quietMs: 1,
    })
    announcer.offer(work('甲'))
    announcer.cancel()
    expect(clear).toHaveBeenCalledWith(1)
    announcer.offer(work('乙'))
    timers.at(-1)!()
    expect(said).toHaveLength(1)
  })
})

describe('announcement text', () => {
  it('folds whitespace and shortens long prompts', () => {
    expect(brief('  多行\n\n的   提问 ')).toBe('多行 的 提问')
    expect(brief('')).toBe('')
    const long = 'x'.repeat(MAX_BRIEF_CHARS + 5)
    expect(brief(long)).toBe(`${'x'.repeat(MAX_BRIEF_CHARS)}…`)
  })

  it('names one task, or lists several with the rest counted, in the character\'s voice', () => {
    expect(composeAnnouncement([], '', MIKU_ZH)).toBe('')
    expect(composeAnnouncement([work('整理 README')], '', MIKU_ZH)).toBe('你的「整理 README」任务搞定啦~')
    expect(composeAnnouncement([work('')], '老大', MIKU_ZH)).toBe('老大，刚才那轮任务搞定啦~')
    expect(composeAnnouncement([work('fix the build')], 'Boss', MIKU_EN)).toBe('Boss, your task “fix the build” is done~')
    expect(composeAnnouncement([work('甲'), work('乙')], '', ZHUANG_ZH)).toBe('你的 2 件事都办完了\n· 甲\n· 乙')
    expect(composeAnnouncement([work(''), work(' ')], '', MIKU_ZH)).toBe('你的 2 个任务都搞定啦~')
    const six = ['一', '二', '三', '四', '五', '六'].map(work)
    expect(composeAnnouncement(six, '', MIKU_ZH).split('\n')).toEqual(['你的 6 个任务都搞定啦~', '· 一', '· 二', '· 三', '· 四', '· 还有 2 件'])
  })
})

describe('characters', () => {
  it('maps each companion to her preset and falls back to MIKU', () => {
    expect(companionCharacter('zhuang').preset).toBe('pet-zhuang')
    expect(companionCharacter('nobody').id).toBe('miku')
    expect(companionCharacter('toString').id).toBe('miku')
    for (const id of ['miku', 'zhuang']) {
      for (const lines of Object.values(companionCharacter(id).lines)) {
        expect([lines.fresh, lines.newDay, lines.noSession, lines.doneOne].every(line => line !== '')).toBe(true)
        expect(lines.doneRest(3)).toContain('3')
        expect(lines.doneMany(3)).toContain('3')
        expect(lines.doneNamed('甲')).toContain('甲')
        expect(lines.address('老大')).toContain('老大')
      }
    }
  })
})
