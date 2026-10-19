/**
 * Desktop companion characters as the shell knows them: the agent preset that holds each
 * persona, and the few lines the shell itself says in her voice.
 *
 * The shell speaks without a model only to report facts (a task finished, a new topic, a new
 * day). Those lines follow the character; written once for everyone, 庄方宜 would cheer like MIKU
 * and nobody could tell which bubble came from the model. Sprites and animations live with the
 * companion page in `renderer/companion/characters.js`; both sides fall back to MIKU.
 */

/** Lines the shell says in one character's voice and language. */
export interface CompanionLines {
  /** A new topic was started. */
  readonly fresh: string
  /** A new day began; earlier conversation is set aside. */
  readonly newDay: string
  /** The question could not be delivered. */
  readonly noSession: string
  /** Address prefix; only called with a non-empty nickname. */
  readonly address: (nickname: string) => string
  /** One task finished whose prompt is unknown. */
  readonly doneOne: string
  /** One named task finished. */
  readonly doneNamed: (task: string) => string
  /** Several tasks finished. */
  readonly doneMany: (count: number) => string
  /** Tasks beyond the listed ones. */
  readonly doneRest: (count: number) => string
}

/** One companion character. */
export interface CompanionCharacter {
  readonly id: string
  /** Agent preset holding her persona. */
  readonly preset: string
  readonly lines: { readonly zh: CompanionLines; readonly en: CompanionLines }
}

const MIKU: CompanionCharacter = {
  id: 'miku',
  preset: 'pet',
  lines: {
    zh: {
      fresh: '好，换个话题',
      newDay: '新的一天啦，昨天的事 MIKU 忘光光咯',
      noSession: '没能建立 MIKU 的会话',
      address: nickname => `${nickname}，`,
      doneOne: '刚才那轮任务搞定啦~',
      doneNamed: task => `你的「${task}」任务搞定啦~`,
      doneMany: count => `你的 ${String(count)} 个任务都搞定啦~`,
      doneRest: count => `还有 ${String(count)} 件`,
    },
    en: {
      fresh: 'Fresh topic',
      newDay: 'New day~ yesterday is all gone',
      noSession: 'couldn’t start MIKU’s session',
      address: nickname => `${nickname}, `,
      doneOne: 'that task is done~',
      doneNamed: task => `your task “${task}” is done~`,
      doneMany: count => `all ${String(count)} of your tasks are done~`,
      doneRest: count => `and ${String(count)} more`,
    },
  },
}

// The same lines in her manner: settled, set aside, the next matter. No particles, no "~".
const ZHUANG: CompanionCharacter = {
  id: 'zhuang',
  preset: 'pet-zhuang',
  lines: {
    zh: {
      fresh: '好，另起一件',
      newDay: '新的一天，昨天的事我搁下了',
      noSession: '没能建立会话',
      address: nickname => `${nickname}，`,
      doneOne: '刚才那轮活办完了',
      doneNamed: task => `你的「${task}」办完了`,
      doneMany: count => `你的 ${String(count)} 件事都办完了`,
      doneRest: count => `还有 ${String(count)} 件`,
    },
    en: {
      fresh: 'New topic.',
      newDay: 'New day. I’ve set yesterday aside.',
      noSession: 'couldn’t start the session',
      address: nickname => `${nickname}, `,
      doneOne: 'that one is done.',
      doneNamed: task => `your task “${task}” is done.`,
      doneMany: count => `all ${String(count)} of your tasks are done.`,
      doneRest: count => `and ${String(count)} more`,
    },
  },
}

const CHARACTERS: Readonly<Record<string, CompanionCharacter>> = { miku: MIKU, zhuang: ZHUANG }

/**
 * Resolve a character id; an unknown id falls back to MIKU, as the companion page does.
 * @param id - character id from the companion settings.
 * @returns the character.
 */
export function companionCharacter(id: string): CompanionCharacter {
  return (Object.hasOwn(CHARACTERS, id) ? CHARACTERS[id] : undefined) ?? MIKU
}
