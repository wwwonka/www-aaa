import type { Plugin, ResolvedConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

function findWebmanifests(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...findWebmanifests(full));
    else if (entry.endsWith('.webmanifest')) results.push(full);
  }
  return results;
}

// Minifies *.webmanifest files in the build output — they're plain JSON so
// JSON.parse/stringify strips all whitespace with zero extra dependencies.
// Files from public/ bypass generateBundle entirely, so we post-process on disk.
export default function minifyManifestPlugin(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'vite-minify-manifest-plugin',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      for (const file of findWebmanifests(outDir)) {
        const minified = JSON.stringify(JSON.parse(readFileSync(file, 'utf8')));
        writeFileSync(file, minified);
      }
    },
  };
}
