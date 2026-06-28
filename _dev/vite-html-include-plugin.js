import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const INCLUDE_RE = /<!--\s*@include\s+(\S+)\s*-->/g

// Lets index.html pull meta-tag blocks out of separate files (see
// src/app/meta/), purely so the head doesn't read as one giant wall of
// tags. Resolved at both `pnpm dev` (transformIndexHtml runs on every
// request) and `pnpm build` (runs once before bundling) — no runtime cost,
// the included HTML is plain text spliced in before any other Vite HTML
// processing (asset URL rewriting, ViteMinifyPlugin) ever sees it. Includes
// are resolved relative to index.html's own directory, recursively, so a
// fragment can itself `@include` another fragment.
function resolveIncludes(html, fromDir) {
  return html.replace(INCLUDE_RE, (_match, relPath) => {
    const filePath = path.join(fromDir, relPath)
    const fragment = readFileSync(filePath, 'utf-8')
    return resolveIncludes(fragment, path.dirname(filePath))
  })
}

export default function htmlIncludePlugin() {
  return {
    name: 'vite-html-include-plugin',
    transformIndexHtml(html) {
      return resolveIncludes(html, ROOT)
    },
  }
}
