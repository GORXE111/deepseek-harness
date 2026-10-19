// @vitest-environment jsdom
/** The conversation-backdrop sheet: one long-lived tag rewritten in place for the plugin lifetime. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { installBackdrop } from '../src/client/styles.ts'

const sheet = (): HTMLStyleElement | null =>
  document.head.querySelector('style[data-plugin-css="@deepseek-ai/dsh-client-ui-theme/conversation-backdrop"]')

describe('installBackdrop', () => {
  it('mounts one tag, rewrites its text, and removes it with the plugin', async () => {
    const ctx = new Context()
    let setBackdrop: (css: string) => void = () => {}
    const fiber = ctx.plugin({ apply: (child: Context) => { setBackdrop = installBackdrop(child) } })
    await fiber.await()
    const tag = sheet()
    expect(tag?.textContent).toBe('')
    setBackdrop('a { color: red; }')
    setBackdrop('a { color: blue; }')
    expect(sheet()).toBe(tag)
    expect(tag?.textContent).toBe('a { color: blue; }')
    await fiber.dispose()
    expect(sheet()).toBeNull()
    // A write after teardown has no tag to reach and must not throw.
    setBackdrop('a { color: green; }')
    expect(sheet()).toBeNull()
  })
})
