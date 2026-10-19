'use strict'

/**
 * Frame sprite drawing: 4 frames of 64x64 per animation on a transparent sheet. Scaling keeps
 * `imageSmoothingEnabled = false`; interpolation would blur the hard pixel edges.
 */
;(() => {
  const FRAME = 64
  const FRAMES = 4
  /** Every character has an idle animation; a missing one falls back to it. */
  const FALLBACK = 'idle'

  let images = new Map()
  /** Nothing is drawn until a character's sheets are decoded, so no half-loaded frame flashes. */
  let ready = false

  /**
   * Load a character's sheets.
   * @param {{dir: string}} def - character definition.
   * @param {string[]} anims - animation names.
   * @returns {Promise<string[]>} names that failed to load.
   */
  function load(def, anims) {
    ready = false
    const next = new Map()
    const failed = []
    const one = (anim) => new Promise((resolve) => {
      const img = new Image()
      img.onload = () => { next.set(anim, img); resolve() }
      // A missing sheet costs one animation, not the whole companion.
      img.onerror = () => { console.error('[companion] sprite failed to load:', `${def.dir}/${anim}.png`); failed.push(anim); resolve() }
      img.src = `${def.dir}/${anim}.png`
    })
    return Promise.all(anims.map(one)).then(() => {
      images = next
      ready = true
      return failed
    })
  }

  /**
   * Draw one frame.
   * @param {CanvasRenderingContext2D} ctx - target canvas.
   * @param {string} anim - animation name.
   * @param {number} frame - frame index, taken modulo the frame count.
   * @param {number} scale - integer scale.
   */
  function draw(ctx, anim, frame, scale) {
    if (!ready) return
    const img = images.get(anim) ?? images.get(FALLBACK)
    if (img === undefined) return
    const size = FRAME * scale
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size, size)
    const col = ((frame % FRAMES) + FRAMES) % FRAMES
    ctx.drawImage(img, col * FRAME, 0, FRAME, FRAME, 0, 0, size, size)
  }

  globalThis.__dshSprite = { FRAME, FRAMES, load, draw }
})()
