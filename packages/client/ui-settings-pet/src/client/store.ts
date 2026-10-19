/**
 * Companion row slot store: a mirror of the durable `pet` section. The plugin's apply-world
 * subscription is the only writer; the row reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import { DEFAULT_PET_SETTINGS } from '../pet-settings.ts'

/** Store state the row renders. */
export interface CompanionRowState {
  /** Chosen companion id. */
  character: string
  /** What the companion calls the user. */
  nickname: string
  /** Whether this deployment accepts settings writes. */
  writable: boolean
  /** Section revision; -1 until the first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type CompanionRowActions = {
  sync: (draft: CompanionRowState, character: string, nickname: string, writable: boolean, revision: number) => void
}

/**
 * Declares the companion row state and write surface.
 * @returns the store handle.
 */
export function createCompanionRowStore(): EngineStoreHandle<CompanionRowState, CompanionRowActions> {
  return defineStore({
    init: (): CompanionRowState => ({
      character: DEFAULT_PET_SETTINGS.character, nickname: DEFAULT_PET_SETTINGS.nickname, writable: false, revision: -1,
    }),
    actions: {
      // A local edit republishes at the same revision until the Host accepts it, so an equal
      // revision is adopted; only an older one is dropped.
      sync: (d, character: string, nickname: string, writable: boolean, revision: number) => {
        if (revision < d.revision) return
        d.character = character
        d.nickname = nickname
        d.writable = writable
        d.revision = revision
      },
    },
  })
}
