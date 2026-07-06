import { gzipSync, brotliCompressSync } from 'node:zlib';
import type { Plugin, Rollup } from 'vite';

// Module-scope accumulators — shared across the main bundle and each worker bundle
// because Vite compiles each as a separate Rollup build (closeBundle fires per build).
let _gz = 0;
let _br = 0;
let _timer: ReturnType<typeof setTimeout> | null = null;

/** Appends a single total gzip + brotli line after the full Vite build output. */
export function bundleSizePlugin(): Plugin {
  return {
    name: 'bundle-size',
    apply: 'build',

    generateBundle(_opts, bundle: Rollup.OutputBundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const src = Buffer.from(chunk.code, 'utf8');
        _gz += gzipSync(src, { level: 9 }).byteLength;
        _br += brotliCompressSync(src).byteLength;
      }
    },

    // Fires once per sub-bundle — debounce so the print happens after all bundles finish
    closeBundle() {
      if (_timer) clearTimeout(_timer);
      _timer = setTimeout(() => {
        const kb = (n: number) => `${(n / 1024).toFixed(2)} kB`;
        console.log(`total JS  gzip ${kb(_gz)}  brotli ${kb(_br)}`);
        _gz = 0;
        _br = 0;
        _timer = null;
      }, 50);
    },
  };
}
