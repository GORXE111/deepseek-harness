'use strict'

/**
 * How each companion character acts out what happens. The shell reports facts (`done`, `reply`,
 * `error`, the agents running); each character maps them to her own animations, so adding a
 * character never touches the main process. The lines she says without a model live in the main
 * process (src/companion-characters.ts); both sides fall back to MIKU for an unknown id.
 */
;(() => {
  /** Looping roles: what she is doing now. `held` lasts as long as the drag. */
  const BASE_ROLES = ['idle', 'busy', 'attention', 'nap', 'held']

  /** One-shot roles: something just happened; played once, then back to the looping role. */
  const SHOT_ROLES = ['done', 'reply', 'error', 'greet']

  const CHARACTERS = {
    miku: {
      id: 'miku',
      dir: 'assets/miku',
      roles: {
        idle: 'idle', busy: 'thinking', attention: 'wave', nap: 'sleepy', held: 'shy',
        done: 'clap', reply: 'happy', error: 'sad', greet: 'wave',
      },
      // All eight animations already carry a meaning; none is spare for idle flourishes.
      flourish: [],
    },
    zhuang: {
      id: 'zhuang',
      dir: 'assets/zhuang',
      roles: {
        // Picked up and shaken, surprise suits her better than shyness.
        idle: 'idle', busy: 'thinking', attention: 'wave', nap: 'sleepy', held: 'surprised',
        // Finished work is a victory report rather than applause; she greets with a nod.
        done: 'victory', reply: 'happy', error: 'sad', greet: 'nod',
      },
      // Her own craft, played now and then while idle.
      flourish: ['lightning', 'sword', 'meditate'],
    },
  }

  const DEFAULT_ID = 'miku'

  /** @returns the character for an id, MIKU when unknown. */
  const character = (id) => Object.hasOwn(CHARACTERS, id) ? CHARACTERS[id] : CHARACTERS[DEFAULT_ID]

  /** @returns the distinct animations a character uses, derived so no separate list can drift. */
  const animsOf = (def) => [...new Set([...Object.values(def.roles), ...def.flourish])]

  globalThis.__dshCharacters = { BASE_ROLES, SHOT_ROLES, CHARACTERS, DEFAULT_ID, character, animsOf }
})()
