/**
 * Render DeepSeek Client's raster artwork from the single vector source `resources/icon-windows.svg`.
 *
 * Outputs, all committed: the application icons electron-builder packages (`resources/icon*.png`),
 * the Windows installer's light and dark brand banners at 1x and 2x (`installer/assets/brand*.png`),
 * and the uninstaller sidebar (`installer/assets/uninstaller-sidebar.png`). The tray icon has its
 * own renderer (scripts/render-tray-icon.ts) because it enlarges the glyph per bitmap size.
 *
 * Rerun `pnpm exec tsx scripts/render-client-artwork.ts` in `apps/desktop` after changing the icon.
 * Text uses the platform UI font, so render on Windows to match what the installer shows.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const PRODUCT = 'DeepSeek Client'
const FONT = "'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif"
const at = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url))

/** The icon's inner markup, re-embedded at any position and size through a nested viewport. */
async function iconMarkup(): Promise<string> {
  const source = await readFile(at('resources/icon-windows.svg'), 'utf8')
  const inner = /<svg[^>]*>([\s\S]*)<\/svg>\s*$/u.exec(source)?.[1]
  if (inner === undefined) throw new Error('render-client-artwork: icon source is not a single <svg> document')
  return inner
}

/** One raster made from an SVG document, scaled by `scale` from its own user units. */
async function render(svg: string, output: string, scale = 1, background?: string): Promise<void> {
  let image = sharp(Buffer.from(svg), { density: 72 * scale })
  if (background !== undefined) image = image.flatten({ background })
  await image.png().toFile(at(output))
}

/**
 * Installer banner: the icon tile above the product name, on a transparent ground the
 * installer page paints itself. 600 × 196 user units, rendered at 1x and 2x.
 */
function banner(icon: string, text: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="196" viewBox="0 0 600 196">
  <svg x="240" y="4" width="120" height="120" viewBox="0 0 1024 1024">${icon}</svg>
  <text x="300" y="174" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="600" fill="${text}">${PRODUCT}</text>
</svg>`
}

async function main(): Promise<void> {
  const icon = await iconMarkup()
  const square = (edge: number): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${edge}" height="${edge}" viewBox="0 0 1024 1024">${icon}</svg>`

  for (const path of ['resources/icon-windows.png', 'resources/icon-macos.png', 'resources/icon.png']) {
    await render(square(1024), path)
  }
  for (const [path, text, scale] of [
    ['installer/assets/brand.png', '#0f1115', 1],
    ['installer/assets/brand-2x.png', '#0f1115', 2],
    ['installer/assets/brand-dark.png', '#f9fafb', 1],
    ['installer/assets/brand-dark-2x.png', '#f9fafb', 2],
  ] as const) {
    await render(banner(icon, text), path, scale)
  }
  // The uninstaller's welcome and finish pages share this opaque sidebar; packaging converts it to BMP.
  await render(`<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <svg x="30" y="96" width="104" height="104" viewBox="0 0 1024 1024">${icon}</svg>
</svg>`, 'installer/assets/uninstaller-sidebar.png', 1, '#f3f4f6')
}

await main()
