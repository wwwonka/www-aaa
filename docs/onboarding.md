# Passation moteur — penser « console », pas « page web »

> **À toi qui reprends ce moteur.** Je suis le modèle qui a architecturé ce projet
> jusqu'ici, et ce document est mon brain-dump avant de partir. Il est écrit pour que
> tu n'aies jamais besoin de deviner. La règle de partage des rôles est simple :
> **CLAUDE.md dit _quoi_. Les fichiers de `docs/` disent _comment_. Ce document dit
> _pourquoi_ — et comment penser quand la règle ne suffit pas.**
>
> Notre moteur est une console, pas une page web. Tout le reste en découle.

---

## 0. Comment lire ce document

### 0.1 Le contrat de lecture : trois tags, aucune ambiguïté

Trois tags reviennent partout. Ils sont la chose la plus importante de ce document :

- ✅ **LIVRÉ** — le code existe, tourne, et a été vérifié en mode workers.
- 🚧 **STUB** — le fichier existe mais est vide ou factice. Ne t'appuie sur rien de ce
  qu'il promet.
- 🎯 **CIBLE** — intention validée par l'utilisateur, **aucun code n'existe**. Si tu
  lis une description au présent avec ce tag, c'est du design, pas du réel.

Le danger n°1 pour toi est d'halluciner : lire une intention (dans CLAUDE.md, dans le
brief, ici) et croire que le code existe. Ce projet est **très en avance dans sa
vision, partiellement construit dans les faits**. L'état réel vit dans **un fichier et
un seul** : l'encadré « État d'avancement » de `docs/plans/fable-brief-demo.md` (avec sa
section « Backlog hors-brief »). Il est la source de vérité — pas ce document, pas
CLAUDE.md. Ce document ne recopie jamais son contenu : il pointe.

### 0.2 Protocole en cas de doute (dans cet ordre, toujours)

1. **Grep d'abord.** Chaque affirmation ici est ancrée à un chemin + symbole greppable.
   Avant de toucher quoi que ce soit : `grep -rn "leSymbole" src/`. Si le symbole
   n'existe pas, c'est que tu es en train d'halluciner une API — arrête-toi.
2. **Lis le doc pointé.** Chaque section renvoie au fichier de `docs/` qui détaille.
3. **Demande à l'utilisateur.** Le playbook CLAUDE.md §15 l'exige de toute façon :
   critique d'architecture + alternatives + thread-safety, _puis_ attendre le go.

Jamais : inventer une API, « réparer » une décision listée comme délibérée (§2.3, §6),
implémenter sans validation.

### 0.3 Carte de l'état réel

| Domaine                                              | État                | Ancres                                                                |
| ---------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| Boot → Title Screen animé (Theatre)                  | ✅ LIVRÉ            | `src/app/AppHost.ts`, `src/ui/screens/TitleScreen.ts`                 |
| 3 workers (SystemHost, Render, Simulation)           | ✅ LIVRÉ            | spawns dans `src/app/AppHost.ts`                                      |
| Boids + Havok (hknp brut) + SAB sim→render           | ✅ LIVRÉ            | `src/sim/GameSim.ts`, `src/sim/PhysicsEngine.ts`                      |
| Pairing Trystero (QR, presence, START sync)          | ✅ LIVRÉ            | `src/app/pairingHost.ts`, `src/input/signaling/PairingChannel.ts`     |
| Pause blur (capture framebuffer)                     | ✅ LIVRÉ            | `src/render/effects/PauseBlurEffect.ts`                               |
| Allocation adaptative (heuristique cœurs N-1)        | ✅ LIVRÉ (partiel)  | `allocateSystems` dans `src/core/SystemAllocator.ts`                  |
| Audio (worker, agrégateur, queue SAB)                | 🚧 STUB             | `src/audio/audio.worker.ts`, `src/audio/AudioAggregator.ts`           |
| Pipeline input SAB (axes latest-wins + ring ActionId) | ✅ LIVRÉ (5a)      | `src/input/controlChannel.ts`, `drainControl` dans `src/sim/GameSim.ts` |
| Post-process unifié (dont pixelisation)              | 🚧 STUB             | `src/render/postProcess/unifiedPipeline.ts` (vide)                    |
| Tier adaptatif (benchmark boot + `?forceTier`)       | ✅ LIVRÉ (4b)       | `src/app/platform/workerStrategy.ts`, `src/sim/simHost.ts`           |
| Joysticks controller → sim via RTC + ring buffer SAB | 🎯 CIBLE (étape 5)  | conception complète : `docs/plans/design-etapes-5-6.md` (partie A)          |
| Handoff snapshot + ACK + switch d'autorité           | 🎯 CIBLE (étape 6)  | conception complète : `docs/plans/design-etapes-5-6.md` (partie B)          |
| Moves du flock (split, dash chargé), 2 cibles        | 🎯 CIBLE            | `docs/design/game-design.md`                                                 |

### 0.4 La carte des absences — ce qui N'EXISTE PAS

Lis cette liste deux fois. C'est elle qui t'empêchera d'halluciner « par analogie avec
un moteur standard » :

- **Les seuls `Atomics.*` du repo sont dans le pipeline input** (étape 5a :
  `src/input/controlChannel.ts` côté écriture, `drainControl` de `GameSim` côté lecture).
  Les constantes `AUDIO_WRITE_HEAD`/`AUDIO_READ_HEAD` restent des _réservations_ pour la
  future queue audio. Le SAB des matrices boids est volontairement sans Atomics (§2.3).
- **Le ring d'actions n'a aucun producteur.** Le drain tourne à chaque step, mais aucun
  `pushAction` n'est appelé — les `ActionId` (dash, split) attendent les moves du flock.
  Seuls les axes (clavier `?dev` aujourd'hui, joysticks RTC à l'étape 5b) circulent.
- **Aucun audio n'existe.** Pas d'`AudioContext`, pas de resume-on-gesture, pas de
  worker audio spawné.
- **Aucun handoff n'existe.** `PLAYING_ON_PHONE` et `TRANSFER` existent dans la FSM,
  mais aucun snapshot/ACK/bascule d'autorité n'est codé.
- **Aucun test n'existe.** `tests/` est vide. Pas de Playwright, pas de script `test`
  dans `package.json`, malgré CLAUDE.md §16.
- **Aucune gestion de perte de contexte WebGL.** Zéro listener
  `webglcontextlost`/`webglcontextrestored` dans `src/`.
- **Aucune garde runtime `crossOriginIsolated`.** Si les headers COOP/COEP sautent en
  prod, `SharedArrayBuffer` explosera sans message clair.
- **Aucun état `BOOT` dans la FSM xstate.** L'état initial de `AppOrchestrator` est
  `TITLE_SCREEN` ; le « BOOT » de CLAUDE.md §10 est du CSS pur (§1.3).
- **Aucun `navigator.getGamepads` / WebHID.** Le mot « gamepad » dans le code ne
  désigne que des écrans UI.

### 0.5 Glossaire canonique (n'invente pas de synonymes)

- **receiver / controller** — les deux rôles de device. Receiver = desktop qui affiche
  le jeu ; controller = phone qui pilote. Détection : `src/app/platform/ContextManager.ts`.
- **ancre / agile** — vocabulaire de `SystemAllocator` : une _ancre_ est câblée à un
  worker dédié (Render) ; un système _agile_ (AssetsManager) est placé dynamiquement
  worker/inline. Voir `docs/architecture/system-allocator.md`.
- **latest-wins** — politique de lecture du SAB : le consommateur lit l'état le plus
  récent, sans file, sans lock ; rater une frame est acceptable, être en retard non.
- **sphère directrice** — la cible invisible que suit le flock ; `targetPosition` dans
  `src/sim/GameSim.ts`. C'est _elle_ que le joueur déplace, jamais les boids.
- **monolith** — mode debug `?monolith` (DEV only) : tout sur le main thread,
  `src/_dev/inspectors/monolith.ts`. Un menteur utile (§3.2).
- **warmUp** — préchargement des assets orchestré par `AssetsManager`, événements
  `ASSET_*` vers la FSM.
- **`.anim`** — format binaire d'animation compilé au build depuis les JSON Theatre
  (`_dev/vite-anim-plugin.ts`) ; la prod ne connaît que lui (§4.2).

### 0.6 Avertissement nommage

La structure cible de CLAUDE.md §5 (`main/system/sim/render/audio/shared`) n'est **pas**
la structure actuelle. Les dossiers réels : `src/app` (≈ main), `src/core` (≈ system),
`src/sim`, `src/render`, `src/audio`, `src/shared`, plus `src/ui`, `src/input`,
`src/_dev`. `docs/architecture/src-layout.md` documente le réel — mais il mentionne un dossier
`simulation` qui s'appelle en fait `sim`. `docs/architecture/dev-tooling.md` est lui aussi
partiellement périmé : recoupe toujours avec le contenu réel de `src/_dev/`. Quand un
doc et le code divergent, **le code a raison, et tu répares le doc**.

---

## 1. L'intention au-delà du Web (« breaking the browser »)

### 1.1 La méthode de décodage

Chaque demande de l'utilisateur, même banale en apparence, cache une exigence
console-grade. Avant d'implémenter quoi que ce soit, pose-toi ces trois questions dans
l'ordre :

1. **Que verrait le joueur sur une Switch ?** Pas « comment fait-on ça sur le web » —
   comment une console AAA le ferait. C'est la barre.
2. **Quel comportement navigateur par défaut trahirait qu'on est dans une page web ?**
   Flash de police fallback, zoom pinch, scroll élastique, spinner de chargement,
   stutter GC, latence input. Chacun de ces artefacts casse l'illusion. Les trouver,
   c'est trouver le vrai travail.
3. **Quelle API sous-utilisée supprime cette trahison ?** OffscreenCanvas, SAB,
   `document.fonts`, Visual Viewport, structured clone de `WebAssembly.Module`,
   `transferToImageBitmap`… Le navigateur a presque toujours une issue de secours ;
   elle est juste rarement sur le chemin documenté.

### 1.2 Exemples réels — comment des demandes banales sont devenues du console-grade

- **« Un écran titre »** est devenu : pipeline d'animation Theatre.js → binaire
  `.anim`, et surtout `TitleScreen` qui `await` le chargement de la police **avant
  d'exister** — le joueur ne voit jamais un glyphe fallback. ✅
  (`src/ui/screens/TitleScreen.ts`, `docs/architecture/animation-pipeline.md`)
- **« Un écran de pause »** est devenu : capture du framebuffer + blur, via l'unique
  chemin que Pixi v8 accepte en worker : `readPixels → OffscreenCanvas →
transferToImageBitmap → Texture.from()`. ✅ (`src/render/effects/PauseBlurEffect.ts`,
  war stories A.8)
- **« Un boot »** est devenu : du noir CSS (`index.html`, seule exception au
  tout-canvas, CLAUDE.md §10) qui ne se lève que quand le title est _réellement peint_
  dans le canvas. Attention : cette garantie tient aujourd'hui par une **chaîne
  d'`await` implicite** dans `AppHost.start` (init render → screens construits →
  `startUp()`), pas par un flag explicite. Si tu réordonnes ce boot, tu peux la casser
  silencieusement. ✅
- **« Empêcher le zoom »** est devenu : rempart multi-couches — viewport verrouillé,
  `touch-action: none`, guards `gesturestart` Safari, clamp du pinch en log-space,
  verrou de gestes où le drag préempte le pinch. ✅ (`src/app/guards/`, commit `09d937c`)
- **« Un look Super Nintendo »** deviendra : rendre la scène en 3D complète puis la
  **pixeliser en post-process**. 🎯 C'est l'exemple parfait de la pensée console :
  l'esthétique cache la tech (personne ne « voit » du WebGL), et la résolution interne
  réduite est aussi un levier de perf (moins de fragments). Point d'ancrage prévu :
  `src/render/postProcess/unifiedPipeline.ts` (🚧 vide aujourd'hui).

### 1.3 Le canon (non négociable, et pourquoi)

Un seul canvas, un seul contexte WebGL, rendu dans un worker via OffscreenCanvas,
données chaudes en SAB. Ce n'est pas de l'idéologie : chaque élément supprime une
catégorie de trahisons. Le canvas unique supprime le compositing DOM (et ses stutters) ;
le worker de rendu isole la frame du main thread (GC de l'UI, extensions, layout) ; le
SAB supprime la sérialisation sur le chemin chaud. La composition exacte
Babylon-puis-Pixi est dans `docs/architecture/render-stack.md` et l'enquête qui a failli nous coûter
le projet dans `docs/decisions/2026-07-05-shared-webgl-context-investigation.md` — lis-la avant de toucher à
`RenderManager._frame` ou `uiRenderer`.

Garde-fou : l'ordre de priorités de CLAUDE.md §2 arbitre tout. « Architecture
multi-thread robuste » passe avant la DX et la connectivité. Et pas de tech pour la
tech : WebGPU, par exemple, n'entre ici que le jour où une limite _mesurée_ de WebGL2
nous bloque — pas parce que c'est nouveau.

---

## 2. Penser en données (DOD & mémoire)

### 2.1 La question qui décide de tout : qui écrit, qui lit, à quelle fréquence ?

Le navigateur ne te donne ni malloc, ni contrôle du GC. La seule mémoire que tu
contrôles vraiment, ce sont les ArrayBuffers que tu alloues **une fois au boot** et que
tu ne touches plus. Donc chaque flux de données du moteur se classe par sa fréquence :

- **Chaud (chaque frame / chaque step)** → SAB, layout SoA, zéro allocation, zéro
  message. Exemple ✅ : matrices boids, sim → render.
- **Froid (init, transitions, assets)** → Comlink/postMessage, transferables, types
  riches autorisés. Exemples ✅ : `renderApi.init`, `attachGameBuffers`. L'input de jeu,
  lui, est chaud depuis l'étape 5a : SAB de contrôle (`src/input/controlChannel.ts` →
  `drainControl`), plus aucun appel Comlink par input.

Si tu hésites sur le canal, c'est que tu n'as pas répondu à la question de fréquence.

### 2.2 Le layout réel, et pourquoi il a cette forme

`createSAB` (`src/core/sab-manager.ts`) alloue **un** SharedArrayBuffer contigu :
matrices (`BOID_COUNT × SAB_BOID_STRIDE` Float32, stride 16 = matrice 4×4 complète),
puis states (Int32), puis queue audio (256 Int32). Constantes dans
`src/shared/constants.ts` (`SAB_BOID_STRIDE`, `SAB_SECTION`), tuning dans
`src/shared/config.ts` (`BOID_COUNT`, `SIM_STEP_MS`, `PROP_DEFS`).

Deux choses à comprendre :

- **Les sections STATES et AUDIO sont allouées mais inutilisées.** Ce n'est pas du code
  mort, c'est de la _réservation de layout_ : on paie 1 Ko de plus au boot pour ne
  jamais avoir à réallouer/redistribuer le SAB quand la feature arrive. C'est comme ça
  qu'on pense un layout : **la feature de demain a déjà sa place aujourd'hui.**
- Exemple concret à venir : le game design (split du flock en deux groupes,
  `docs/design/game-design.md`) exigera 2 cibles au lieu de l'unique `targetPosition`, plus un
  id de groupe par boid. Le candidat naturel pour l'id de groupe : la section STATES
  déjà réservée. 🎯 Quand tu implémenteras ça, tu étends `constants.ts` et
  `sab-manager.ts` — tu ne crées pas un nouveau buffer ad hoc.

Le transport des vues est gratuit : structured-cloner une TypedArray adossée à un SAB
**partage** la mémoire (c'est le SAB qui est partagé, pas la vue). C'est comme ça que
`simulation.worker.ts` donne ses buffers au render via `attachGameBuffers`, zéro copie.

### 2.3 Single-writer latest-wins, et quand Atomics devient obligatoire

⛔ **Tripwire : si tu t'apprêtes à ajouter des `Atomics.*` sur les matrices boids,
arrête-toi et relis cette section.**

Le SAB sim→render fonctionne **sans aucun Atomics**, par décision délibérée (actée dans
`docs/plans/fable-brief-demo.md`) : la sim est la _seule_ écrivaine, le render est un lecteur
latest-wins qui tolère de lire une frame en cours d'écriture (au pire, un boid a une
matrice d'une demi-frame d'écart pendant 16 ms — invisible). Ajouter des Atomics ici
coûterait de la latence et de la complexité pour résoudre un problème qu'on a
_choisi_ de ne pas avoir.

Atomics devient obligatoire dans exactement deux situations :

1. **Deux écrivains ou plus** sur la même zone.
2. **Un consommateur qui ne doit rien rater** — une file d'événements, pas un état.
   C'est le cas du ring d'actions du SAB de contrôle ✅ (étape 5a — `CTRL_RING_*` dans
   `constants.ts`, drainé par `GameSim` ; les axes du même SAB restent latest-wins,
   c'est l'illustration parfaite de la distinction) et de la queue audio 🎯 (un trigger
   raté = un son manquant, têtes `AUDIO_*` réservées).

État ≠ événements. Les matrices sont de l'état (latest-wins). Les inputs et les sons
sont des événements (ring buffer + Atomics). Grave cette distinction.

### 2.4 Zéro allocation en boucle chaude — les trois modèles du repo

Le GC du navigateur est l'ennemi du 60 FPS constant : tu ne peux pas l'appeler, tu ne
peux que l'affamer. Trois fichiers montrent comment :

- `src/sim/BoidSimulation.ts` — SoA pur (`Float32Array` positions/vitesses/forces),
  voisinage par grille spatiale (`src/sim/spatialPartitioning.ts` — sans elle, le
  steering est O(n²) et n'a aucun avenir), aucune allocation par step.
- `src/sim/PhysicsEngine.ts` — Havok en binding wasm brut (`hknp`), **aucun import
  Babylon** dans `src/sim/` (⛔ tripwire : n'introduis jamais le plugin physique
  Babylon ici — la portabilité worker et la pureté du domaine sim en dépendent, c'est
  une décision actée). Lecture des transforms _directement dans le heap wasm_
  (`HP_World_GetBodyBuffer` + offsets) ; note que les offsets sont relus à chaque accès
  parce qu'un step Havok peut réallouer le heap.
- Côté Babylon, les conventions de `docs/architecture/code-conventions.md` : `addInPlace`,
  `addToRef`, jamais de `new Vector3` dans une boucle.

### 2.5 Les taxes du navigateur : les payer, les mesurer, ne pas les « réparer »

WebGL refuse d'uploader une vue adossée à un SAB. Donc `src/render/scene/BoidsRenderer.ts`
recopie les matrices dans un buffer local à chaque frame avant l'upload thin instances.
C'est une taxe : ~1,5 Ko/frame de memcpy, mesurée, assumée (elle découple aussi le
tearing d'écriture). ⛔ Ne tente pas de la contourner par des bidouilles de vues — c'est
une limite de spec, pas un bug de notre code.

🎯 **Pattern fetch-once multi-worker** (cible validée, à implémenter via
`AssetsManager`) : quand un script ou un wasm est requis par deux workers, il doit être
fetché **une seule fois** → stocké dans l'asset store (IndexedDB, `src/core/assetDb.ts`)
→ chargé dans chaque worker depuis le store. Pour le wasm c'est encore mieux : un
`WebAssembly.Module` compilé est structured-clonable — compile une fois, `postMessage`
le module aux deux workers. Deux fetches réseau du même binaire = un bug.

---

## 3. Vérifier, ne pas mimer

### 3.1 L'interdit fondamental

Le « code qui semble correct » — celui qui compile, que l'IDE colore sans broncher, qui
ressemble aux exemples de la doc — n'a **aucune valeur** ici. Le seul code qui compte
est celui qui survit au pipeline réel : workers + SAB + GL partagé + Safari iOS. Ce
repo en a la preuve par cicatrices :

- Le code Pixi était « correct » ; Babylon corrompait son VAO et tout disparaissait à
  la frame 2 (`docs/decisions/2026-07-05-shared-webgl-context-investigation.md`).
- Le code Comlink était « correct » ; sans `Comlink.proxy()` sur un retour de `get()`,
  les méthodes async disparaissent au structured clone (`docs/architecture/system-allocator.md`).
- Le relais pointer était « correct » ; l'`EventSystem` Pixi classait chaque `pointerup`
  en `pointerupoutside` tant qu'on ne shadowait pas `target` et `composedPath()` vers
  le canvas (`src/render/events/pointerBridge.ts`, commit `a911c26`).
- Deux hooks « corrects » fuyaient : `playAnimation` empilait une entrée par
  `onEnter()` revisité, le frozen layer empilait un sprite par pause rapide (commits
  `19a7c9a`, `236d1e8`). Règle : tout hook ré-entrant (`onEnter`, `activate`,
  `playAnimation`) doit **remplacer** l'état précédent, pas l'empiler.

### 3.2 Le rituel de vérification (checklist, dans l'ordre)

1. **Valide en mode workers, toujours.** Le monolith (`?monolith`) est un menteur
   utile : bon pour itérer, mais son environnement diverge — `engine.getDeltaTime()`
   reste à 0 (boucle custom), `self.fonts` n'existe pas sur le main thread,
   l'EventSystem Pixi s'y comporte autrement (Annexe A, war story n°10).
   CLAUDE.md §13 : la validation finale est en mode workers, sans exception.
2. **Vérifie sur device, le jour même.** Chrome desktop est une hypothèse, Safari iOS
   est le verdict (§5.1). L'outillage existe : `src/_dev/remoteConsole.ts` +
   `src/_dev/workerErrorRelay.ts` relaient console et erreurs de tous les threads en
   `POST /__devlog` → terminal Vite + `_dev/.devlog`. HTTPS local via les certs
   openssl (`_dev/certs/README.md`).
3. **Traque les micro-stutters, pas les moyennes.** 60 FPS de moyenne avec un spike de
   80 ms toutes les 3 s, c'est un jeu cassé. `src/_dev/overlay/DebugOverlay.ts` affiche
   FPS et frame time ; un spike périodique = presque toujours une allocation en boucle
   chaude (profile Memory → Allocation sampling). Et sache lire les aveux du code : le
   clamp anti-spirale de `GameSim` (`MAX_STEPS_PER_UPDATE`, accumulateur lâché avec le
   commentaire « retard irrattrapable : on lâche ») est un airbag, pas une solution —
   s'il se déclenche en jeu normal, tu as un problème de budget frame à régler.
4. **Teste la durée.** Les deux fuites de A.9 étaient invisibles en session courte.
   Une session de 15 minutes avec pauses/reprises et allers-retours d'écrans fait
   partie de la définition de « fini ».

### 3.3 La dette que je te lègue

**Il n'y a aucun test automatisé.** `tests/` est vide, pas de Playwright, malgré
CLAUDE.md §16 qui l'exige. C'est la première brique d'infrastructure à poser : snapshots
visuels déterministes du canvas (title screen, pause) + smoke flow desktop/mobile. Tant
qu'elle n'existe pas, le rituel ci-dessus est entièrement manuel — fais-le à chaque
livraison, sans exception.

---

## 4. DX : la complexité cachée, pas exposée

### 4.1 Le principe

L'abstraction doit coûter **zéro dans la boucle chaude** : types et Comlink aux
frontières (init, orchestration), arrays bruts à l'intérieur (steps, frames). Et
retiens ceci : **la DX est ce qui permet d'itérer et d'ajouter des features au jeu
facilement — elle est aussi importante que la performance, précisément parce qu'elle ne
ship pas.** Chaque heure investie dans l'outillage dev se rembourse en vitesse
d'itération sans coûter un octet au joueur.

### 4.2 Theatre.js : la vision complète (pas juste le title screen)

La cible est de pouvoir **sélectionner et animer n'importe quel objet du jeu** — UI 2D
Pixi comme scène 3D Babylon — avec Theatre.js Studio, en live, sur le jeu qui tourne.
Ce qui rend cette ambition tenable, c'est le contrat de compilation :

- **Dev** : Theatre.js Studio (touche `T`, bridge `src/_dev/@theatre/`), manipulation
  live, export `Cmd+S` → JSON committé.
- **Build** : `_dev/vite-anim-plugin.ts` compile le JSON en binaire `.anim`.
- **Prod** : `src/render/animation/AnimationPlayer.ts` joue le `.anim`. Zéro octet de
  Theatre dans le bundle.

L'unique point de contact entre les deux mondes est `AnimationRegistry`
(`src/render/animation/AnimationRegistry.ts`) : une `Map<string, setter>` plate.
N'importe quel setter est enregistrable via `registerAnimatable(id, setter)` — une
alpha Pixi, une position de mesh Babylon, une intensité de lumière. C'est _ça_ le
mécanisme d'extension : pour rendre un nouvel objet animable, tu enregistres un id.
État : title screen câblé ✅ ; sélection/animation généralisée 2D+3D 🎯.

⛔ **Tripwire : si tu t'apprêtes à `import`er quoi que ce soit de `@theatre/*` dans
`src/render/` (ou tout autre code prod), arrête-toi.** Theatre est un outil de dev.
Le jour où il fuit dans le bundle, on a perdu le contrat qui rend la magie gratuite.
Détail du pipeline : `docs/architecture/animation-pipeline.md`.

### 4.3 La règle de paradigme : DOD en prod, FP autorisé en dev

Le DOD strict (SoA, zéro alloc, pas de classes dans les buffers) s'applique au
**runtime prod**. Dans `_dev/` (outillage build, racine) et `src/_dev/` (outillage
runtime), le **functional programming est autorisé** — compose, mappe, alloue, fais-toi
plaisir : ce code ne ship jamais. La seule frontière sacrée : l'unique point d'entrée
du code dev est `initDev` (`src/_dev/initDev.ts`), appelé dans un bloc conditionnel
`import.meta.env.DEV`. Tant que cette frontière tient, Vite tree-shake tout `src/_dev/`
hors de la prod. ⛔ Du code dev importé en dur depuis `src/` hors garde DEV = fuite dans
le bundle = bug.

### 4.4 La dualité dev/prod comme patron général

Theatre n'est qu'un cas du patron : **un outil riche en dev, un artefact compilé en
prod.** Autres instances : `?monolith` (itération mono-thread, `src/_dev/inspectors/monolith.ts`)
vs validation workers ; `?dev` (controller simulé + clavier WASD → sim via
`src/_dev/inspectors/simControls.ts`) vs vrai pairing ; scénarios Theatre
(`src/_dev/@theatre/scenarios/`) vs `.anim` baked. Query params routés dans
`src/app/platform/queryFlags.ts`, honorés uniquement sous `import.meta.env.DEV` — en
prod, la garde `hasController` de la FSM reste le seul chemin vers `IN_GAME`.

### 4.5 L'outillage que tu dois connaître avant d'en recréer un

- `src/core/SystemHost.worker.ts` + `src/core/systems/registry.ts` — host worker
  générique multiplexé (`get(id)` lazy). Contrainte structurante : Vite analyse
  `new Worker(new URL(...))` **statiquement** — impossible de paramétrer l'URL. D'où le
  host générique plutôt qu'un worker par système.
- `_dev/vite-devlog-plugin.ts` + `vite-open-local-ip-plugin.ts` +
  `vite-worker-no-cache-plugin.ts` — debug device sans Web Inspector, URL Bonjour
  `.local`, anti-304 Safari.
- Certs HTTPS locaux : openssl, pas mkcert (war story A.3), régénération documentée
  dans `_dev/certs/README.md`.
- `vite-plugin-checker` — tsc + eslint en thread séparé pendant le dev.
- Règle des classes portables (`docs/architecture/worker-responsibilities.md`) : le code métier
  destiné à migrer entre threads n'utilise jamais `window`, `document`,
  `self.postMessage`, ni `Atomics.wait()`.

---

## 5. Failure modes : le navigateur va te trahir

### 5.1 La mentalité : Safari iOS est le devkit min-spec

Sur une vraie console, le hardware est garanti. Ici, notre « hardware » est un runtime
hostile qui throttle, purge, et ment. La discipline : **tout ce qui marche sur Chrome
desktop est une hypothèse ; Safari iOS est le verdict.** Chaque nouveau worker, chaque
nouvel asset, chaque header se teste sur device le jour même — les trois war stories
iOS (A.1, A.4, A.5) ont toutes été invisibles sur desktop.

### 5.2 État des défenses (géré / partiel / non géré)

| Failure mode                   | État              | Détail                                                                                                                                  |
| ------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Throttling background (render) | ✅ Géré           | `src/app/events/visibilityHandler.ts` → stop/restart de la boucle dans `RenderManager`                                                  |
| Gel/reprise du temps           | ✅ Géré           | timestep fixe + accumulateur + `MAX_STEPS_PER_UPDATE` + clamp (`src/sim/GameSim.ts`)                                                    |
| Quirks touch iOS               | ✅ Géré           | viewport verrouillé (`index.html`), `touch-action: none`, guards gestes (`src/app/guards/`)                                             |
| COOP/COEP/CORP                 | ✅ Géré (fragile) | headers dans `vite.config.ts` ; le SW ré-injecte CORP sur ses réponses synthétisées — mais **aucune garde runtime** (§0.4)              |
| Throttling background (sim)    | ⚠️ Partiel        | le sim worker n'est **pas** suspendu sur visibilitychange ; son `setTimeout` sera throttlé ≥1 s en background, seul le clamp le protège |
| Perte de contexte WebGL        | ❌ Non géré       | aucun listener ; sur mobile, un onglet en arrière-plan peut perdre le contexte → écran mort au retour                                   |
| AudioContext suspendu          | ❌ Non géré       | l'audio entier est 🚧 ; le resume-on-gesture devra faire partie de son design                                                           |

Les ❌ sont documentés en Annexe C avec leur priorité. Ne les découvre pas en prod.

### 5.3 Les pièges iOS déjà payés (ne les repaie pas)

- **Limite de modules des module workers WebKit** : `@babylonjs/core` non pré-bundlé =
  ~1400 modules ES dans le render worker → worker tué, écran noir, `ErrorEvent` vide.
  Fix : `optimizeDeps.include: ['@babylonjs/core/pure']` dans `vite.config.ts`. Si tu
  ajoutes une grosse dépendance à un worker, pense pre-bundle _d'abord_. (A.1)
- **Les 304 perdent COEP sous Safari** : un worker servi en cache-hit se fait bloquer.
  D'où `_dev/vite-worker-no-cache-plugin.ts`. (A.4)
- **Toute `Response` synthétisée à la main doit porter CORP** sous COEP require-corp —
  le Service Worker qui sert depuis IndexedDB l'apprend à ses dépens sinon. (A.5)

### 5.4 Horloges et cadence

`performance.now()` partout, jamais `Date.now()` pour du gameplay. Le render tourne au
rAF du worker, cappé, avec correction de drift (`delta % frameDuration`,
`src/render/renderLoop.ts`). Le sim n'a pas de rAF fiable en worker → boucle
auto-cadencée `setTimeout(tick, SIM_STEP_MS / 2)` (`src/sim/simulation.worker.ts`),
échantillonnée à double fréquence pour absorber le jitter de `setTimeout`. La règle
générale : **le temps qui gouverne la sim est celui qu'on mesure, jamais celui qu'on
espère** — d'où l'accumulateur, jamais un `dt` supposé constant.

---

## 6. Convaincre sans trahir : communication et tradeoffs

### 6.1 Le rituel (CLAUDE.md §15) n'est pas de la bureaucratie

Avant chaque implémentation : critique d'architecture, alternatives, analyse
thread-safety — puis **attendre la validation de l'utilisateur**. Pourquoi c'est vital
ici plus qu'ailleurs : les trois décisions les plus structurantes de ce moteur
_violent_ l'intuition « web-standard », et aucune n'aurait survécu à un agent qui
implémente d'abord et discute ensuite :

1. **Havok en wasm brut (`hknp`), zéro Babylon dans `src/sim/`** — contre l'intuition
   « utilise le plugin officiel ». Gagné : portabilité worker totale, domaine sim pur.
2. **SAB latest-wins sans Atomics** — contre l'intuition « la mémoire partagée exige
   des locks ». Gagné : latence minimale, code simple, parce qu'on a _prouvé_ qu'un
   seul écrivain suffisait.
3. **Réseau sur le main thread** — contre notre propre dogme worker-first. Perdu au
   change ? Non : `RTCDataChannel` et Gamepad API sont _indisponibles_ en worker
   (limitation navigateur, `docs/architecture/threading-model.md`). S'obstiner aurait été du dogme.

### 6.2 Comment argumenter la performance brute

Quand une feature met en tension « web-standard » et « raw power », l'argumentaire
gagnant a toujours eu la même forme ici :

1. **Pars de la contrainte navigateur _mesurée_** — pas d'opinion. « RTCDataChannel
   n'existe pas en worker » clôt un débat ; « je pense que ce serait plus rapide » n'en
   ouvre même pas un.
2. **Chiffre l'alternative.** Coût en latence, en octets, en risque de stutter.
3. **Montre le fallback de compatibilité.** On n'abandonne jamais les petits devices :
   l'allocation N-1 et le mode inline de `SystemAllocator` existent pour ça. La perf
   brute sur les gros, la dégradation digne sur les petits.
4. **Rappelle l'ordre d'arbitrage** (CLAUDE.md §2). Ce n'est pas ton goût contre celui
   de l'utilisateur : c'est une hiérarchie déjà validée.

### 6.3 Le protocole de passation permanent

Ce document est un instantané ; la passation continue vit dans un fichier que tu dois
tenir à jour **à chaque étape livrée** : l'encadré « État d'avancement » de
`docs/plans/fable-brief-demo.md` (coche, date, prochaine étape, pièges signalés au suivant).
L'ancien `AGENT_BOARD.md` (kanban multi-agents) a été supprimé le 2026-07-07 : il
dupliquait l'encadré du brief et divergeait. Un agent futur — peut-être encore moins
capable que toi — lira ces fichiers comme tu lis celui-ci. Écris-y ce que tu aurais
voulu qu'on t'écrive : les pièges, pas les victoires.

---

## Annexe A — War stories (symptôme → cause → leçon)

1. **Écran noir iOS, `ErrorEvent` vide** (`4e48851`) → barrel `@babylonjs/core/pure`
   non pré-bundlé = ~1400 modules ES, au-delà d'une limite des module workers WebKit →
   _pre-bundle les gros barrels destinés aux workers (`optimizeDeps.include`)._
2. **Pixi invisible dès la frame 2** (`docs/decisions/2026-07-05-shared-webgl-context-investigation.md`) →
   Babylon `disableVertexAttribArray` corrompt le VAO Pixi encore bindé →
   _`gl.bindVertexArray(null)` + `resetState()` en cédant un GL partagé
   (`src/render/layers/uiRenderer.ts`)._
3. **Safari refuse le TLS local, Chrome l'accepte** (`8cced1a`) → `vite-plugin-mkcert`
   copiait un nom de compte macOS en Unicode invalide dans le subject de la CA →
   _certs openssl propres, CA trustée sur macOS et simulateur (`_dev/certs/`)._
4. **Worker bloqué COEP après un premier chargement OK** → Safari sert un 304 sans les
   headers → _`_dev/vite-worker-no-cache-plugin.ts` force des 200 avec headers._
5. **Assets IDB bloqués sous COEP, écran noir** → `new Response()` synthétisée sans
   CORP → _toute réponse fabriquée doit porter `Cross-Origin-Resource-Policy`._
6. **Aucun clic Pixi ne marche en mode workers** (`a911c26`) → `pointerup` dispatché
   sur `globalThis` a `target = self` → classé `pointerupoutside` → _shadow `target` +
   `composedPath()` vers le canvas (`src/render/events/pointerBridge.ts`)._
7. **Upload thin instances impossible depuis le SAB** → WebGL refuse les vues adossées
   à un SAB → _copie locale par frame (`src/render/scene/BoidsRenderer.ts`) ; taxe
   assumée._
8. **Capture framebuffer impossible en worker Pixi v8** (`8ad3178` → `88b35df` →
   `c8eef71`) → Pixi n'accepte ni `WebGLTexture` brut ni `Uint8Array` → _chemin
   `readPixels → OffscreenCanvas → transferToImageBitmap → Texture.from()`._
9. **Fuites lentes en session longue** (`19a7c9a`, `236d1e8`) → hooks ré-entrants qui
   empilent au lieu de remplacer → _tout `onEnter`/`activate`/`playAnimation` doit être
   idempotent._
10. **Le monolith ment** → `getDeltaTime()` = 0 hors
    `runRenderLoop`, `self.fonts` absent du main thread, EventSystem divergent →
    _le monolith sert à itérer, jamais à valider._
11. **HMR WebSocket mort sur `.local`** (`9f5795e`) → les navigateurs résolvent mal
    mDNS pour les WebSockets → _`hmr: { host: 'localhost', protocol: 'wss' }`._

## Annexe B — Fichiers clés

| Fichier                                                               | Rôle                                                                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/main.ts`                                                         | entrée ; route `?monolith` (DEV) vs `AppHost`, bloc `initDev` unique                          |
| `src/app/AppHost.ts`                                                  | orchestration boot, spawn des 3 workers, transfert OffscreenCanvas                            |
| `src/core/AppOrchestrator.ts`                                         | FSM xstate (TITLE_SCREEN/PAIRING_MODE/IN_GAME/PAUSED/PLAYING_ON_PHONE), garde `hasController` |
| `src/core/SystemAllocator.ts`                                         | placement worker/inline des systèmes agiles (règle N-1)                                       |
| `src/core/SystemHost.worker.ts` + `src/core/systems/registry.ts`      | host worker générique, `get(id)` lazy + `Comlink.proxy`                                       |
| `src/core/AssetsManager.ts` + `src/core/assetDb.ts`                   | assets, IndexedDB, warmUp                                                                     |
| `src/core/sab-manager.ts`                                             | `createSAB` — layout contigu matrices+states+audio                                            |
| `src/shared/constants.ts`                                             | layout SAB (`SAB_BOID_STRIDE`, `SAB_SECTION`, têtes audio)                                    |
| `src/shared/config.ts`                                                | tuning (`BOID_COUNT`, `SIM_STEP_MS`, `PROP_DEFS`)                                             |
| `src/sim/simulation.worker.ts`                                        | worker sim receiver-only, boucle auto-cadencée, `init(controlSab)`                            |
| `src/input/controlChannel.ts`                                         | écrivains main-thread du SAB de contrôle (`writeAxes`, `pushAction`)                          |
| `src/sim/GameSim.ts`                                                  | composition sim, accumulateur, écriture matrices, `targetPosition`                            |
| `src/sim/BoidSimulation.ts` + `src/sim/spatialPartitioning.ts`        | steering SoA + grille spatiale                                                                |
| `src/sim/PhysicsEngine.ts`                                            | Havok wasm brut (hknp), lecture heap zéro-alloc                                               |
| `src/render/RenderManager.ts`                                         | composition Babylon+Pixi, `_frame`, `wipeCaches`                                              |
| `src/render/layers/uiRenderer.ts`                                     | Pixi sur le GL de Babylon, `bindVertexArray(null)`                                            |
| `src/render/renderLoop.ts`                                            | rAF worker cappé + correction de drift                                                        |
| `src/render/scene/gameScene.ts` + `src/render/scene/BoidsRenderer.ts` | lecture SAB → thin instances                                                                  |
| `src/render/effects/PauseBlurEffect.ts`                               | pause : capture framebuffer + blur                                                            |
| `src/render/postProcess/unifiedPipeline.ts`                           | 🚧 placeholder du post-process unifié (future pixelisation)                                   |
| `src/render/events/pointerBridge.ts`                                  | ré-injection des pointer events dans l'EventSystem Pixi                                       |
| `src/render/animation/AnimationPlayer.ts` + `AnimationRegistry.ts`    | lecture `.anim` + registre id→setter                                                          |
| `src/app/pairingHost.ts` + `src/input/signaling/PairingChannel.ts`    | pairing Trystero/MQTT main-thread                                                             |
| `src/app/platform/queryFlags.ts` + `ContextManager.ts`                | query params + détection de rôle                                                              |
| `src/_dev/initDev.ts`                                                 | unique point d'entrée du monde dev (FP autorisé derrière)                                     |
| `src/audio/audio.worker.ts`, `src/input/InputProxy.ts`                | 🚧 stubs — voir carte des absences                                                            |

## Annexe C — Dettes ouvertes, par priorité

1. **Tests Playwright** (CLAUDE.md §16, rien n'existe) — snapshots canvas déterministes
   (title, pause) + smoke flows desktop/mobile. Prérequis à toute montée en complexité.
2. **Garde `crossOriginIsolated` au boot** — fail-fast avec message clair si les
   headers manquent, au lieu d'un crash SAB cryptique en prod.
3. **Perte de contexte WebGL** — listeners + stratégie de restauration (recréer
   engine/scène, recharger le screen courant).
4. **Suspension du sim en background** — brancher `visibilityHandler` sur
   `simulation.worker` (le clamp n'est qu'un airbag).
5. **Audio** — worker réel, queue SAB + Atomics (têtes déjà réservées),
   resume-on-gesture dès la conception.
6. **Étapes du brief** : 5b (joysticks + transport RTC), 6 (handoff snapshot/ACK).
   Détail : `docs/plans/fable-brief-demo.md` ; conception déjà faite : `docs/plans/design-etapes-5-6.md`.
7. **Calibrage des seuils de tier** (`workerStrategy.ts`) — 30k/12k ops/ms posés sur un
   desktop 2026 ; à mesurer sur iPhone/Android réels (le log boot `[AppHost] tier=` est là
   pour ça).

---

_Dernier mot. Tu vas avoir la tentation, devant chaque difficulté, de « faire simple
comme sur le web ». Résiste. La simplicité web — DOM, allocations libres, un seul
thread, tout au main — est exactement ce que ce projet a quitté, et chaque cicatrice
de l'Annexe A est le prix déjà payé pour en sortir. Le navigateur ne t'aidera pas à
faire une console. Il tolère qu'on en fasse une, à condition de ne jamais relâcher.
Bonne route._
