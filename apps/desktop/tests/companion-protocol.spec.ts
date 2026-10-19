import { expect, it } from 'vitest'
import { readCompanionHostEvent } from '../src/companion-protocol.ts'

const settings = {
  character: 'zhuang', nickname: '老大', voice: true, voiceName: '', voiceRate: 1.1, voiceVolume: 0.85, voiceScope: 'all',
  voiceProvider: 'system', voiceKey: 'secret',
}

it('keeps only the companion settings the shell reads', () => {
  expect(readCompanionHostEvent({ kind: 'settings', settings })).toEqual({ kind: 'settings', settings: {
    character: 'zhuang', nickname: '老大', voice: true, voiceName: '', voiceRate: 1.1, voiceVolume: 0.85, voiceScope: 'all',
  } })
  expect(readCompanionHostEvent({ kind: 'settings', settings: { ...settings, voiceScope: 'odd' } })).toMatchObject({ settings: { voiceScope: 'alerts' } })
  for (const bad of [null, 'x', { ...settings, voice: 'yes' }, { ...settings, voiceRate: Number.NaN }, { ...settings, character: 1 }]) {
    expect(readCompanionHostEvent({ kind: 'settings', settings: bad })).toBeUndefined()
  }
})

it('validates busy, digest, speech, and ask results', () => {
  expect(readCompanionHostEvent({ kind: 'busy', running: true })).toEqual({ kind: 'busy', running: true })
  expect(readCompanionHostEvent({ kind: 'busy', running: 1 })).toBeUndefined()
  const digest = { sessionId: 's', prompt: 'p', answer: 'a', tools: 2, durationMs: 10, extra: true }
  expect(readCompanionHostEvent({ kind: 'digest', digest })).toEqual({ kind: 'digest', digest: { sessionId: 's', prompt: 'p', answer: 'a', tools: 2, durationMs: 10 } })
  expect(readCompanionHostEvent({ kind: 'digest', digest: { ...digest, tools: '2' } })).toBeUndefined()
  expect(readCompanionHostEvent({ kind: 'digest', digest: null })).toBeUndefined()
  expect(readCompanionHostEvent({ kind: 'speech', who: 'miku', text: '在' })).toEqual({ kind: 'speech', who: 'miku', text: '在' })
  expect(readCompanionHostEvent({ kind: 'speech', who: 'miku' })).toBeUndefined()
  expect(readCompanionHostEvent({ kind: 'turn-end', who: 'miku' })).toEqual({ kind: 'turn-end', who: 'miku' })
  expect(readCompanionHostEvent({ kind: 'turn-end', who: 'miku', error: '401' })).toEqual({ kind: 'turn-end', who: 'miku', error: '401' })
  expect(readCompanionHostEvent({ kind: 'turn-end', who: 'miku', error: 401 })).toBeUndefined()
  expect(readCompanionHostEvent({ kind: 'turn-end' })).toBeUndefined()
  expect(readCompanionHostEvent({ kind: 'ask-result', requestId: 3, ok: true, newDay: true })).toEqual({ kind: 'ask-result', requestId: 3, ok: true, newDay: true })
  expect(readCompanionHostEvent({ kind: 'ask-result', requestId: 3, ok: false, error: 'no' })).toEqual({ kind: 'ask-result', requestId: 3, ok: false, error: 'no' })
  for (const bad of [{ requestId: 1.5, ok: true }, { requestId: 1, ok: 'yes' }, { requestId: 1, ok: false, error: 4 }, { requestId: 1, ok: true, newDay: false }]) {
    expect(readCompanionHostEvent({ kind: 'ask-result', ...bad })).toBeUndefined()
  }
  expect(readCompanionHostEvent({ kind: 'other' })).toBeUndefined()
  expect(readCompanionHostEvent(null)).toBeUndefined()
})
