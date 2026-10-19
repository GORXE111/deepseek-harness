/**
 * When a finished turn is worth a word from the companion, and how several finished turns
 * become one sentence.
 *
 * Without this gate every finished turn pops a bubble; a few quick questions in a row become a
 * stack of bubbles in the screen corner, each pushing out the last. Two gates:
 *
 *  1. **Threshold**: a turn counts as work when it called a tool, ran long enough, or answered at
 *     length. Any one suffices: a two-minute answer without tools is work, and so is an instant
 *     batch rename with five tool calls.
 *  2. **Batching**: an accepted turn waits a moment so turns finishing together become one
 *     sentence; after speaking, a quiet period collects later turns for the next sentence.
 */

import type { CompanionDigest } from './companion-protocol.ts'
import type { CompanionLines } from './companion-characters.ts'

/** Below this duration, with no other sign of work, a turn is a casual question. */
export const MIN_DURATION_MS = 20_000

/** A long answer is work even without tools. */
export const MIN_ANSWER_CHARS = 600

/** How long accepted turns collect before speaking: short enough to feel prompt, long enough to catch concurrent turns. */
export const BATCH_MS = 4000

/** Quiet period after speaking; turns finishing meanwhile are collected for the next sentence. */
export const QUIET_MS = 15_000

/** Longest task title in a bubble line. */
export const MAX_BRIEF_CHARS = 22

/** Most tasks listed in one sentence; the rest are summarized as a count. */
export const MAX_LISTED = 4

/** Threshold overrides for tests. */
export interface AnnounceLimits {
  readonly minDurationMs?: number
  readonly minAnswerChars?: number
}

/**
 * Whether a finished turn counts as work worth announcing.
 * @param digest - the finished turn.
 * @param limits - threshold overrides.
 * @returns true when it called a tool, ran long enough, or answered at length.
 */
export function isWorthAnnouncing(digest: CompanionDigest, limits: AnnounceLimits = {}): boolean {
  if (digest.tools > 0) return true
  if (digest.durationMs >= (limits.minDurationMs ?? MIN_DURATION_MS)) return true
  return digest.answer.length >= (limits.minAnswerChars ?? MIN_ANSWER_CHARS)
}

/** Injectable clock and timers; every rule here is defined by time. */
export interface AnnouncerOptions extends AnnounceLimits {
  /** Receives one batch of at least one accepted turn. */
  readonly emit: (digests: CompanionDigest[]) => void
  readonly now?: () => number
  readonly setTimer?: (callback: () => void, ms: number) => unknown
  readonly clearTimer?: (timer: unknown) => void
  readonly batchMs?: number
  readonly quietMs?: number
}

/** Collects finished turns and releases them in batches. */
export interface Announcer {
  /** Offer one finished turn; returns whether it passed the threshold. */
  offer(digest: CompanionDigest): boolean
  /** Release the collected turns now. */
  flush(): void
  /** Drop the collected turns. */
  cancel(): void
  /** Collected turn count. */
  size(): number
}

/**
 * Create a batching announcer.
 * @param options - emit target, clock, timers, and thresholds.
 * @returns the announcer.
 */
export function createAnnouncer(options: AnnouncerOptions): Announcer {
  const now = options.now ?? Date.now
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms))
  const clearTimer = options.clearTimer ?? ((timer: unknown) => { clearTimeout(timer as ReturnType<typeof setTimeout>) })
  const batchMs = options.batchMs ?? BATCH_MS
  const quietMs = options.quietMs ?? QUIET_MS
  let pending: CompanionDigest[] = []
  let lastEmit = -Infinity
  let timer: unknown

  const fire = (): void => {
    timer = undefined
    if (pending.length === 0) return
    const batch = pending
    pending = []
    lastEmit = now()
    options.emit(batch)
  }
  const stop = (): void => {
    if (timer !== undefined) clearTimer(timer)
    timer = undefined
  }
  return {
    offer: (digest) => {
      if (!isWorthAnnouncing(digest, options)) return false
      pending.push(digest)
      // Due at the later of the batch window and the quiet period. A scheduled batch is not
      // pushed back by later turns, or a steady stream of turns would never be announced.
      if (timer === undefined) {
        const due = Math.max(now() + batchMs, lastEmit + quietMs)
        timer = setTimer(fire, Math.max(0, due - now()))
      }
      return true
    },
    flush: () => { stop(); fire() },
    cancel: () => { stop(); pending = [] },
    size: () => pending.length,
  }
}

/**
 * Fold a prompt into a short task title.
 * @param prompt - the user's prompt.
 * @returns the title, empty when the prompt is.
 */
export function brief(prompt: string): string {
  const flat = prompt.replace(/\s+/gu, ' ').trim()
  return flat.length > MAX_BRIEF_CHARS ? `${flat.slice(0, MAX_BRIEF_CHARS)}…` : flat
}

/**
 * Compose the companion's announcement of finished turns from facts only.
 *
 * No model retells the work: a small model paraphrasing another model's truncated output is
 * wrong often enough that the user would believe failed work succeeded. The full output stays in
 * the main window; the bubble names the tasks in the user's own words.
 * @param digests - the batch, at least one turn.
 * @param nickname - how to address the user; empty for no address.
 * @param lines - the current character's lines in the current language.
 * @returns the bubble text, empty for an empty batch.
 */
export function composeAnnouncement(digests: readonly CompanionDigest[], nickname: string, lines: CompanionLines): string {
  const [first] = digests
  if (first === undefined) return ''
  const address = nickname === '' ? '' : lines.address(nickname)
  if (digests.length === 1) {
    const one = brief(first.prompt)
    return address + (one === '' ? lines.doneOne : lines.doneNamed(one))
  }
  const head = address + lines.doneMany(digests.length)
  const names = digests.map(digest => brief(digest.prompt)).filter(name => name !== '')
  if (names.length === 0) return head
  const shown = names.slice(0, MAX_LISTED).map(name => `· ${name}`)
  const rest = names.length - shown.length
  if (rest > 0) shown.push(`· ${lines.doneRest(rest)}`)
  return [head, ...shown].join('\n')
}
