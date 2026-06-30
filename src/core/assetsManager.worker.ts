import * as Comlink from 'comlink'
import { createAssetsManager } from './AssetsManager'

// Runs warm-up off the main thread — IndexedDB transactions + per-asset fetch/hash-compare were
// competing for main-thread JS ticks exactly during Babylon/PixiJS's own startup window. The
// AssetsManagerApi being 100% Promise-based (see AssetsManager.ts) is what makes this swap free:
// the same factory, just exposed over Comlink instead of called in-process.
Comlink.expose(createAssetsManager())
