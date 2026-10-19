import type { Context } from '@deepseek-ai/cordis'
import base from '../styles/base.css?inline'
import cornerShape from '../styles/corner-shape.css?inline'
import designPlatform from '../styles/design-platform.css?inline'
import focus from '../styles/focus.css?inline'
import onboarding from '../styles/onboarding.css?inline'
import scrollbar from '../styles/scrollbar.css?inline'
import gradientShadowText from '../styles/gradient-shadow-text.css?inline'
import shiki from '../styles/shiki.css?inline'

const PLUGIN_ID = '@deepseek-ai/dsh-client-ui-theme'

const STYLES = [
  ['base.css', base],
  ['corner-shape.css', cornerShape],
  ['design-platform.css', designPlatform],
  ['focus.css', focus],
  ['onboarding.css', onboarding],
  ['scrollbar.css', scrollbar],
  ['gradient-shadow-text.css', gradientShadowText],
  ['shiki.css', shiki],
] as const

/**
 * Mount the global theme sheets for exactly the owning plugin lifetime.
 * @param ctx - Owning plugin context.
 */
export function installThemeStyles(ctx: Context): void {
  if (typeof document === 'undefined') return
  for (const [name, css] of STYLES) {
    ctx.effect(() => {
      const tag = document.createElement('style')
      tag.dataset.plugin = PLUGIN_ID
      tag.dataset.pluginCss = `${PLUGIN_ID}/${name}`
      tag.textContent = css
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }, `ui-theme: ${name} stylesheet`)
  }
}

/**
 * Mount the conversation-backdrop sheet and return its writer.
 *
 * One long-lived tag whose text is rewritten, rather than a tag per selection: the
 * backdrop changes while the user drags the strength slider, and replacing the element
 * every frame makes the browser drop and re-decode the background instead of repainting.
 * @param ctx - Owning plugin context.
 * @returns a setter taking the sheet text; an empty string clears the backdrop.
 */
export function installBackdrop(ctx: Context): (css: string) => void {
  /* v8 ignore next -- needs a documentless run (node e2e booting the client tree), not constructible under jsdom */
  if (typeof document === 'undefined') return () => {}
  let live: HTMLStyleElement | undefined
  let pending = ''
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = `${PLUGIN_ID}/conversation-backdrop`
    // A selection adopted from settings during plugin start precedes this effect.
    tag.textContent = pending
    document.head.appendChild(tag)
    live = tag
    return () => { live = undefined; tag.remove() }
  }, 'ui-theme: conversation backdrop stylesheet')
  return (css) => {
    pending = css
    if (live !== undefined) live.textContent = css
  }
}
