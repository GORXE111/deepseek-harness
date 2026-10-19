'use strict'

/**
 * The companion page: draws her, plays what the main process reports, shows bubbles, and takes
 * a question. Dragging, sizing, menus, and where a question goes belong to the main process,
 * reached through `window.dshCompanion` (src/preload-companion.ts).
 */
;(() => {
  const api = globalThis.dshCompanion
  const { FRAME, FRAMES, load, draw: drawSprite } = globalThis.__dshSprite
  const { character, animsOf } = globalThis.__dshCharacters
  const voice = globalThis.__dshVoice

  const COPY = {
    zh: { placeholder: '说点什么…', send: '发送', failed: '发送失败' },
    en: { placeholder: 'Say something…', send: 'Send', failed: 'Couldn’t send' },
  }
  const copy = COPY[api?.locale] ?? COPY.en
  document.documentElement.lang = api?.locale === 'zh' ? 'zh-CN' : 'en'

  /** 64 px frames shown at 128 px; the CSS size equals the canvas size so the browser never rescales. */
  const SCALE = 2
  /** One frame rate for every animation; four frames cannot carry tempo changes, they only stutter. */
  const FRAME_MS = 500
  /** Idle this long and she naps; never while agents work, which is the state most worth seeing. */
  const NAP_AFTER = 4 * 60 * 1000
  /** Idle flourish interval bounds, for characters that have flourishes. */
  const FLOURISH_MIN = 25000
  const FLOURISH_MAX = 70000
  /** Pointer travel below this is a click, so a shaky hand still opens the input. */
  const DRAG_SLOP = 4
  /** Vertical body padding added to the measured bubble height. */
  const BODY_PAD = 16
  /** Main-process state to looping role. */
  const ROLE_OF_STATE = { idle: 'idle', running: 'busy' }

  const body = document.body
  const tank = document.getElementById('tank')
  const bubble = document.getElementById('bubble')
  const panel = document.getElementById('panel')
  const input = document.getElementById('input')
  const send = document.getElementById('send')
  const cv = document.getElementById('cv')
  const ctx = cv.getContext('2d')
  cv.width = FRAME * SCALE
  cv.height = FRAME * SCALE
  input.placeholder = copy.placeholder
  send.setAttribute('aria-label', copy.send)

  let who = character('')

  /* Two layers: a looping base role and a one-shot animation played over it once. A finished
     shot always falls back to the base, so "nothing else playing means idle" holds by structure. */
  let base = 'idle'
  let shot = null
  let frame = 0
  let timer = null
  let open = false
  let drag = null
  let napping = false
  let napTimer = null
  let flourishTimer = null
  let bubbleTimer = null

  const anim = (role) => who.roles[role] ?? who.roles.idle
  const current = () => shot ?? anim(base)
  const draw = () => { drawSprite(ctx, current(), frame, SCALE) }
  const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(step, ms) }
  const step = () => {
    frame = (frame + 1) % FRAMES
    draw()
    // A finished shot yields at once and draws the base's first frame, rather than holding its last frame.
    if (frame === 0 && shot !== null) { shot = null; draw() }
    schedule(FRAME_MS)
  }
  const setBase = (next) => {
    if (next === base && shot === null) return
    base = next
    shot = null
    frame = 0
    draw()
    schedule(FRAME_MS)
  }
  const playShot = (name) => {
    shot = name
    frame = 0
    draw()
    schedule(FRAME_MS)
  }

  const scheduleNap = () => {
    clearTimeout(napTimer)
    napTimer = setTimeout(() => {
      if (base === 'idle' && shot === null && !open && drag === null) { napping = true; setBase('nap') }
    }, NAP_AFTER)
  }
  /** Any interaction wakes her. */
  const wake = () => {
    if (napping) { napping = false; setBase('idle') }
    scheduleNap()
  }

  const scheduleFlourish = () => {
    clearTimeout(flourishTimer)
    if (who.flourish.length === 0) return
    flourishTimer = setTimeout(() => {
      if (base === 'idle' && shot === null && !open && drag === null && !napping) {
        playShot(who.flourish[Math.floor(Math.random() * who.flourish.length)])
      }
      scheduleFlourish()
    }, FLOURISH_MIN + Math.random() * (FLOURISH_MAX - FLOURISH_MIN))
  }

  /* Bubble height follows the text, measured off-screen first; resizing to measure would show
     an oversized empty window for a frame. */
  const ruler = document.createElement('div')
  ruler.className = 'bubble ruler'
  body.appendChild(ruler)
  const heightFor = (text) => {
    ruler.textContent = text
    return Math.ceil(ruler.getBoundingClientRect().height) + BODY_PAD
  }

  const hideBubble = () => {
    if (!body.classList.contains('bubbling')) return
    body.classList.remove('bubbling')
    setTimeout(async () => {
      bubble.classList.add('hidden')
      if (!open) await api?.resize('idle')
    }, 200)
  }

  /** Say one line. Never over the open input: the user is typing. Bubbles leave on their own. */
  const say = async (text, ms = 4200, speech = null) => {
    if (open || typeof text !== 'string' || text === '') return
    wake()
    if (speech !== null) {
      try { voice.speak(text, speech) } catch (error) { console.warn('[companion] speech failed:', error) }
    }
    clearTimeout(bubbleTimer)
    bubble.textContent = text
    bubble.classList.remove('hidden')
    await api?.resize('bubble', heightFor(text))
    requestAnimationFrame(() => { body.classList.add('bubbling') })
    bubbleTimer = setTimeout(hideBubble, ms)
  }

  /** Act out one moment in the current character's way; unknown moments are ignored. */
  const play = (moment) => {
    const name = who.roles[moment]
    if (name === undefined) return
    wake()
    playShot(name)
  }

  const setState = (state) => {
    const next = state === 'running' ? 'running' : 'idle'
    body.classList.remove('state-idle', 'state-running')
    body.classList.add(`state-${next}`)
    napping = false
    scheduleNap()
    // While held, the pose belongs to the drag.
    if (drag === null) setBase(ROLE_OF_STATE[next])
  }

  /** Clear the stage at once for a character change; the previous character's words are not hers. */
  const silence = () => {
    const showing = open || body.classList.contains('bubbling')
    clearTimeout(bubbleTimer)
    body.classList.remove('bubbling', 'open')
    bubble.classList.add('hidden')
    bubble.textContent = ''
    open = false
    panel.classList.add('hidden')
    input.value = ''
    send.disabled = true
    if (showing) void api?.resize('idle')
  }

  const useCharacter = async (id) => {
    silence()
    who = character(id)
    base = 'idle'
    shot = null
    frame = 0
    napping = false
    await load(who, animsOf(who))
    draw()
    schedule(FRAME_MS)
    scheduleNap()
    scheduleFlourish()
  }

  /* Open grows the window first and adds the class a frame later, or the transition is skipped;
     close plays the exit first and shrinks afterwards. */
  const setOpen = async (next) => {
    if (next === open) return
    open = next
    wake()
    if (open) {
      clearTimeout(bubbleTimer)
      body.classList.remove('bubbling')
      bubble.classList.add('hidden')
      panel.classList.remove('hidden')
      await api?.resize('open')
      requestAnimationFrame(() => { body.classList.add('open'); input.focus() })
    } else {
      body.classList.remove('open')
      input.value = ''
      send.disabled = true
      setTimeout(async () => {
        panel.classList.add('hidden')
        await api?.resize('idle')
      }, 200)
    }
  }

  /* Dragging is drawn here with pointer capture, so the page knows she is held; the main process
     moves the window by deltas. */
  let baseBeforeDrag = 'idle'
  tank.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    tank.setPointerCapture(event.pointerId)
    drag = { x: event.screenX, y: event.screenY, travelled: 0 }
    baseBeforeDrag = base
    body.classList.add('dragging')
    wake()
    setBase('held')
  })
  tank.addEventListener('pointermove', (event) => {
    if (drag === null) return
    const dx = event.screenX - drag.x
    const dy = event.screenY - drag.y
    if (dx === 0 && dy === 0) return
    drag.travelled += Math.abs(dx) + Math.abs(dy)
    drag.x = event.screenX
    drag.y = event.screenY
    api?.moveBy(dx, dy)
  })
  const endDrag = () => {
    if (drag === null) return
    const tapped = drag.travelled <= DRAG_SLOP
    drag = null
    body.classList.remove('dragging')
    // Picked up while napping, she is awake when put down.
    setBase(baseBeforeDrag === 'held' || baseBeforeDrag === 'nap' ? 'idle' : baseBeforeDrag)
    napping = false
    scheduleNap()
    if (tapped) void setOpen(!open)
  }
  tank.addEventListener('pointerup', endDrag)
  tank.addEventListener('pointercancel', endDrag)
  tank.addEventListener('contextmenu', (event) => { event.preventDefault(); api?.menu() })

  input.addEventListener('input', () => { send.disabled = input.value.trim() === '' })
  const submit = async () => {
    const text = input.value.trim()
    if (text === '') return
    input.value = ''
    send.disabled = true
    const result = await api?.ask(text)
    await setOpen(false)
    if (result !== undefined && result.ok === false) {
      play('error')
      setTimeout(() => { void say(result.error || copy.failed, 6000) }, 320)
    }
  }
  send.addEventListener('click', () => { void submit() })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); void submit(); return }
    if (event.key === 'Escape') { event.preventDefault(); void setOpen(false) }
  })
  window.addEventListener('blur', () => { if (open) void setOpen(false) })

  api?.onState((state) => { setState(state) })
  api?.onCharacter((id) => { void useCharacter(id) })
  api?.onPlay((moment) => { play(moment) })
  api?.onSay((text, ms, speech) => { void say(text, ms, speech) })

  // Report ready only after the sprites decode, so the state the main process sends lands on a drawable canvas.
  void useCharacter(new URLSearchParams(location.search).get('who') ?? '').then(() => { api?.ready() })
})()
