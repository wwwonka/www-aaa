// Entry point – Simulation Worker (Boids AI + Physics + FSM)
// Runs on a dedicated thread; communicates via SharedArrayBuffer + Atomics
self.onmessage = (e) => {
  console.log('[simulation.worker] received:', e.data)
}
