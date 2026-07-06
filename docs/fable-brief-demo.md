# Brief — Démo jouable pour Fable

## 0. Contexte et lecture préalable

Ce projet est une console web type Nintendo Switch : un `receiver` (desktop) affiche le
jeu, un `controller` (phone) le pilote via WebRTC, et le jeu peut être "amené" d'un
device à l'autre (handoff bidirectionnel, autorité unique du game state).

**Avant de commencer, lis dans l'ordre** :
1. `/CLAUDE.md` — règles d'arbitrage non-négociables du projet.
2. `/CLAUDE_backup.md` — détails additionnels (rendu single-canvas, playbook de validation).
3. `docs/threading-model.md`, `docs/worker-adaptive-strategy.md`, `docs/system-allocator.md`,
   `docs/code-conventions.md`, `docs/architecture-src.md` — état de l'architecture actuelle.
4. Ce document — le brief de la démo à construire.

**Playbook obligatoire (CLAUDE.md §15) : pour chaque étape ci-dessous, commence par une
critique d'architecture + alternatives + analyse thread-safety, attends la validation de
l'utilisateur, PUIS implémente.** Ne saute pas cette étape même si le brief te semble déjà
précis — le brief cadre le *quoi*, pas les détails d'implémentation, qui restent à ta charge
et à valider.

---

## 1. Objectif de la démo

Un flow complet et jouable : `TITLE_SCREEN` → pairing WebRTC receiver↔controller →
contrôle en temps réel d'une simulation de boids ayant un poids physique (Havok) qui
poussent des objets dans une scène → transfert bidirectionnel du jeu entre les deux
devices sans coupure perçue. Le tout avec un multithreading qui s'adapte dynamiquement
aux capacités du device, un asset loading/caching hybride service worker + IndexedDB, et
une expérience de développement (HMR, debug layer) qui reste utilisable malgré
l'architecture en workers.

Ce n'est **pas** un jeu fini — c'est une démo technique qui prouve que toutes les briques
du projet fonctionnent ensemble.

---

## 2. État existant du repo — à réutiliser, ne pas recréer

| Brique | Fichier(s) | État |
|---|---|---|
| Render worker + Comlink | `src/render/render.worker.ts`, `src/render/RenderManager.ts` | Fonctionnel |
| Orchestration boot | `src/app/AppHost.ts`, `src/app/AppOrchestrator.ts` (xstate) | Fonctionnel |
| Allocation adaptative (règle N-1) | `src/core/SystemAllocator.ts` | Fonctionnel, mais seulement câblé à `AssetsManager` |
| Détection de rôle device | `src/app/ContextManager.ts` (`detectAppContext()`) | Fonctionnel (UA/touch/localStorage), pas de override query-param |
| Cache assets SW + IndexedDB | `src/app/platform/serviceWorker.ts`, `serviceWorkerRegister.ts`, `assetCacheFetch.ts`, `src/core/assetDb.ts`, `src/core/AssetsManager.ts` | Fonctionnel — manifeste diffé par hash, `public/assets.json` déjà généré |
| Layout SAB | `src/core/sab-manager.ts`, `src/shared/constants.ts` (`SAB_BOID_STRIDE`, `SAB_SECTION.{MATRICES,STATES,AUDIO}`) | Défini, **non câblé** dans les workers |
| Constantes boids | `src/shared/config.ts` (`BOID_COUNT`, vitesses, séparation/alignement/cohésion) | Définies, à ajuster pour 10-30 boids |
| Mode dev mono-thread | `src/_dev/inspectors/monolith.ts`, activé via `?monolith` dans `src/main.ts` | Fonctionnel |

**À construire — actuellement vide, stub, ou absent :**

| Brique | Fichier(s) | État |
|---|---|---|
| Pairing WebRTC/Trystero | `src/input/signaling/` | Dossier vide ; dépendance `@trystero-p2p/mqtt` installée mais inutilisée |
| Protocole de connexion | — | Aucun code |
| Simulation worker | `src/sim/simulation.worker.ts` (renommé depuis `simulation/`) | Stub `console.log` |
| Audio worker | `src/audio/audio.worker.ts` | Stub `console.log` |
| Boids | `src/sim/BoidSimulation.ts`, `spatialPartitioning.ts` | Fichiers vides |
| Physique | `src/sim/PhysicsEngine.ts` | Fichier vide ; `@babylonjs/havok` absent de `package.json` |
| Rendu boids | `src/render/scene/BoidsRenderer.ts` | Stub commentaire seulement (thin instances depuis SAB) |
| Routing query params | `src/main.ts` | Seul `?monolith` existe ; `?controller`/`?receiver`/`?dev` absents |
| Micro-benchmark boot | — | Seule une heuristique statique `hardwareConcurrency` existe (`SystemAllocator.ts`) |

**Note de structure de dossiers** : le repo utilise `src/app`, `src/core`, `src/render`,
`src/audio`, `src/shared`, `src/input`, `src/ui` comme noms réels. **Renomme
`src/simulation/` en `src/sim/`** (seul changement demandé) — ne crée PAS de `src/main/`
ou `src/system/` parallèles même si un ancien CLAUDE.md les mentionne : ce sont les noms
`app`/`core` qui font foi.

---

## 3. Contraintes non-négociables (CLAUDE.md / CLAUDE_backup.md)

- **Ownership d'état** : le device actif est l'unique autorité du game state. Transfert =
  snapshot complet + ACK + switch d'autorité. Jamais de double autorité.
- **Rendu** : un seul canvas, un seul contexte WebGL. Babylon rend d'abord, Pixi ensuite
  (`clearBeforeRender: false`). Après le rendu Pixi : `gl.bindVertexArray(null)` puis
  `engine.wipeCaches(true)`. Ordre des couches : Babylon → `gameContainer` →
  `shellContainer` (+ overlays RTC/toasts).
- **Hot loop** : SAB uniquement. `postMessage`/transferables réservés à l'init et aux
  assets froids. DOD/SoA pour les buffers. `Atomics` pour index/flags partagés. Pas de
  classes/objets dans le buffer de commandes.
- **WebRTC est main-thread only** : `RTCDataChannel` et l'API Gamepad ne peuvent pas
  tourner en Worker (contrainte documentée dans `docs/threading-model.md`) — le pairing et
  la réception des inputs réseau vivent sur le thread principal.
- **Input pipeline** (CLAUDE.md §7) : input physique → `ActionId` numérique, axes
  normalisés `[-1,1]` (ou fixed-point `Int32` pour atomics), ring buffer SAB Main→Sim,
  dispatcher séquentiel et déterministe en simulation, policy axes latest-wins.
- **Conventions de code** (`docs/code-conventions.md`, déjà en vigueur — respecte-les
  telles quelles) : PascalCase classes, camelCase fonctions/variables/fichiers utilitaires,
  suffixe `.worker.ts`, `SCREAMING_SNAKE_CASE` constantes, pas de classes utilitaires
  statiques (module ES6 à la place), commentaires uniquement sur le *pourquoi*.
- **En plus des conventions ci-dessus, applique le style Babylon.js** (le codebase est
  Babylon-first, ces règles s'ajoutent sans contredire `code-conventions.md`) :
  - Pas de préfixe `I` sur les interfaces (`PeerConnection`, pas `IPeerConnection`).
  - Champs privés/protégés préfixés `_` (`this._engine`).
  - **Zéro allocation dans les boucles de rendu/sim** : jamais `position.add(velocity)`
    dans une boucle — utilise `position.addInPlace(velocity)` ou
    `position.addToRef(velocity, target)`.
  - Privilégier les builders/méthodes statiques de création (`MeshBuilder.CreateGround`)
    plutôt que des constructeurs surchargés d'options.
  - TypeScript strict : jamais `any`, `Nullable<T>` si type inconnu, `readonly` explicite
    sur les propriétés immuables, type de retour explicite sur les méthodes publiques.
- **Fichiers `<= 300` lignes** (exception justifiée), pas de singleton global, composition
  plutôt qu'héritage, vocabulaire métier explicite (`Boid`, `InputBuffer`, `TargetMatrix`),
  unités dans les noms si utile (`rotationRad`, `deltaMs`), paramètres `readonly` par défaut.

---

## 4. Specs gameplay

- **Boids** : 10 à 30, simulés avec Havok complet (poids réel, collisions précises).
- **Objets poussables** : masse Havok strictement supérieure à celle des boids — la
  poussée doit être visible mais pas triviale (pas d'objets qui s'envolent au moindre
  contact).
- **Scène** : petite scène thématique avec assets custom (pas juste des primitives) —
  exerce réellement le pipeline manifest → service worker → IndexedDB déjà en place. Le
  modèle `game.models.shiny_fish.glb` est déjà référencé dans `public/assets.json` et sert
  de bon cas de test pour le warm-up/caching (fichier volumineux, ~19MB).
- **Contrôle** : 2 joysticks sur le controller, **moyennés** pour donner une direction
  unique à la sphère invisible qui pilote les boids. Les comportements de divergence
  (joysticks pointant dans des directions différentes) et de tap-sans-direction
  (détection d'un joystick touché sans mouvement, utilisé comme bouton) sont une évolution
  **future** — ne les implémente pas, mais garde l'architecture input assez découplée
  pour les ajouter plus tard sans tout réécrire.

---

## 5. Pairing WebRTC — scénario 1 uniquement (pas de reconnexion)

Un prototype existant (`github.com/wwwonka/webrtc-switch-system`, projet séparé, à lire
pour référence de flow uniquement — pas de CSS, pas de code à copier tel quel) a déjà
validé le pattern de pairing suivant, à porter dans `src/input/signaling/` :

- `joinRoom` via Trystero (`@trystero-p2p/mqtt`, déjà une dépendance du projet actuel).
- Trois actions réseau : `presence` (annonce de rôle), `connect` (demande de connexion),
  `paired` (confirmation).
- Discovery filtrée par rôle : un `controller` ne voit que les `receiver` et vice-versa
  (`targetRole`).
- **Scénario couvert : les deux devices sur le même réseau, avec accès internet.** C'est
  le seul scénario à gérer dans cette démo.

**Explicitement hors scope pour cette démo** (à ne pas implémenter) :
- Configuration TURN server.
- ICE restart automatique en cas de coupure réseau.
- Fallback QR code (signaling sans internet).
- Toute logique de reconnexion, snapshot périodique de session, ou détection de réseau
  captif/offline.

Ces sujets existent dans le prototype de référence (`docs/connectivity.md` de ce
prototype, scénarios 2 à 8) mais sont **hors scope ici** — ne les porte pas, même
partiellement.

---

## 6. Handoff bidirectionnel

Protocole de référence, adapté du même prototype (`src/controller/transfer.js` /
`src/receiver/transfer.js`), à reprendre pour la structure des messages — mais le contenu
de `state` doit être étendu pour couvrir l'état complet boids+physique, pas seulement des
positions de joueurs :

```
controller → receiver  { request: true }     demande l'état actuel
receiver   → controller { state }             snapshot complet, scène mise en pause
controller → receiver  { confirmed: true }    scène prête côté controller, affichée
controller → receiver  { state }              renvoie le jeu (au retour)
receiver   → controller { returned: true }    confirme la réception, ferme l'overlay
```

`state` doit inclure : positions/vélocités de chaque boid (depuis le SAB), état de la
sphère invisible de contrôle, et position/rotation/vélocité de chaque objet Havok
poussé.

**Invariant à respecter** : la scène Babylon locale n'est **jamais détruite** pendant un
transfert — elle est masquée et mise en pause, puis réaffichée. Ça évite un re-init WebGL
et un retour visuel à la position de repos initiale. Ceci découle directement de la règle
CLAUDE.md : autorité unique + snapshot complet + ACK + switch (pas de double autorité
pendant la transition).

---

## 7. Multithreading adaptatif

- Complète l'heuristique de `docs/worker-adaptive-strategy.md` (2 cœurs → 1 worker
  unifié ; 4 cœurs → 2 workers ; >4 cœurs → 3 workers dédiés), actuellement documentée
  mais pas implémentée pour sim/render/audio (seul `AssetsManager` est câblé à
  `SystemAllocator`).
- Ajoute un **micro-benchmark boot réel** (CLAUDE.md §3 l'exige, actuellement absent — il
  n'y a qu'un check statique `navigator.hardwareConcurrency`) : un test synthétique court
  (**< 50ms**, pour ne pas pénaliser le temps de boot) — par exemple un batch fixe
  d'opérations Vector3/Matrix (`addInPlace`/`multiplyToRef`) mesuré en ops/ms — combiné à
  `hardwareConcurrency` comme heuristique de secours si le résultat est ambigu.
- Ajoute un query param **`?forceTier=low`** qui court-circuite la détection et force le
  mode dégradé, pour pouvoir tester le fallback de façon déterministe sans dépendre d'un
  vrai device faible.

---

## 8. Asset loading & DX

- Le pipeline SW + IndexedDB existant (`src/core/AssetsManager.ts`, `assetDb.ts`,
  `serviceWorker.ts`) doit être exercé réellement par les assets de la scène thématique —
  pas juste laissé en place sans être utilisé.
- **`initDevMode()`** : point d'entrée unique appelé depuis `main.ts` (sous `?dev` ou en
  DEV) qui greffe le debug layer + inspecteur Babylon + tout outil de simulation
  visuelle. Aucun code dev ne doit fuiter ailleurs dans `src/` — tout vit sous `src/_dev/`
  (déjà en place, voir `src/_dev/inspectors/monolith.ts` comme référence de style).
- HMR Vite doit rester fonctionnel malgré l'architecture worker.

---

## 9. Critères de succès

- 60 fps sur desktop, 30 fps+ sur phone, y compris en mode `?forceTier=low`.
- Handoff sans coupure perçue (pas de flash, pas de saut de position, état physique
  cohérent après transfert).
- Reload = cache hit instantané (zéro re-téléchargement réseau visible dans l'onglet
  Network des devtools).
- Code conforme aux conventions de la section 3 (naming, zéro allocation en boucle chaude,
  pas de `any`, fichiers `<=300` lignes).

---

## 10. Hors scope pour ce brief (ne pas construire)

- Plugin Vite d'automatisation iOS Simulator (ouverture PWA/Safari automatique) — sujet
  distinct, traité séparément plus tard.
- Agent de documentation externe (ex. via GitHub Copilot) qui générerait une page web de
  suivi — idée notée mais hors scope de cette démo.
- Tout ce qui est listé comme hors scope en section 5 (TURN, ICE restart, QR fallback,
  reconnexion).

---

## 11. Stratégie de livraison — étapes séquencées, PAS un seul dump de code

Livre par étapes numérotées, chacune vérifiable/lançable avant de passer à la suivante.
Après chaque étape : un message de résumé (ce qui a été fait, risques restants, ce qu'il
reste à faire) puis **attendre un go explicite de l'utilisateur** avant de continuer —
conforme au playbook CLAUDE.md §15.

**Étape 0 — Outillage qualité** (préalable, avant tout code fonctionnel)
- Configurer ESLint + Prettier alignés sur les conventions de la section 3 (actuellement
  absents du repo).
- Vérification : le lint/format tourne sans erreur sur le code existant.

**Étape 1 — Routing & rôles**
- Ajouter `?controller` / `?receiver` / `?dev` dans `src/main.ts` (seul `?monolith`
  existe).
- Vérification : chaque query param affiche le bon mode/écran isolément.

**Étape 2 — Pairing WebRTC (scénario 1 uniquement)**
- Porter le flow de la section 5 dans `src/input/signaling/`.
- Vérification : deux devices sur le même réseau se découvrent et atteignent l'état
  "paired".

**Étape 3 — Boids + Havok en local (sans réseau)**
- Implémenter `BoidSimulation.ts`, `PhysicsEngine.ts`, `spatialPartitioning.ts` ; ajouter
  `@babylonjs/havok` ; construire la scène thématique avec 10-30 boids + objets
  poussables plus lourds.
- Valider d'abord en mode `?monolith` (un seul thread) avant de répartir dans les
  workers.
- Vérification : les boids poussent visiblement les objets, comportement physique
  crédible.

**Étape 4 — Répartition multithread + SAB**
- Câbler réellement `src/core/sab-manager.ts` / `src/shared/constants.ts` entre
  `src/sim/simulation.worker.ts` et `render.worker.ts`.
- Implémenter l'heuristique adaptative + micro-benchmark boot + `?forceTier=low` (section
  7).
- Vérification : `?forceTier=low` force le mode dégradé et reste jouable ; le mode
  nominal utilise les workers dédiés.

**Étape 5 — Input controller → sim via WebRTC**
- Les joysticks (moyennés) du controller pairé pilotent la sphère invisible côté
  receiver, via le pairing de l'étape 2 et le pipeline input de CLAUDE.md §7.
- Vérification : bouger les joysticks sur le controller déplace la sphère/boids sur le
  receiver en temps réel.

**Étape 6 — Handoff bidirectionnel**
- Implémenter le protocole de la section 6, adapté à l'état boids+Havok+SAB.
- Vérification : transfert controller↔receiver sans réinit WebGL, sans saut visuel, état
  physique cohérent après transfert.

**Étape 7 — Asset caching réel + DX finale**
- Exercer réellement le pipeline SW+IndexedDB avec les assets de la scène (section 8).
- Implémenter `initDevMode()` (section 8).
- Vérification : cache hit instantané au reload, HMR fonctionnel malgré les workers.
