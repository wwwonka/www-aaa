// Entry point – Audio Worker (Web Audio API, spatial sound, event aggregator)
// Consumes audio trigger events from SharedArrayBuffer via Atomics
self.onmessage = (e) => {
  console.log('[audio.worker] received:', e.data);
};
