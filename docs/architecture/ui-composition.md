# UI — composition, cycle de vie des écrans, interactivité Pixi réelle

## Composition, pas héritage

`src/ui/UIComponent.ts` et `src/ui/UIScreen.ts` sont des classes **abstraites simples**, pas des
`extends Container`/`extends Container` Pixi. Chaque sous-classe possède un `.node` (le vrai `Container`
Pixi ajouté au graphe de scène) plutôt que d'en être un — décision explicite, actée après discussion
sur plusieurs noms possibles (`.view` rejeté au profit de `.node`), appliquée uniformément à tout
`ui/`.

```ts
abstract class UIComponent {
  abstract readonly node: Container;
  onClick?: () => void;
  onHover?: (isOver: boolean) => void;
  get interactive(): boolean;
  set interactive(value: boolean); // eventMode 'static'/'none', cursor, wire les events une seule fois
}
```

Pourquoi composition plutôt qu'héritage : le surface public de chaque composant reste ce qui a du
sens pour lui, au lieu d'hériter toute l'API `Container` (des dizaines de méthodes/props Pixi dont la
plupart ne concernent jamais un `TextLabel` ou un `Button`). `ScreenManager`/les panels font
`layer.addChild(screen.node)` / `this.node.addChild(child.node)` au lieu de traiter le composant
lui-même comme un `Container`.

## `UIComponent` — le socle

- `interactive` (getter/setter) — bascule `node.eventMode`/`node.cursor`, câble
  `pointertap`/`pointerover`/`pointerout` **une seule fois** (`_wired` flag) sur `onClick`/`onHover`.
- `registerAnimatable(id)` (protégé) — voir `docs/architecture/animation-pipeline.md`, inscrit 6 propriétés de
  transform dans `AnimationRegistry`.
- Hit-testing : bounds automatiques de Pixi, pas de `hitArea` explicite pour l'instant (suffisant
  pour du texte/boutons rectangulaires). À réintroduire si des formes/masques custom apparaissent,
  recalculé via un flag dirty après chaque passe de layout Yoga — jamais à la construction, `@pixi/layout`
  ne mesure pas la géométrie de façon synchrone (voir le bug `width: 'auto'` plus bas).

## `UIScreen` — cycle de vie

- Créé une seule fois, attaché en permanence à sa layer (`alpha=0`, `eventMode='none'`) — pas de
  `addChild`/`removeChild` à chaque transition, juste une transition d'opacité.
- `onEnter(duration=250)` — fade in + active le hit-testing. **Pas un hook figé** : une sous-classe
  avec un comportement de reveal différent (ex. `TitleScreen`, dont les sous-composants pilotent leur
  propre opacité via `AnimationRegistry`) override entièrement `onEnter()` sans appeler
  `super.onEnter()` — l'implémentation de base n'est que le tween par défaut, pas une étape
  obligatoire du cycle de vie.
- `onLeave(duration=250)` — désactive le hit-testing immédiatement, puis fade out.
- `update(delta)` — appelé chaque frame par `ScreenManager`, fait avancer le tween en cours.
- `resize(width, height)` — reconstruit `_layoutStyle` et le réapplique, puis délègue à
  `onResize()` (abstrait) pour repositionner les enfants.

**Piège résolu — JSON circulaire au resize** : `node.layout` (l'accesseur `@pixi/layout`) renvoie le
nœud Yoga vivant, pas la config qu'on lui a passée — il porte ses propres refs internes qui se
référencent circulairement. `UIScreen` garde sa propre copie plate (`_layoutStyle`) et ne relit/spread
jamais `node.layout`.

## `ScreenManager` — registre + transitions

```ts
register(state: AppState, screen: UIScreen): void       // addChild une fois, alpha=0
transition(to: AppState): void                           // onLeave du courant, onEnter du suivant
replayCurrentReveal(): void                               // ré-invoque onEnter() du screen affiché
update(delta): void / resize(w, h): void                  // forward à tous les screens enregistrés
```

`replayCurrentReveal()` existe pour un seul usage : `RenderManager.resumeAnimationPlayback()` (sortie
du mode Authoring Theatre.js) doit relancer l'animation du screen actuellement affiché sans passer
par une vraie transition d'état — ré-invoquer `onEnter()` est idempotent (remettre `eventMode` à sa
valeur déjà correcte ne fait rien de mal, relancer `playAnimation()` est sûr) et ne demande à
`RenderManager` de connaître aucun id d'animation.

## `TextLabel` / `Button`

`TextLabel` (`src/ui/components/TextLabel.ts`) — texte simple par défaut, interactif seulement si
`onClick` est fourni. `animatableId` optionnel appelle `this.registerAnimatable(animatableId)`.

**Piège résolu — hauteur/largeur Yoga** : Yoga a besoin d'une hauteur explicite au premier passage de
layout — la mesure intrinsèque du canvas `Text` n'est pas synchrone à ce moment, donc `height: 'auto'`
produit ~0 (lignes qui se chevauchent). La largeur, elle, doit rester `'intrinsic'` (mesurée
dynamiquement) — la traiter aussi comme fixe casse le centrage horizontal du panel parent.

`Button` (`src/ui/components/Button.ts`) — toujours interactif (`this.interactive = true`
inconditionnel), composition via `.node: Container`.

## Interactivité Pixi réelle — les trois causes racines

Avant ce lot, `EventSystem` de Pixi était **totalement inerte** : `renderer.init({context: gl})` (pas
de `view`/canvas) ne pose jamais `domElement`, donc `_addEvents()` no-op silencieusement. Trois
correctifs superposés, trouvés en lisant le source de Pixi (`node_modules/pixi.js/lib/events/EventSystem.js`),
pas par essai-erreur :

1. **`domElement` manquant** — `renderer.events.setTargetElement(canvas)` (`RenderManager.init()`),
   avec le vrai `OffscreenCanvas` du worker. Pixi supporte officiellement `OffscreenCanvas` comme
   `domElement` (confirmé par le commentaire de `setCursor()` : "Has no effect on OffscreenCanvas...").
2. **Module `events/init` absent** — le preset `webworkerAll` de Pixi l'exclut (suppose qu'il n'y a
   pas de DOM). `import 'pixi.js/events'` dans `uiRenderer.ts` l'enregistre explicitement. Un shim
   `globalThis.document = new EventTarget()` minimal est aussi nécessaire :
   `EventSystem._addEvents()` référence `globalThis.document.addEventListener(...)` en dur pour
   pointermove/mousemove, indépendamment du `domElement` fourni.
3. **`rootBoundary.rootTarget` jamais mis à jour** — `EventSystem` le normalise d'ordinaire sur
   `renderer.lastObjectRendered`, lui-même posé par `AbstractRenderer.render()` seulement quand
   `options.target === renderer.view.renderTarget` — une détection qui échoue silencieusement en
   partageant un contexte GL brut avec Babylon. Fixé par une réaffectation explicite de
   `rootTarget = stage` avant chaque dispatch (`RenderManager._listenMessages()`, cas `'pointer'`),
   en plus de l'affectation initiale dans `uiRenderer.ts`.

## Relais de pointeur — main thread → render worker

```
<canvas> (main thread)
  → src/app/events/pointerHandler.ts     — écoute les vrais events DOM, convertit CSS→pixels physiques (× devicePixelRatio)
  → postMessage({type:'pointer', ...})
  → src/render/RenderManager.ts          — réaffirme rootTarget, appelle dispatchPointerEvent
  → src/render/events/pointerBridge.ts   — reconstruit un Event synthétique, dispatch sur la bonne cible
```

`dispatchPointerEvent` route chaque type d'event vers exactement la même cible que
`EventSystem._addEvents()` écoute en interne (vérifié ligne à ligne dans le source Pixi) :
`canvas` pour down/over/out/leave/wheel, `document` (shim) pour move, `self`/`globalThis` pour up.
Fallback vers les noms `mouse*` si `renderer.events.supportsPointerEvents` est faux.

**Pourquoi × devicePixelRatio côté main thread** : avec un `domElement` non connecté au vrai DOM
(notre `OffscreenCanvas`), `mapPositionToPoint` de Pixi saute la conversion CSS→physique habituelle
et attend des pixels physiques directement.

## Vérifié en conditions réelles

Toute la chaîne (relais main thread → dispatch worker → hit-test Pixi → handler `UIComponent`) testée
de bout en bout via des `PointerEvent` synthétiques (chrome-devtools MCP) — `[UIComponent] pointerover`
confirmé sur les bonnes coordonnées, mesurées à partir de la taille physique réelle du canvas plutôt
que supposées.

## Hors scope (décisions actées, pas des oublis)

- **`@pixi/ui`** pour remplacer `Button`/`TextLabel` — évalué, reporté à un lot séparé.
- `hitArea` explicite — reporté tant qu'aucune forme/masque custom n'existe (YAGNI).
