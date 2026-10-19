/**
 * The desktop companion row in Settings → General: who sits on the desktop and what she calls
 * the user. The choice of companion writes at once; the nickname writes on blur or Enter. The
 * `voice*` fields of the section deliberately have no control here (see pet-settings.ts).
 */

import type { KeyboardEvent } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { COMPANIONS, MAX_NICKNAME_CHARS } from '../pet-settings.ts'
import type { createCompanionRowStore } from './store.ts'
import css from './CompanionRow.module.css'

/** Injected business face: the row's two durable writes. */
export interface CompanionRowInjected {
  /** Choose who sits on the desktop. */
  setCharacter: (id: string) => void
  /** Store what the companion calls the user; the writer truncates to the nickname limit. */
  setNickname: (nickname: string) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type CompanionRowProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createCompanionRowStore>>
  & PropsLocale<'settings.pet'> & CompanionRowInjected

/**
 * Render the companion row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function CompanionRow({ t, useStore, setCharacter, setNickname }: CompanionRowProps) {
  const character = useStore(s => s.character)
  const nickname = useStore(s => s.nickname)
  const writable = useStore(s => s.writable)
  const commit = (next: string): void => { if (next !== nickname) setNickname(next) }
  return (
    <div className={css.group}>
      <div className={css.title}>{t('title')}</div>
      <div className={css.row} role="radiogroup" aria-label={t('companion')}>
        <span className={css.label}>{t('companion')}</span>
        {COMPANIONS.map(one => (
          <label key={one.id} className={css.check}>
            <input
              type="radio"
              name="dsh-pet-companion"
              checked={character === one.id}
              disabled={!writable}
              onChange={() => { setCharacter(one.id) }}
            />
            {one.name}
          </label>
        ))}
      </div>
      <div className={css.row}>
        <span className={css.label}>{t('nickname')}</span>
        {/* Identity is the committed nickname, so a saved change remounts the field with it. */}
        <input
          key={nickname}
          className={css.input}
          defaultValue={nickname}
          disabled={!writable}
          maxLength={MAX_NICKNAME_CHARS}
          placeholder={t('placeholder')}
          aria-label={t('nickname')}
          onBlur={(event) => { commit(event.currentTarget.value) }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') commit(event.currentTarget.value) }}
        />
      </div>
      <span className={css.hint}>{t('hint')}</span>
    </div>
  )
}
