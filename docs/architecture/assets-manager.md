# AssetsManager — double-caching IndexedDB + Service Worker

## Objectif

Le jeu doit rester jouable hors-ligne sur iOS même après plusieurs mois sans ouverture, malgré les
purges agressives du cache réseau (Cache Storage limité à ~50 Mo, vidé après quelques semaines
d'inactivité). Stratégie : un **AssetsManager** peuple IndexedDB (stockage persistant, verrouillé via
`navigator.storage.persist()`) au démarrage ; le **Service Worker** sert ensuite ces assets depuis IDB
de façon transparente — Babylon.js / PixiJS continuent de faire de simples `fetch('/...')` sans rien
savoir du cache.

Scope actuel : **assets statiques de `public/`** (textures, modèles, audio, fonts, icônes PWA). L'app
shell (JS/CSS du bundle, via Workbox) est explicitement hors scope, à traiter séparément plus tard.

## Convention de dossiers — `public/app/` et `public/game/`

Les deux seuls namespaces valides à la racine de `public/` :

- **`app/`** — Shell/menu : favicon, icônes PWA, splash screens iOS, `app.webmanifest`
- **`game/`** — Contenu de simulation : `font/`, `model/`, à terme `texture/`, `audio/`

Les sous-dossiers sont nommés **au singulier** (`font/`, pas `fonts/`) — le nom du dossier devient
directement la valeur `type` dans le manifest, zéro logique de pluriel/singulier à coder. Un fichier
posé directement à la racine d'un namespace (ex: `app/app.webmanifest`, pas de sous-dossier) reçoit
le type synthétique `misc`.

Tout fichier qui traîne à la racine de `public/` hors `app/`/`game/` déclenche un avertissement au
build (`vite-asset-manifest-plugin.ts`), pas un échec silencieux.

```
public/
  app/
    app.webmanifest        → type: misc
    icons/favicon.svg       → type: icons
    splash/iPad_landscape.png → type: splash
  game/
    font/fezbox.otf         → type: font
    model/shiny_fish.glb    → type: model (glTF/GLB — @babylonjs/loaders pas encore installé)
```

## `assets.json` — manifest imbriqué

Généré par `_dev/vite-asset-manifest-plugin.ts`, reproduit l'arborescence physique :

```json
{
  "app": {
    "icons": { "favicon.svg": { "hash": "61bc9a16...", "size": 9522 } },
    "misc": { "app.webmanifest": { "hash": "7209fb55...", "size": 1479 } }
  },
  "game": {
    "font": { "fezbox.otf": { "hash": "40841915...", "size": 10316 } }
  }
}
```

- `namespace`/`type` ne sont **jamais répétés en valeur** — ce sont les clés de premier/deuxième niveau.
- `hash` = sha256 tronqué à 16 caractères hex, sans préfixe `sha256:` (détection de changement, pas
  un usage cryptographique).
- `size` gardé volontairement, pas encore consommé — utile dès qu'on voudra streamer le jeu sans écran
  de chargement (façon Wind Waker/Shadow of the Colossus), pour une progression en octets.
- Le JSON est pretty-print (`JSON.stringify(manifest, null, 2)`) — lisibilité en debug priorisée sur
  la taille en octets.

**Dev** : servi en mémoire via un middleware `configureServer` sur `/assets.json` — Vite ne sert
statiquement que les fichiers présents au démarrage du serveur, donc écrire-puis-espérer-que-ça-se-
serve retombe sur le fallback SPA (`index.html`, mauvais content-type, 404 déguisé).
**Build** : écrit sur disque à `buildStart`, copié dans `dist/` par `copyPublicDir`.

## `assetPath()` — source unique de vérité pour les chemins réels

`src/core/assetPath.ts` reconstruit le chemin réel (réseau + clé IDB) depuis `(namespace, type,
filename)` :

```ts
function assetPath(namespace, type, filename) {
  return type === 'misc' ? `${namespace}/${filename}` : `${namespace}/${type}/${filename}`;
}
```

**Ne jamais dupliquer cette logique.** Une version antérieure du code l'inlinait dans deux fichiers
(`AssetsManager.ts` et le SW) ; le cas `misc` divergeait, ce qui faisait fetcher
`/app/misc/app.webmanifest` (inexistant) au lieu de `/app/app.webmanifest` — 404 silencieux retombant
sur le fallback SPA, qui se faisait cacher _à la place_ du vrai manifest. Bug repéré uniquement en
lisant les octets réels du Blob caché, pas par une erreur de type.

## IndexedDB — `AssetsDB`

- DB **`AssetsDB`**, version 3, **store unique `assets`**, clé primaire = `path` complet
  (`game/font/fezbox.otf`).
- Deux index : **`namespace`** (`app`|`game`) et **`type`** (`font`, `icons`, `splash`, `misc`...).
- `CachedAsset` = `{ path, namespace, type, hash, size, cachedAt, blob }`.
- Un seul store plutôt que plusieurs stores par namespace : DevTools → Application → IndexedDB montre
  les records triés par `path`, donc déjà groupés visuellement par namespace puis type, sans avoir
  besoin de naviguer entre plusieurs stores.

```
AssetsDB (v3)
└── assets                          ← store unique, keyPath "path"
    ├── index: namespace
    ├── index: type
    └── records (triés par path) :
        app/app.webmanifest          {namespace:"app", type:"misc", ...}
        app/icons/favicon.svg        {namespace:"app", type:"icons", ...}
        app/splash/iPad_landscape.png {namespace:"app", type:"splash", ...}
        game/font/fezbox.otf         {namespace:"game", type:"font", ...}
```

## `AssetsManager` — l'orchestrateur

`src/core/AssetsManager.ts`, factory `createAssetsManager()` :

```ts
interface AssetsManagerApi {
  warmUp(
    namespace: AssetNamespace | undefined,
    onEvent: (event: AssetLoadEvent) => void,
  ): Promise<void>;
  readonly criticalReady: Promise<void>;
  persist(): Promise<boolean>;
}
```

- `warmUp(namespace?, onEvent)` — `'app'`/`'game'` pour un chargement granulaire (menu d'abord, jeu
  ensuite), omis pour tout charger. Diffuse des events tagués (`start`/`progress`/`complete`/`error`).
  Diffe le manifest contre IDB par hash, télécharge seulement ce qui manque ou a changé.
- `criticalReady: Promise<void>` — résout une fois tous les assets `type === 'font'` en cache, peu
  importe le namespace demandé (toujours inclus dans chaque `warmUp()`). À `await` avant le premier
  rendu de texte pour éviter un flash de texte non stylé (FOUT). Pas encore consommé — pas de
  `TextSprite` construit pour l'instant.
- `persist()` — appelle `navigator.storage.persist()`, déclenché au premier `PLAY` (premier
  engagement utilisateur) dans `AppHost.ts`.

## Service Worker — proxy transparent

`src/app/platform/assetCacheFetch.ts` (volontairement **pas** dans `src/app/platform/pwa/` —
contrairement à `transparentFavicon.ts`, qui est un vrai hack Firefox-only, ceci est un comportement
SW générique, pas spécifique PWA) :

- `loadAssetManifest()` — au SW `activate`, charge `/assets.json`, aplatit en `Set<string>` de chemins
  réels via `assetPath()`. Décision synchrone, pas de round-trip IDB sur chaque `fetch`.
- `handleAssetFetch(event)` — si le chemin de la requête est dans le `Set`, sert depuis IDB
  (`new Response(blob)`) ou fallback réseau. Sinon laisse passer (`return false`), pour s'empiler
  proprement avec d'autres handlers (favicon, futur Workbox).

### Piège de scope SW (a coûté du temps de debug)

`serviceWorker.ts` vit dans `src/app/platform/`, pas à la racine du site. Sans `{ scope: '/' }` passé
à `register()` **et** l'en-tête HTTP `Service-Worker-Allowed: /` sur la réponse du script SW (ajouté à
`crossOriginHeaders` dans `vite.config.ts`), le navigateur borne silencieusement le scope du SW à son
propre dossier — il ne voit alors AUCUNE requête de page. L'enregistrement "réussit" sans erreur
visible ; seul `navigator.serviceWorker.getRegistrations()` le révèle.

## Worker dédié (conditionnel) — pourquoi `AssetsManager` évite le main thread quand possible

`src/core/SystemHost.worker.ts` expose `createAssetsManager()` (via le registre
`src/core/systems/registry.ts`) en multiplexage lazy `get(id)`, derrière `Comlink.expose`.
`AppHost.ts` choisit entre `Comlink.wrap<SystemHostApi>(worker).get('assetsManager')` et un appel
direct à `createAssetsManager()` selon la décision de `SystemAllocator` (`docs/architecture/system-allocator.md`)
— plus un `new Worker()` codé en dur systématique.

**Pourquoi le worker reste préférable quand un slot est disponible** : `warmUp()` est
fire-and-forget dans `AppHost.ts` (jamais `await`), donc il tournait _en même temps_ que le
bootstrap du render worker (transfert OffscreenCanvas, handshake Comlink, compilation de shaders
Babylon/PixiJS) — ses transactions IDB séquentielles et ses comparaisons de hash par asset
consommaient des ticks JS sur le main thread exactement pendant la fenêtre la plus sensible en
latence. L'architecture 100%-Promise de `AssetsManagerApi` rend ce déplacement gratuit dans les
deux sens : même factory, juste exposée via Comlink ou appelée en process selon le mode choisi.

Vérifié : `criticalReady` (propriété `Promise`, pas une méthode) se résout correctement à travers la
frontière Comlink — Comlink awaite les valeurs thenable avant d'envoyer la réponse, donc
`await remote.criticalReady` fonctionne.

## Résolu — placement piloté par SystemAllocator

`assetsManager.worker.ts` (codé en dur, 3ᵉ worker non comptabilisé) a été remplacé par
`src/core/SystemHost.worker.ts` (générique, lazy `get(id)`) piloté par
`src/core/SystemAllocator.ts`. AssetsManager tourne maintenant dans un worker dédié **ou** inline
sur le main thread selon `navigator.hardwareConcurrency` et la règle N-1. Le warm-up off-main-thread
décrit ci-dessous reste vrai quand le mode choisi est `'worker'` — seul le _comment_ il y arrive a
changé. Détail complet : `docs/architecture/system-allocator.md`.

## Renommages d'architecture associés (même session)

- `src/core/AppStateMachine.ts` → `src/core/AppOrchestrator.ts` : `appActor` devient la classe
  `AppOrchestrator` (cycle de vie explicite `startUp()`/`shutDown()`, détient la machine xstate du
  Shell). Tous les usages mis à jour (`AppHost.ts`, `ScreenManager.ts`, `PauseScreen.ts`,
  `RenderManager.ts`, `render.worker.ts`, outils `_dev/`).
- `src/ui/ScreenManager.ts` — inchangé, rôle clarifié : régisseur visuel dans le render worker, réagit
  aux décisions de `AppOrchestrator`, ne les prend pas.
- `GameStateBroadcaster` (futur, pas construit) — diffuseur de l'état de _simulation_ (positions,
  physique) à 60Hz depuis le `SharedArrayBuffer`, Observer pattern, double buffering. Renommé depuis
  `StateBroadcaster` pour ne pas se confondre avec l'état applicatif du Shell géré par
  `AppOrchestrator`. Travail séparé, pas encore planifié.

## Loader unifié — `src/render/assets/`

Vit dans le **render worker** (`src/render/assets/`), pas dans `src/core/` — c'est le seul endroit
avec accès au contexte WebGL/`Scene` Babylon, et `AssetsManager` doit rester agnostique du moteur de
rendu. Consomme les Blobs mis en cache par `AssetsManager`/le Service Worker pour les transformer en
objets GPU (`Mesh` Babylon, `Texture`, `AudioBuffer`, `FontFace`) ou en pistes d'animation.

Hiérarchie de responsabilités (`src/core/` = infra headless, `src/render/` = atelier de
transformation avec accès GPU, `src/app/` = shell/plateforme, seul endroit autorisé à toucher
DOM/Service Worker/WebRTC) :

```
src/render/assets/
├── types.ts                    — IResourceLoader<T> + LoaderContext
├── registry.ts                 — registerLoader(extensions, type, loader), getLoaderEntry, defaultResolve
├── loadAsset.ts                — façade publique + résolution de chemin auto + dédoublonnage
├── registerDefaultLoaders.ts   — importe les loaders ci-dessous pour effet de bord
└── loaders/
    ├── MeshLoader.ts      (.glb, .gltf → 'models'  — @babylonjs/loaders/glTF)
    ├── TextureLoader.ts   (.png, .jpg, .jpeg, .webp → 'texture' — Texture Babylon)
    ├── AudioLoader.ts     (.mp3, .ogg, .wav → 'audio' — decodeAudioData)
    ├── FontLoader.ts      (.otf, .ttf, .woff, .woff2 → 'font' — FontFace)
    └── AnimationLoader.ts (.anim → 'anim' — binaire multi-pistes, voir docs/architecture/animation-pipeline.md)
```

`src/_dev/assets/JsonAnimationLoader.ts` (DEV only, `.json` → `'anim'`) suit exactement le même
contrat mais vit hors de `src/render/assets/` — voir `docs/architecture/animation-pipeline.md`.

### `IResourceLoader<T>` — le contrat

```ts
interface IResourceLoader<T> {
  resolve?(path: string): Promise<Blob>; // défaut : fetch, voir defaultResolve
  parse(blob: Blob, path: string, ctx: LoaderContext): Promise<T>;
}
```

- `resolve` est optionnel et pluggable **par loader** : la stratégie par défaut (`defaultResolve`
  dans `registry.ts`) fait un simple `fetch('/' + path)`, transparent grâce au Service Worker
  (`assetCacheFetch.ts`) qui sert depuis IndexedDB si l'asset y est déjà — jamais de lecture IDB
  directe ici, pour ne pas dupliquer cette logique. Un loader spécifique (ex: une future lib audio
  qui stream au lieu d'attendre tout le Blob) peut redéfinir `resolve` sans toucher au reste.
- `parse` doit renvoyer l'asset **"Game-Ready"** — toute init post-chargement se fait dedans, pas
  après. Ex: `MeshLoader` appelle `mesh.bakeCurrentTransformIntoVertices()` sur chaque mesh importé
  avant de résoudre. Aucun appelant ne doit faire d'étape supplémentaire après `await loadMesh(...)`.

### `registry.ts` — registre ouvert, pas une table figée

`registerLoader(extensions, type, loader)` alimente une `Map<extension, {loader, type}>`. `type` est
le nom du dossier sous `public/<namespace>/` (`'font'`, `'models'`, `'anim'`, ...) — c'est ce qui
permet à `loadAsset()` de reconstruire le chemin complet à partir d'un simple nom de fichier (voir
plus bas). Chaque loader s'auto-enregistre à l'import
(`registerLoader(['glb', 'gltf'], 'models', meshLoader)` en bas de `MeshLoader.ts`). Conséquence :
ajouter un futur format ne demande jamais de modifier `registry.ts` ni `loadAsset.ts` — on écrit le
nouveau fichier dans `loaders/`, il s'enregistre tout seul.

### `loadAsset.ts` — façade, résolution de chemin, dédoublonnage

```ts
loadAsset<T>(filename, ctx?, namespace = 'game'): Promise<T>   // générique, dispatch par extension
loadMesh(filename, scene): Promise<{ meshes }>
loadTexture(filename, scene): Promise<Texture>
loadFont(filename): Promise<FontFace>
loadAudio(filename): Promise<AudioBuffer>
loadAnimation(filename): Promise<AnimationTrackSet>
loadAssets(filenames, scene?): Promise<{...}>     // batch, Promise.all — parallèle, pas séquentiel
```

**Changement de signature (depuis le pipeline d'animation)** : ces fonctions prennent un **nom de
fichier nu** (`loadFont('fezbox.otf')`), pas un chemin déjà construit. `loadAsset()` détecte
l'extension, retrouve le loader et son `type` associé dans le registre, et reconstruit le chemin
complet via `assetPath(namespace, type, filename)` — plus aucun site d'appel ne construit de chemin à
la main. `namespace` vaut `'game'` par défaut (le seul utilisé pour l'instant par le render worker).

- **Normalisation** : le chemin résolu est mis en minuscules avant de servir de clé de cache et avant
  le fetch — évite qu'une casse différente (`Boid.glb` vs `boid.glb`) fasse rater le dédoublonnage.
- **Dédoublonnage** : `Map<path, Promise>` à l'échelle du module (même idiome que
  `manifestPromise ??= ...` dans `AssetsManager.ts`, étendu en `Map` car clé variable). Deux appels
  concurrents sur le même chemin résolu reçoivent la même Promise — pas de re-fetch/re-parse en
  double, pas de race condition. Résolu = caché pour toujours ; rejeté = retiré du cache (pas de
  poison permanent sur un échec transitoire).
- **Logs `console.debug`** `[loadAsset] cache hit/miss: <path>` à chaque appel, pour vérifier en dev
  que le dédoublonnage fonctionne.
- **Piège d'extension à deux segments** : `extensionOf()` prend tout après le **dernier** point —
  `'title-screen.anim.json'` donne `'json'`, pas `'anim.json'`. `'anim'` dans le nom de fichier n'est
  qu'un infixe sémantique, pas ce qui route vers le loader. Conséquence : le loader JSON d'animation
  réserve `'json'` en entier — inoffensif tant qu'aucun autre type d'asset JSON n'existe, à revoir le
  jour où un apparaît (niveau, i18n...).

### Intégration

`src/render/scene/sceneSetup.ts` appelle `loadMesh('shiny_fish.glb', scene)` et fait tourner le mesh
résultant sur `Y`, en remplacement du cube de validation (conservé en commentaire).
`RenderManager._setupScene()` attend désormais la Promise de `sceneSetup()` (devenue `async`).
`src/render/render.worker.ts` importe `registerDefaultLoaders` une fois au démarrage, et attend son
export `devLoadersReady` (voir piège ci-dessous) avant d'initialiser le reste.

Pas de nouvel accessor sur `RenderManager` — `Scene` est passé en paramètre explicite depuis
l'appelant (`sceneSetup.ts` le reçoit déjà), pas récupéré depuis les champs privés du manager.

### Piège résolu — top-level `await` dans un module Worker

`registerDefaultLoaders.ts` important dynamiquement le loader JSON dev-only via un bare
`if (import.meta.env.DEV) { await import(...) }` **au niveau module** faisait planter le démarrage
du render worker en silence (aucune erreur console, aucun log `BJS`, page bloquée). Corrigé en
exportant une Promise (`devLoadersReady`) plutôt que d'utiliser un top-level await — `render.worker.ts`
l'attend explicitement dans `api.init()` avant d'appeler `manager.init(...)`.

## Reste à faire (prochaines sessions)

- Renommer `public/game/models/` → `public/game/mesh/` (cohérence avec `MeshLoader.ts`) — proposé,
  pas encore tranché.
- `FontLoader` renvoie une `FontFace` chargée mais ne l'enregistre pas (`document.fonts.add()`
  n'existe pas dans un worker OffscreenCanvas) — l'enregistrement effectif reste à câbler côté main
  thread (fait ponctuellement par `TitleMenuPanel.create()` pour fezbox, pas généralisé).
- Variante Pixi de `TextureLoader` (`Texture.from`) le jour où un premier asset UI image apparaît.
- Résoudre la question de rigidité worker (AssetsManager en worker dédié ou inline) avant d'ajouter
  d'autres workers dédiés.
- Séquencer `warmUp('app', ...)` puis `warmUp('game', ...)` depuis `AppOrchestrator` une fois qu'un
  écran de chargement existe (paramètre déjà supporté par `warmUp()`, pas encore branché).
- Workbox pour l'app shell (JS/CSS du bundle) — explicitement hors scope jusqu'ici.
- Extension `'json'` réservée entièrement au loader d'animation — revoir si un second type d'asset
  JSON apparaît (voir piège d'extension ci-dessus).
