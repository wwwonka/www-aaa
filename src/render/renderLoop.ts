/**
 * Drives a `requestAnimationFrame` loop capped at `targetFps`, calling `onFrame` with the
 * current timestamp once per allowed interval.
 *
 * @param onFrame - Called once per rendered frame with the rAF timestamp.
 * @param targetFps - Frame rate cap; frames arriving faster than this are skipped.
 * @returns A `stop()` function to cancel the loop cleanly (pause, dispose).
 */
export function startRenderLoop(onFrame: (ts: number) => void, targetFps = 60): () => void {
  const frameDuration = 1000 / targetFps
  let lastTime = 0
  let rafId:    number

  const loop = (time: number) => {
    rafId = requestAnimationFrame(loop)

    const delta = time - lastTime
    if (delta < frameDuration) return

    // Correction de drift — évite l'accumulation de retard si un frame est lent
    lastTime = time - (delta % frameDuration)

    onFrame(time)
  }

  rafId = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(rafId)
}
