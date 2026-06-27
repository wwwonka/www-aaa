# Babylon.js + PixiJS — Shared WebGL Context Investigation

## Objectif

Faire cohabiter Babylon.js (3D) et PixiJS v8 (2D UI) sur **un seul canvas** via un contexte WebGL partagé dans un OffscreenCanvas worker.

---

## Architecture finale

```
Worker (OffscreenCanvas)
  ├── Babylon.js Engine  ← possède le contexte WebGL2
  ├── PixiJS WebGLRenderer  ← reçoit le gl en option `context:`
  └── _frame() :
        1. scene.render()              ← Babylon rend la 3D
        2. gameUI.render(gl, w, h)     ← PixiJS rend la 2D par-dessus
        3. engine.wipeCaches(true)     ← Babylon vide ses caches JS
```

---

## Ce qui fonctionne

- **Raw WebGL** dessiné après Babylon fonctionne chaque frame
- `(engine as any)._gl` → même objet GL qu'utilise Babylon en interne
- `preserveDrawingBuffer: true` sur l'Engine est nécessaire
- `WebGLRenderer.init({ context: gl })` → PixiJS accepte un GL externe
- PixiJS v8 fonctionne parfaitement dans un OffscreenCanvas worker avec `WebWorkerAdapter`

---

## Le bug exact

**Symptôme** : PixiJS rend correctement sur frame 1 uniquement. À partir de frame 2, son draw call ne produit aucun pixel visible.

**Diagnostic par GL spy** :
- Frame 1 : `attrib[0..3]: enabled=true` → rect rouge visible ✓
- Frame 2 : `attrib[0..3]: enabled=false` → draw call silencieux ✗

---

## Cause racine

Babylon.js appelle `gl.disableVertexAttribArray(i)` (via `wipeCaches(true)` ou son propre rendu) **pendant que le VAO de PixiJS est encore bindé**.

Les vertex attribute enables/disables en WebGL2 font partie de l'état du VAO. Donc ces appels corrompent le VAO de PixiJS directement — la prochaine frame, quand PixiJS rebinde le VAO depuis son cache, ses attributs sont désactivés → aucun fragment généré.

### Pourquoi le frame 1 fonctionne

Pendant le premier rendu PixiJS, le VAO vient d'être créé (attributs activés). Après la frame 1, Babylon corrompt le VAO. Sur frame 2 et au-delà, le VAO a ses attributs désactivés.

### Pourquoi c'est difficile à diagnostiquer

Tous ces éléments sont corrects sur frame 2 :
- Uniforms GPU : `uWorldColorAlpha=[1,1,1,1]` ✓
- Projection matrix ✓
- Blend state : ONE, ONE_MINUS_SRC_ALPHA ✓
- Framebuffer : null (canvas) ✓
- Viewport : 0,0,300,150 ✓
- VAO handle, IBO data, VBO data : identiques ✓
- RASTERIZER_DISCARD, DEPTH_TEST, STENCIL, SCISSOR : tous false ✓

Seul le **vertex attrib enabled state** stocké dans le VAO est corrompu.

---

## Solution

Appeler `gl.bindVertexArray(null)` **après** le rendu PixiJS, avant que Babylon reprenne la main :

```typescript
renderer.render({ container: stage, clear: false })

// Délie le VAO PixiJS — empêche Babylon de corrompre ses vertex attrib enables
// via wipeCaches(true) ou son propre rendu pendant que ce VAO est encore bindé.
gl.bindVertexArray(null)
```

---

## Reset complet requis avant chaque rendu PixiJS

En plus du unbind post-rendu, un reset GL complet est nécessaire avant chaque rendu PixiJS pour neutraliser l'état laissé par Babylon :

```typescript
render(gl: WebGL2RenderingContext, w: number, h: number) {
  // 1. Reset hardware GL state
  gl.disable(gl.SCISSOR_TEST)
  gl.disable(gl.STENCIL_TEST)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.CULL_FACE)
  gl.colorMask(true, true, true, true)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindVertexArray(null)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) // premultiplied alpha (PixiJS v8)
  gl.viewport(0, 0, w, h)

  // 2. Invalider les caches JS PixiJS (pointent vers l'état Babylon)
  const r = renderer as any
  r.shader?.resetState?.()
  r.geometry?.resetState?.()
  r.texture?.resetState?.()
  r.state?.resetState?.()
  r.buffer?.resetState?.()
  r.stencil?.resetState?.()

  renderer.render({ container: stage, clear: false })

  // 3. Délier le VAO pour protéger son état des appels Babylon suivants
  gl.bindVertexArray(null)
}
```

---

## Ce qui a été tenté (et pourquoi ça ne suffisait pas seul)

| Tentative | Résultat |
|-----------|----------|
| `resetState()` per-system sans `bindVertexArray(null)` post-rendu | Attributs désactivés par Babylon, draw silencieux |
| Reset GPU complet sans `bindVertexArray(null)` post-rendu | Idem |
| `renderer.resetState()` officiel | Idem — ne protège pas contre la corruption post-rendu |
| Deux canvas séparés | Rejeté (contrainte architecture) |

---

## Points clés retenus

1. **WebGL2 VAO** : `enableVertexAttribArray` et `disableVertexAttribArray` modifient l'état du VAO **actuellement bindé**, pas un état global. Toujours délier le VAO avant de céder le contexte à un autre renderer.

2. **PixiJS `resetState()` per-system** est nécessaire pour invalider les caches JS (shader `_activeProgram`, geometry `_activeVao`, etc.) qui sinon pointent vers l'état Babylon.

3. **Blend PixiJS v8** = premultiplied alpha = `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`.

4. **`engine.wipeCaches(true)`** doit être appelé APRÈS que le VAO PixiJS est délié.

5. **`(engine as any)._gl`** donne le vrai objet GL Babylon — ne pas appeler `canvas.getContext('webgl2')` une deuxième fois dans un worker.
