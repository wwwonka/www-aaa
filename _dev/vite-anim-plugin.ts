import type { Plugin } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import {
  extractSheetTracks,
  type TheatreOnDiskState,
  type FlatAnimationTrack,
} from '../src/_dev/assets/theatreState';

/**
 * Mirrors `AnimationLoader.ts`'s parse — u16 trackCount, then per track u8 idLength + id UTF-8 +
 * u8 trackType + u16 keyframeCount + float32 pairs.
 *
 * @param tracks - Flattened tracks (see `theatreState.ts#extractSheetTracks`), keyed by `objectKey.propName`.
 * @returns The compact `.anim` binary payload, ready to write to disk.
 */
function encodeAnim(tracks: Record<string, FlatAnimationTrack>): Buffer {
  const entries = Object.entries(tracks);
  const chunks: Buffer[] = [];

  const header = Buffer.alloc(2);
  header.writeUInt16LE(entries.length, 0);
  chunks.push(header);

  for (const [id, track] of entries) {
    const sorted = [...track.keyframes].sort((a, b) => a.position - b.position);
    const idBytes = Buffer.from(id, 'utf-8');

    const trackHeader = Buffer.alloc(1 + idBytes.length + 1 + 2);
    let offset = 0;
    trackHeader.writeUInt8(idBytes.length, offset);
    offset += 1;
    idBytes.copy(trackHeader, offset);
    offset += idBytes.length;
    trackHeader.writeUInt8(0, offset);
    offset += 1; // TrackType.FLOAT
    trackHeader.writeUInt16LE(sorted.length, offset);
    chunks.push(trackHeader);

    const body = Buffer.alloc(sorted.length * 2 * 4);
    sorted.forEach((k, i) => {
      body.writeFloatLE(k.position, i * 8);
      body.writeFloatLE(k.value, i * 8 + 4);
    });
    chunks.push(body);
  }

  return Buffer.concat(chunks);
}

const ANIM_DIR = join('public', 'game', 'anim');

/**
 * Two responsibilities, both DEV/build-only, neither ever touched by `src/render/**`:
 *
 * 1. **Dev middleware** — `POST /__save-anim/:fileName`, called by `src/_dev/@theatre/export.ts`
 *    on Cmd/Ctrl+S. Writes the request body verbatim to `public/game/anim/<fileName>.anim.json` —
 *    the only place Theatre Studio's live state ever reaches disk.
 * 2. **Build-time conversion** — after Vite copies `public/` into the output dir, converts every
 *    `public/game/anim/*.anim.json` into the compact multi-track `.anim` binary
 *    `AnimationLoader.ts` reads in production, and removes the copied `.json` from the output so a
 *    production bundle never ships (or references) animation JSON. Never touches the source
 *    `public/` directory — only `dist/`.
 *
 * @returns A Vite `Plugin` wiring both the dev middleware (`configureServer`) and the build-time
 * conversion (`writeBundle`).
 */
export default function animPlugin(): Plugin {
  return {
    name: 'vite-anim-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/__save-anim\/([\w-]+)$/);
        if (!match || req.method !== 'POST') return next();

        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          mkdirSync(ANIM_DIR, { recursive: true });
          writeFileSync(join(ANIM_DIR, `${match[1]}.anim.json`), Buffer.concat(chunks));
          res.statusCode = 204;
          res.end();
        });
      });
    },
    writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      const destDir = join(outDir, 'game', 'anim');
      if (!existsSync(ANIM_DIR)) return;
      // Existe normalement déjà (Vite y a copié les .json sources avant ce hook), mais ne pas en
      // dépendre — copyPublicDir pourrait être désactivé, ou ce dossier vide côté source.
      mkdirSync(destDir, { recursive: true });

      for (const file of readdirSync(ANIM_DIR)) {
        if (!file.endsWith('.anim.json')) continue;

        const state = JSON.parse(readFileSync(join(ANIM_DIR, file), 'utf-8')) as TheatreOnDiskState;
        const [sheetName] = Object.keys(state.sheetsById);
        if (!sheetName) continue;
        const tracks = extractSheetTracks(state, sheetName);

        const outFile = file.replace(/\.anim\.json$/, '.anim');
        writeFileSync(join(destDir, outFile), encodeAnim(tracks));

        // Copié par Vite depuis public/ avant ce hook — jamais dans le bundle prod.
        const copiedJson = join(destDir, file);
        if (existsSync(copiedJson)) rmSync(copiedJson);
      }
    },
  };
}
