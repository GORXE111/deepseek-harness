'use strict'

/**
 * Spoken alerts through the system's `speechSynthesis`: offline, keyless, nothing extra to ship.
 * The voice is whatever the system has; the youngest-sounding Chinese voice is preferred. On
 * Windows `pitch` has no audible effect (SAPI moves the median pitch by a few Hz across its whole
 * range), so only the rate is adjustable.
 */
;(() => {
  /** Chinese voice preference, youngest and lightest first. */
  const PREFERRED = ['yaoyao', 'xiaoxiao', 'xiaoyi', 'huihui', 'kangkang']

  /** Longest text read aloud; longer would cover the next alert. */
  const MAX_CHARS = 120

  /**
   * Pick a voice: the user's choice when installed, else a preferred Chinese voice.
   * @param {Array<{name: string, lang: string}>} voices - available voices.
   * @param {string} preferred - the configured voice name; empty picks automatically.
   * @returns the voice, or null when no Chinese voice is installed.
   */
  function pickVoice(voices, preferred = '') {
    const list = Array.isArray(voices) ? voices : []
    if (preferred !== '') {
      const exact = list.find((voice) => voice && voice.name === preferred)
      if (exact !== undefined) return exact
      // An uninstalled choice falls through to automatic selection rather than silence.
    }
    const chinese = list.filter((voice) => voice && typeof voice.lang === 'string' && voice.lang.toLowerCase().startsWith('zh'))
    if (chinese.length === 0) return null
    for (const key of PREFERRED) {
      const hit = chinese.find((voice) => String(voice.name).toLowerCase().includes(key))
      if (hit !== undefined) return hit
    }
    return chinese[0]
  }

  /**
   * Rewrite bubble text for speaking: list bullets and line breaks become enumeration commas,
   * tildes go, and long text is cut at a punctuation mark.
   * @param {string} text - bubble text.
   * @returns {string} speakable text, empty when nothing is worth reading.
   */
  function speakable(text, maxChars = MAX_CHARS) {
    if (typeof text !== 'string') return ''
    const lines = text.split('\n').map((line) => line.replace(/^[·・•\-*]\s*/u, '').trim()).filter((line) => line !== '')
    const flat = lines.join('、').replace(/[~～]+/gu, '').replace(/\s{2,}/gu, ' ').trim()
    if (flat.length <= maxChars) return flat
    const cut = flat.slice(0, maxChars)
    const stop = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('。'), cut.lastIndexOf('、'))
    return stop > maxChars * 0.6 ? cut.slice(0, stop) : cut
  }

  /**
   * Speak one bubble, cancelling the previous one: an alert matters now, and a queue would
   * end up reading minutes-old news.
   * @param {string} text - bubble text.
   * @param {{name: string, rate: number, volume: number}} options - speech parameters.
   * @returns {boolean} whether speaking started.
   */
  function speak(text, options) {
    const synth = globalThis.speechSynthesis
    if (synth === undefined) return false
    const line = speakable(text)
    if (line === '') return false
    const voice = pickVoice(synth.getVoices(), String(options.name ?? ''))
    if (voice === null) return false
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(line)
    utterance.voice = voice
    utterance.lang = voice.lang
    utterance.rate = Math.min(2, Math.max(0.5, Number(options.rate) || 1.1))
    utterance.volume = Math.min(1, Math.max(0, Number(options.volume ?? 0.85)))
    synth.speak(utterance)
    return true
  }

  globalThis.__dshVoice = { pickVoice, speakable, speak, PREFERRED, MAX_CHARS }
})()
