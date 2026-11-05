let audio: AudioContext | null = null

function context(): AudioContext {
  if (!audio) audio = new AudioContext()
  return audio
}

export function unlockSound(): void {
  const current = context()
  if (current.state === 'suspended') void current.resume()
}

export function playAlert(): void {
  const current = context()
  const ring = () => chime(current)
  if (current.state === 'suspended') {
    void current.resume().then(ring).catch(() => undefined)
    return
  }
  ring()
}

function chime(current: AudioContext): void {
  const start = current.currentTime
  const notes = [523.25, 659.25, 783.99]
  for (const [index, frequency] of notes.entries()) {
    const at = start + index * 0.14
    const tone = current.createOscillator()
    const gain = current.createGain()
    tone.type = 'triangle'
    tone.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.07, at + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55)
    tone.connect(gain)
    gain.connect(current.destination)
    tone.start(at)
    tone.stop(at + 0.58)
  }
}
