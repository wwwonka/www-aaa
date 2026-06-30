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
    "misc":  { "app.webmanifest": { "hash": "7209fb55...", "size": 1479 } }
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
  return type === 'misc' ? `${namespace}/${filename}` : `${namespace}/${type}/${filename}`
}
```
**Ne jamais dupliquer cette logique.** Une version antérieure du code l'inlinait dans deux fichiers
(`AssetsManager.ts` et le SW) ; le cas `misc` divergeait, ce qui faisait fetcher
`/app/misc/app.webmanifest` (inexistant) au lieu de `/app/app.webmanifest` — 404 silencieux retombant
sur le fallback SPA, qui se faisait cacher *à la place* du vrai manifest. Bug repéré uniquement en
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
  warmUp(namespace: AssetNamespace | undefined, onEvent: (event: AssetLoadEvent) => void): Promise<void>
  readonly criticalReady: Promise<void>
  persist(): Promise<boolean>
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
direct à `createAssetsManager()` selon la décision de `SystemAllocator` (`docs/system-allocator.md`)
— plus un `new Worker()` codé en dur systématique.

**Pourquoi le worker reste préférable quand un slot est disponible** : `warmUp()` est
fire-and-forget dans `AppHost.ts` (jamais `await`), donc il tournait *en même temps* que le
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
décrit ci-dessous reste vrai quand le mode choisi est `'worker'` — seul le *comment* il y arrive a
changé. Détail complet : `docs/system-allocator.md`.

## Renommages d'architecture associés (même session)

- `src/core/AppStateMachine.ts` → `src/core/AppOrchestrator.ts` : `appActor` devient la classe
  `AppOrchestrator` (cycle de vie explicite `startUp()`/`shutDown()`, détient la machine xstate du
  Shell). Tous les usages mis à jour (`AppHost.ts`, `ScreenManager.ts`, `PauseScreen.ts`,
  `RenderManager.ts`, `render.worker.ts`, outils `_dev/`).
- `src/ui/ScreenManager.ts` — inchangé, rôle clarifié : régisseur visuel dans le render worker, réagit
  aux décisions de `AppOrchestrator`, ne les prend pas.
- `GameStateBroadcaster` (futur, pas construit) — diffuseur de l'état de *simulation* (positions,
  physique) à 60Hz depuis le `SharedArrayBuffer`, Observer pattern, double buffering. Renommé depuis
  `StateBroadcaster` pour ne pas se confondre avec l'état applicatif du Shell géré par
  `AppOrchestrator`. Travail séparé, pas encore planifié.

## Reste à faire (prochaines sessions)

- Renommer `public/game/models/` → `public/game/model/` (singulier, cohérence de convention).
- Installer `@babylonjs/loaders` pour charger `shiny_fish.glb`.
- Loader unifié côté render worker (`src/render/assets/loadAsset.ts`, pas encore créé) — une fonction
  par type d'asset (`font`/`texture`/`mesh`/`audio`) avec dédoublonnage en vol (`Map<path, Promise>`)
  et chargement parallèle (`Promise.all`), pas séquentiel. Doit vivre dans le render worker, pas dans
  `AssetsManager` (qui reste agnostique du moteur de rendu).
- Résoudre la question de rigidité worker ci-dessus avant d'ajouter d'autres workers dédiés.
- Séquencer `warmUp('app', ...)` puis `warmUp('game', ...)` depuis `AppOrchestrator` une fois qu'un
  écran de chargement existe (paramètre déjà supporté par `warmUp()`, pas encore branché).
- Workbox pour l'app shell (JS/CSS du bundle) — explicitement hors scope jusqu'ici.
