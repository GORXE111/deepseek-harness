/**
 * Live compact progress lines for the headless runner: one collapsed
 * `⏺ Title(summary)` line per tool call, streamed to stdout as `tool/result`
 * events settle, plus a plain-text description of a non-`completed` turn-end
 * reason. Formatting rules are a plain-string port of the web client's
 * per-tool-type summary rules (`packages/client/ui-tool/src/client/tool/models/tool-call-model.ts`)
 * so a headless run reads like the same tool activity the browser UI shows,
 * without any React/DOM dependency.
 * @module @deepseek-ai/dsh-headless/progress
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CallId, ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session'

/**
 * Tool-call row variants this reporter classifies — a superset of the web
 * client's table: `subagent`/`workflow` are deliberate additions, see module doc.
 */
type ToolProgressVariant = 'bash' | 'read' | 'search' | 'write' | 'edit' | 'code' | 'subagent' | 'workflow' | 'others'

/** Known tool name -> variant, mirroring `TOOL_VARIANTS` in the web client's tool-call model. */
const TOOL_VARIANTS: Record<string, ToolProgressVariant> = {
  bash: 'bash',
  pwsh: 'bash',
  read: 'read',
  web_fetch: 'read',
  web_search: 'search',
  grep: 'search',
  glob: 'search',
  write: 'write',
  edit: 'edit',
  run_code: 'code',
  subagent: 'subagent',
  subagent_fork: 'subagent',
  workflow: 'workflow',
}

/** Row titles per variant; `others` falls back to the raw tool name instead of a static label. */
const VARIANT_TITLES: Record<ToolProgressVariant, string> = {
  bash: 'Bash', read: 'Read', search: 'Search', write: 'Write', edit: 'Edit', code: 'Code',
  subagent: 'Subagent', workflow: 'Workflow', others: 'Tool call',
}

/** Summary key preference per variant (args-derived); `subagent`/`workflow` are derived specially, see {@link deriveSummary}. */
const SUMMARY_KEYS: Record<ToolProgressVariant, readonly string[]> = {
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description'],
  subagent: [],
  workflow: [],
  others: [],
}

/** A terminal transcript has no expand affordance, so a summary line is capped rather than wrapped. */
const MAX_SUMMARY_CHARS = 100

function classifyTool(toolName: string): ToolProgressVariant {
  return TOOL_VARIANTS[toolName] ?? 'others'
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_CHARS ? `${text.slice(0, MAX_SUMMARY_CHARS - 1)}…` : text
}

function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

function parseArgs(argsRaw: string): unknown {
  try {
    return JSON.parse(argsRaw)
  } catch {
    // Non-JSON args (mid-stream truncation, a malformed call): summary falls back to the raw string.
    return undefined
  }
}

function pickString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

/**
 * Derive a one-line summary from a tool call's raw arguments.
 * `subagent` prefers the tool's own short `description` field, then the
 * delegated `prompt`'s first line. `workflow` prefers `meta.name`/`meta.description`
 * — deliberately never the raw `script` field, which would otherwise win the
 * generic first-string-value fallback and dump a multi-line JS blob into the line.
 */
function deriveSummary(variant: ToolProgressVariant, argsRaw: string): string {
  const parsed = parseArgs(argsRaw)
  const args = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  if (variant === 'subagent') {
    const picked = args === undefined ? undefined
      : pickString(args, ['description']) ?? (typeof args.prompt === 'string' && args.prompt !== '' ? firstLine(args.prompt) : undefined)
    return truncate(picked ?? firstLine(argsRaw))
  }
  if (variant === 'workflow') {
    const meta = args !== undefined && typeof args.meta === 'object' && args.meta !== null
      ? args.meta as Record<string, unknown>
      : undefined
    const picked = meta === undefined ? undefined : pickString(meta, ['name', 'description'])
    return truncate(picked ?? 'workflow run')
  }
  if (args === undefined) return truncate(firstLine(argsRaw))
  if (variant === 'search' && Array.isArray(args.queries)) {
    const queries = args.queries.filter((query): query is string => typeof query === 'string' && query !== '')
    if (queries.length > 0) return truncate(queries.map(firstLine).join(', '))
  }
  const picked = pickString(args, SUMMARY_KEYS[variant])
  if (picked !== undefined) return truncate(firstLine(picked))
  if (variant === 'others') {
    for (const value of Object.values(args)) {
      if (typeof value === 'string' && value !== '') return truncate(firstLine(value))
    }
  }
  return truncate(firstLine(argsRaw))
}

/** One collapsed `⏺ Title(summary)` line for a tool call, before any result suffix. */
function formatCallLine(name: string, argsRaw: string): string {
  const variant = classifyTool(name)
  const title = variant === 'others' && name !== '' ? name : VARIANT_TITLES[variant]
  return `⏺ ${title}(${deriveSummary(variant, argsRaw)})`
}

/**
 * Flatten a settled result's content blocks the same way the web client's
 * `resultText` does: text verbatim, other shapes as compact JSON, an empty
 * result falling back to the structured error's `name: code`.
 */
function flattenResult(content: readonly ContentBlock[], error: { name: string; code: string } | undefined): string {
  const parts: string[] = []
  for (const block of content) {
    parts.push(block.type === 'text' ? block.text : JSON.stringify(block))
  }
  if (parts.length === 0 && error !== undefined) parts.push(`${error.name}: ${error.code}`)
  return parts.join('\n')
}

/** The `✗ ...`/`(interrupted)` suffix appended to a call line on failure; empty string on success. */
function formatResultSuffix(
  isError: boolean,
  content: readonly ContentBlock[],
  error: { name: string; code: string } | undefined,
): string {
  if (!isError) return ''
  if (error?.code === 'interrupted') return ' (interrupted)'
  const line = firstLine(flattenResult(content, error))
  return line === '' ? ' ✗' : ` ✗ ${truncate(line)}`
}

/** One in-flight tool call, tracked from `tool/call` until its matching `tool/result`. */
interface PendingCall {
  name: string
  argsRaw: string
}

/** Output stream this reporter writes to. */
export interface ProgressIo {
  stdout: { write(chunk: string): unknown }
}

/**
 * Stream one compact line per tool call for `session` to `io.stdout` as its
 * `tool/result` events settle. Subscribes to the session-wide `session/event`
 * feed (`packages/core/session/src/index.ts`) filtered to this exact session,
 * so a delegated subagent's own child-session turns are never observed —
 * only the one call/result pair for the delegation itself prints a line.
 * @param ctx - context to subscribe the listener on.
 * @param session - the owned run's session; events from any other session are ignored.
 * @param io - where compact lines are written.
 * @returns detach() — unsubscribes and flushes any still-pending calls (a turn that ended mid-call) as "no result" lines.
 */
export function attachProgressReporter(ctx: Context, session: Session, io: ProgressIo): () => void {
  const pending = new Map<CallId, PendingCall>()
  const dispose = ctx.on('session/event', (eventSession: Session, event: SessionEvent) => {
    if (eventSession !== session) return
    if (event.type === 'tool/call') {
      pending.set(event.data.callId, { name: event.data.name, argsRaw: event.data.arguments })
      return
    }
    if (event.type === 'tool/result') {
      const block = event.data.message.content[0]
      const call = pending.get(block.toolCallId)
      pending.delete(block.toolCallId)
      const suffix = formatResultSuffix(block.isError === true, block.content, event.data.error)
      io.stdout.write(`${formatCallLine(call?.name ?? 'tool', call?.argsRaw ?? '')}${suffix}\n`)
    }
  })
  return () => {
    dispose()
    for (const call of pending.values()) {
      io.stdout.write(`${formatCallLine(call.name, call.argsRaw)} (interrupted — no result)\n`)
    }
    pending.clear()
  }
}

/** One plain-text line describing a non-`completed` turn-end reason, for reasons that otherwise print nothing today. */
export function describeAbnormalReason(reason: TurnEndReason): string {
  switch (reason.kind) {
    case 'aborted': return `aborted (${reason.reason.kind})`
    case 'blocked': return 'blocked'
    case 'max-tokens': return 'max output tokens reached'
    case 'interrupted': return 'interrupted by a restart'
    // Merge-extensible union: an unrecognized reason kind (a plugin's own
    // TurnEndReasonMap addition) still gets a diagnostic line instead of silence.
    default: return JSON.stringify(reason)
  }
}
