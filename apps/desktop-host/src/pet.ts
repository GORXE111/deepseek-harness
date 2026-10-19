/**
 * Desktop companion bridge, Host side: observes the user's sessions, runs the companions' own
 * sessions, and exchanges companion messages with the Electron shell.
 *
 * Data and actions live here; presentation lives in the shell. The bridge reports finished turns
 * (as digests), whether the user's agents are busy, the companion settings, and the companion's
 * own replies; the shell decides whether and how she speaks, in which character's voice.
 *
 * Companion sessions join one Workspace titled 「桌面陪伴助手」 at `$DSH_HOME/pet`. They stay
 * visible there rather than archived: an archived Session may not run a model step. Each companion
 * keeps one session per local calendar day; a new day archives the previous one, so the Workspace
 * shows the current conversations while history stays reachable through the archive filter.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller'
import type {} from '@deepseek-ai/dsh-client-ui-settings-pet'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { PetDigest, PetHostEvent, PetShellCommand } from './pet-protocol.ts'

/** Title of the Workspace holding the companions' sessions. */
export const PET_WORKSPACE_TITLE = '桌面陪伴助手'

/** Longest prompt kept in a digest. */
export const MAX_DIGEST_PROMPT_CHARS = 600

/** Longest answer kept in a digest; more only spends tokens on retelling. */
export const MAX_DIGEST_ANSWER_CHARS = 4000

/** Longest failure message of a companion turn; it is shown in a bubble. */
export const MAX_TURN_ERROR_CHARS = 200

/**
 * Sessions observed at once. A turn start and its end are not guaranteed to pair (a session
 * deleted mid-turn, an interrupted task), so the oldest observation is dropped past this bound.
 */
export const MAX_OBSERVED_SESSIONS = 32

/** One companion's current session. */
export interface PetSessionRecord {
  /** Session id. */
  id: string
  /** Local calendar day the session belongs to. */
  day: string
  /** Nickname the session was last told to use; a change is announced in the next prompt. */
  greetedAs: string
}

/** Injectable environment for tests. */
export interface PetBridgeOptions {
  /** Directory holding the companions' Workspace and `sessions.json`; defaults to `$DSH_HOME/pet`. */
  root?: string
  /** Current time. */
  now?: () => Date
}

/**
 * Local calendar day key. Local rather than UTC: "a new day" means the user's day, and UTC
 * would reset the companion's memory at 08:00 in UTC+8.
 * @param now - current time.
 * @returns a `YYYY-M-D` key.
 */
export function localDay(now: Date): string {
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1)}-${String(now.getDate())}`
}

/**
 * Readable text of one message's content blocks; reasoning and tool calls are excluded.
 * @param content - message content blocks.
 * @returns the joined text, empty when nothing is readable.
 */
export function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is { type: 'text'; text: string } =>
      typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text'
      && typeof (part as { text?: unknown }).text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim()
}

/**
 * Install the bridge on the booted Host tree.
 * @param ctx - booted Desktop profile context.
 * @param send - delivers one companion event to the shell.
 * @param options - storage root and clock overrides.
 * @returns the command handler for shell messages.
 */
export function installDesktopPet(
  ctx: Context,
  send: (event: PetHostEvent) => void,
  options: PetBridgeOptions = {},
): (command: PetShellCommand) => void {
  const root = options.root ?? dshHomePath('pet')
  const now = options.now ?? (() => new Date())
  const storePath = join(root, 'sessions.json')

  let started = false
  const emit = (event: PetHostEvent): void => { if (started) send(event) }

  // Companion sessions by companion id, persisted so a restart continues the same conversation.
  const sessions = new Map<string, PetSessionRecord>()
  try {
    const stored = JSON.parse(readFileSync(storePath, 'utf8')) as { sessions?: Record<string, unknown> }
    for (const [who, value] of Object.entries(stored.sessions ?? {})) {
      const record = value as Partial<PetSessionRecord>
      if (typeof record.id === 'string' && typeof record.day === 'string') {
        sessions.set(who, { id: record.id, day: record.day, greetedAs: typeof record.greetedAs === 'string' ? record.greetedAs : '' })
      }
    }
  } catch { /* no stored sessions yet, or an unreadable file: start fresh */ }
  const persist = (): void => {
    mkdirSync(dirname(storePath), { recursive: true })
    writeFileSync(storePath, `${JSON.stringify({ sessions: Object.fromEntries(sessions) }, undefined, 2)}\n`)
  }
  const companionOf = (sessionId: string): string | undefined => {
    for (const [who, record] of sessions) if (record.id === sessionId) return who
    return undefined
  }

  // ---- Observation of the user's sessions ----
  interface ObservedTurn { prompt: string; answers: string[]; tools: number; startedAt: number }
  const turns = new Map<string, ObservedTurn>()
  const observe = (sessionId: string, startedAt: number, prompt: string): ObservedTurn => {
    const entry: ObservedTurn = { prompt, answers: [], tools: 0, startedAt }
    turns.delete(sessionId)
    turns.set(sessionId, entry)
    while (turns.size > MAX_OBSERVED_SESSIONS) turns.delete(turns.keys().next().value as string)
    return entry
  }
  // A turn joined mid-way still reports, with its duration measured from first sight.
  const slot = (sessionId: string) => turns.get(sessionId) ?? observe(sessionId, now().getTime(), '')

  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    const sessionId = session.id
    const who = companionOf(sessionId)
    if (who !== undefined) {
      if (event.type === 'assistant/message') {
        const text = textOf(event.data.message.content)
        if (text !== '') emit({ kind: 'speech', who, text })
      } else if (event.type === 'turn/end') {
        // Without this a failed turn (no credential, no network) would leave her thinking forever.
        const { reason } = event.data
        emit(reason.kind === 'error'
          ? { kind: 'turn-end', who, error: reason.error.message.slice(0, MAX_TURN_ERROR_CHARS) }
          : { kind: 'turn-end', who })
      }
      return
    }
    // Subagent sessions report through the session that delegated to them.
    if (session.header.parentSession !== undefined) return
    switch (event.type) {
      case 'user/message':
        // Only a human prompt opens a turn worth reporting; injected context does not.
        if (event.data.source.kind !== 'user') return
        observe(sessionId, now().getTime(), textOf(event.data.content).slice(0, MAX_DIGEST_PROMPT_CHARS))
        return
      case 'assistant/message': {
        const text = textOf(event.data.message.content)
        if (text !== '') slot(sessionId).answers.push(text)
        return
      }
      case 'tool/call':
        slot(sessionId).tools += 1
        return
      case 'turn/end': {
        const entry = turns.get(sessionId)
        turns.delete(sessionId)
        if (entry === undefined) return
        const answer = entry.answers.join('\n').trim()
        // Neither a prompt nor an answer: replayed history or an empty turn, nothing to report.
        if (entry.prompt === '' && answer === '') return
        const digest: PetDigest = {
          sessionId,
          prompt: entry.prompt,
          answer: answer.slice(0, MAX_DIGEST_ANSWER_CHARS),
          tools: entry.tools,
          durationMs: Math.max(0, now().getTime() - entry.startedAt),
        }
        emit({ kind: 'digest', digest })
        return
      }
      default:
        return
    }
  })

  // ---- Whether the user's agents are busy ----
  const running = new Set<string>()
  let busy = false
  const publishBusy = (): void => {
    const next = running.size > 0
    if (next === busy) return
    busy = next
    emit({ kind: 'busy', running: busy })
  }
  ctx.on('agent/status', ({ agent, status }: { agent: Agent; status: AgentStatus }) => {
    if (companionOf(agent.id) !== undefined) return
    if (status === 'running') running.add(agent.id)
    else running.delete(agent.id)
    publishBusy()
  })
  ctx.on('agent/disposed', ({ agent }: { agent: Agent }) => {
    running.delete(agent.id)
    publishBusy()
  })

  // ---- Settings ----
  const settings = () => ctx.get('petSettings')?.get()
  ctx.on('pet/settings-changed', (next) => { emit({ kind: 'settings', settings: next }) })

  // ---- The companions' own sessions ----
  let workspace: Promise<WorkspaceId> | undefined
  const ensureWorkspace = (): Promise<WorkspaceId> => workspace ??= (async () => {
    mkdirSync(root, { recursive: true })
    const controller = ctx.get('workspaceController')
    if (controller === undefined) throw new Error('companion: the Workspace service is unavailable')
    const { workspace: view, created } = await controller.create({ path: root })
    if (created) await controller.rename({ workspaceId: view.workspaceId, title: PET_WORKSPACE_TITLE })
    return view.workspaceId
  })().catch((error: unknown) => { workspace = undefined; throw error })

  const retire = async (record: PetSessionRecord): Promise<void> => {
    // Archiving hides yesterday's conversation; a refusal (it is still running) leaves it visible.
    try { await ctx.get('workspaceController')?.archiveSession({ sessionId: record.id as SessionId }) } catch { /* stays visible */ }
  }

  /** The companion's session for today, and whether an earlier day's session was just set aside for it. */
  const sessionFor = async (who: string, preset: string): Promise<{ record: PetSessionRecord; newDay: boolean }> => {
    const today = localDay(now())
    const current = sessions.get(who)
    if (current !== undefined && current.day === today) return { record: current, newDay: false }
    if (current !== undefined) {
      sessions.delete(who)
      persist()
      await retire(current)
    }
    const controller = ctx.get('sessionController')
    if (controller === undefined) throw new Error('companion: the Session service is unavailable')
    const workspaceId = await ensureWorkspace()
    const created = await controller.create({ workspaceId, agentPreset: preset })
    const record = { id: created.sessionId, day: today, greetedAs: '' }
    sessions.set(who, record)
    persist()
    return { record, newDay: current !== undefined }
  }

  // Questions to one companion run in order, so two quick asks cannot create two sessions.
  const queues = new Map<string, Promise<void>>()
  const ask = (command: Extract<PetShellCommand, { kind: 'ask' }>): void => {
    const run = async (): Promise<boolean> => {
      const { record, newDay } = await sessionFor(command.who, command.preset)
      let text = command.text
      const nickname = settings()?.nickname ?? ''
      if (nickname !== record.greetedAs) {
        record.greetedAs = nickname
        persist()
        if (nickname !== '') {
          const note = command.locale === 'zh' ? `（称呼我为「${nickname}」）` : `(Call me “${nickname}”.)`
          text = `${note}\n\n${text}`
        }
      }
      const controller = ctx.get('sessionController')
      if (controller === undefined) throw new Error('companion: the Session service is unavailable')
      await controller.prompt({
        requestId: randomUUID() as SessionRequestId,
        sessionId: record.id as SessionId,
        mode: 'queue',
        content: [{ type: 'text', text }],
      }, new AbortController().signal)
      return newDay
    }
    const previous = queues.get(command.who) ?? Promise.resolve()
    const next = previous.then(run).then(
      (newDay) => { emit({ kind: 'ask-result', requestId: command.requestId, ok: true, ...newDay ? { newDay } : {} }) },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        emit({ kind: 'ask-result', requestId: command.requestId, ok: false, error: message.slice(0, 200) })
      },
    )
    queues.set(command.who, next)
  }

  const freshTopic = (who: string): void => {
    const current = sessions.get(who)
    if (current === undefined) return
    sessions.delete(who)
    persist()
    void retire(current)
  }

  return (command) => {
    switch (command.kind) {
      case 'start': {
        started = true
        const current = settings()
        if (current !== undefined) emit({ kind: 'settings', settings: current })
        send({ kind: 'busy', running: busy })
        return
      }
      case 'stop':
        started = false
        return
      case 'ask':
        ask(command)
        return
      case 'fresh-topic':
        freshTopic(command.who)
        return
    }
  }
}
