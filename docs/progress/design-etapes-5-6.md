# Conception — Étape 5 (joysticks RTC→sim) et Étape 6 (handoff bidirectionnel)

> Document de conception exécutable, rédigé le 2026-07-07 à partir du code réel de la
> branche `feature/title-screen-theatre`. Objectif : qu'un agent n'ayant que `CLAUDE.md`,
> `docs/progress/fable-brief-demo.md` et ce document puisse implémenter les étapes 5 et 6 **sans
> décision architecturale restante**. Le playbook CLAUDE.md §15 s'applique toujours :
> présenter ce design (ou ses ajustements) et attendre le go avant de coder chaque
> sous-étape.
>
> Ancrages code (vérifiés à la rédaction) : `src/input/signaling/PairingChannel.ts`
> (Trystero MQTT, main thread only), `src/sim/simulation.worker.ts` (Comlink
> `init/start/stop/setMoveInput`), `src/sim/GameSim.ts` (pas fixe + accumulateur, vitesses
> **dérivées des positions**), `src/sim/PhysicsEngine.ts` (binding wasm brut hknp),
> `src/core/sab-manager.ts`, `src/shared/constants.ts`.

---

## Partie A — Étape 5 : joysticks controller → sim

### A.1 Vue d'ensemble du pipeline

```
[controller]                                [receiver]
pointer events → JoystickPad ×2
  → stickReducer (moyenne) ─┐
                            ├→ action Trystero `input` (binaire, ~30 Hz)
clavier dev (?dev) ─────────┘        │ main thread (RTC = main only)
                                     ▼
                          writeAxes() → SAB contrôle (Atomics)
                                     ▼
                          sim worker : drain en tête de stepOnce()
```

Une seule écriture par source à la fois (le receiver n'a qu'un controller pairé — démo),
un seul lecteur (sim). Conforme CLAUDE.md §7 : ActionId numériques, axes normalisés
fixed-point Int32, ring buffer Main→Sim, dispatcher séquentiel, latest-wins sur les axes.

### A.2 Côté controller — UI joysticks et réduction

- **`JoystickPad`** (Pixi, dans `GamepadScreen`) : deux zones tactiles gauche/droite,
  chacune rend un stick virtuel (base + nub). Sortie par stick : `(x, z) ∈ [-1,1]²`
  (deadzone radiale ~0.15, clamp à 1). Multi-touch : un `pointerId` capturé par pad
  (`pointerdown` dans la zone → le pad suit ce pointer jusqu'à `up/cancel`).
- **`stickReducer`** (module pur, `src/input/`) : `(left, right) → (dirX, dirZ)`.
  Policy démo : **moyenne des deux sticks actifs** (un seul actif → sa valeur ; aucun →
  zéro), renormalisée si magnitude > 1. C'est une fonction pure séparée du sampler :
  les évolutions futures (split sur sticks divergents, tap-bouton, dash hold&swipe —
  `docs/design/game-design.md`) remplacent le reducer sans toucher ni aux pads ni au transport.
- Échantillonnage : ticker Pixi du controller (ou `setInterval` 33 ms) lit l'état des
  pads et envoie si changement ou toutes les ~500 ms (keepalive). Pas d'envoi par
  pointer-event brut (jusqu'à 120 Hz tactile = gaspillage radio).

### A.3 Transport — action Trystero binaire `input`

Décision : **réutiliser la room Trystero du pairing** (data channel RTC déjà ouvert par
`joinRoom`), pas de `RTCDataChannel` maison. Trystero accepte les payloads binaires
(`Uint8Array`) tels quels — pas de JSON en hot path. Le canal Trystero est reliable+ordered :
suffisant à 30 Hz pour une démo LAN ; le champ `seq` prépare un futur canal unordered.

Payload (little-endian, 6 octets) :

| Offset | Type  | Champ | Encodage                              |
| ------ | ----- | ----- | ------------------------------------- |
| 0      | int16 | dirX  | fixed-point : `round(x * 32767)`      |
| 2      | int16 | dirZ  | idem                                  |
| 4      | uint16| seq   | compteur modulo 65536 (latest-wins)   |

Implémentation : nouvelle action `input` dans `PairingChannel.ts` + méthodes
`sendInput(view: Uint8Array)` / callback `onInput(view, peerId)` dans l'interface
`PairingChannel` (`types.ts`). Le receiver **ignore** les `input` d'un peer ≠ peer pairé.

### A.4 Côté receiver — SAB de contrôle, deux zones

Nouveau buffer dédié (ne pas surcharger le SAB matrices) : `createControlSAB()` dans
`src/core/sab-manager.ts`, layout dans `src/shared/constants.ts` :

```
Int32Array, indices :
CTRL_AXIS_X   = 0   // fixed-point : float * 2^16 (même convention partout)
CTRL_AXIS_Z   = 1
CTRL_RING_WRITE = 2 // tête d'écriture ring (main)
CTRL_RING_READ  = 3 // tête de lecture ring (sim)
CTRL_RING_BASE  = 4 // 64 slots × 2 Int32 : [actionId, argFixedPoint]
```

- **Axes = latest-wins** : `Atomics.store` sur main à chaque `input` reçu (ou tick clavier
  dev) ; `Atomics.load` dans la sim en tête de chaque `stepOnce`. Pas de file : une valeur
  écrasée avant lecture est exactement la policy voulue (CLAUDE.md §7).
- **Ring buffer d'ActionId** : réservé aux actions **discrètes** futures (dash, split) —
  celles-là ne doivent jamais être perdues. Même mécanique que la queue audio prévue
  (`AUDIO_WRITE_HEAD`/`AUDIO_READ_HEAD`) : main incrémente `WRITE` après écriture du slot,
  sim consomme jusqu'à `WRITE` puis avance `READ`. À l'étape 5 le ring est câblé (création,
  drain, constantes `ActionId`) mais aucun producteur — le brancher est trivial ensuite.
- Câblage : `AppHost` crée le SAB au boot et le passe à `simulation.worker.init(controlSab)`
  (nouveau paramètre). La vue `Int32Array` sur SAB passe par clone structuré = mémoire
  partagée, zéro copie (même mécanique que `attachGameBuffers`).

### A.5 Dispatcher sim et unification du chemin dev

Dans `GameSim` : `stepOnce` commence par `drainControl()` — (1) drain séquentiel du ring
(déterministe : ordre d'écriture = ordre de traitement), (2) lecture atomique des axes →
`moveInput`. **Migration recommandée** : le clavier `?dev` écrit lui aussi dans le SAB de
contrôle (via le même `writeAxes()` main-thread) au lieu de Comlink `setMoveInput` —
ainsi le mode dev exerce le pipeline prod de bout en bout, et `setMoveInput` peut être
supprimé de la surface Comlink (une seule voie d'entrée = déterminisme du dispatcher).
Le monolith fait pareil : mêmes constantes, même SAB (in-process), zéro divergence.

### A.6 Cas limites et thread-safety

- **Peer perdu** (`onPeerLost` du peer pairé) : `writeAxes(0, 0)` immédiat — le flock
  s'arrête au lieu de continuer sur la dernière direction.
- **Sortie d'IN_GAME** (pause, handoff) : idem, axes à zéro.
- Thread-safety : un seul écrivain par cellule (main), un seul lecteur (sim), `Atomics`
  sur toutes les cellules partagées → pas de tearing possible sur Int32. Aucune allocation
  en boucle chaude (payload `Uint8Array` réutilisé côté envoi, `DataView` réutilisée côté
  réception).

### A.7 Vérification (critère de l'étape)

Bouger les joysticks sur le phone pairé déplace la sphère/le flock sur le receiver en
temps réel (< ~80 ms perçu en LAN). Lâcher les sticks arrête le flock. Tuer l'onglet
controller → flock s'arrête (peer lost). Mode `?dev` clavier toujours fonctionnel.

---

## Partie B — Étape 6 : handoff bidirectionnel

### B.1 Machine d'états d'autorité (les deux devices)

État par device, orthogonal au rôle (receiver/controller) — c'est **l'autorité** qui
compte (CLAUDE.md §4) :

```
ACTIVE ──(request reçu)──► CAPTURING ──(state envoyé)──► AWAITING_ACK ──(confirmed/returned reçu)──► PASSIVE
  ▲                                                            │
  └──────────────(timeout 5 s OU peer perdu : rollback)◄───────┘

PASSIVE ──(state reçu)──► RESTORING ──(restore OK, sim démarrée)──► ACTIVE (+ envoi confirmed/returned)
```

Règles non négociables :

1. La sim ne steppe **jamais** hors de `ACTIVE` (dans `CAPTURING`/`AWAITING_ACK` elle est
   stoppée, état figé). À aucun instant les deux devices ne sont `ACTIVE` : le sortant
   s'arrête **avant** d'envoyer `state`, l'entrant ne démarre qu'**après** restore réussi.
2. L'autorité n'est cédée qu'à réception de l'ACK (`confirmed`/`returned`). Timeout ou
   `onPeerLost` en `AWAITING_ACK` → rollback : re-`start()` de la sim locale, toast
   d'erreur. (Canal reliable+ordered : un ACK perdu implique peer parti → `onPeerLeave`
   arrive, le rollback est sûr. La reconnexion est hors scope, brief §5.)
3. La scène Babylon locale n'est **jamais détruite** : `PASSIVE` = jeu masqué
   (`_setGameVisible(false)`, écran `PLAYING_ON_PHONE` côté receiver), sim worker vivant,
   buffers SAB attachés. Le retour est instantané.

### B.2 Protocole réseau (actions Trystero, même room)

Messages du brief §6, portés en actions binaires/JSON courts :

| Action     | Payload            | Sens                  | Effet chez le destinataire                       |
| ---------- | ------------------ | --------------------- | ------------------------------------------------ |
| `hoReq`    | `null`             | demandeur → autorité  | ACTIVE → CAPTURING : stop sim, capture, `hoState` |
| `hoState`  | `Uint8Array` (B.3) | autorité → demandeur  | PASSIVE → RESTORING : restore, start, ACK        |
| `hoAck`    | `null`             | demandeur → ex-autorité | AWAITING_ACK → PASSIVE : masque le jeu          |

`hoAck` couvre `confirmed` ET `returned` du brief (même sémantique : « j'ai l'état, je
suis ACTIVE ») — la direction du transfert suffit à distinguer aller/retour, l'UI en
déduit le texte des toasts/écrans. Timeout unique de 5 s sur chaque attente.

Le module vit dans `src/input/signaling/` (extension de `PairingChannel`) + un
`HandoffCoordinator` (main thread, `src/app/`) qui possède la FSM, orchestre sim worker
(Comlink) + render (`_setGameVisible`) + orchestrateur d'écrans (`PLAYING_ON_PHONE`).

### B.3 Snapshot — format binaire versionné

Buffer `ArrayBuffer` ordinaire (transferable via Comlink, envoyable tel quel via
Trystero). Little-endian. Layout (constantes dans `src/shared/constants.ts`) :

```
Header (12 o) : uint16 version=1 | uint16 boidCount | uint16 propCount | uint16 réservé
              | float32 accumulatorMs
Contrôle (20 o) : float32×3 targetPosition | float32×2 moveInput
Par boid (32 o) : pos xyz (f32×3) | vel xyz (f32×3) | heading xz (f32×2)
Par prop (52 o) : pos xyz (f32×3) | rotation quat xyzw (f32×4) | linVel xyz (f32×3)
                | angVel xyz (f32×3)
```

24 boids + 3 props ≈ 12+20+768+156 ≈ **956 octets** — trivial pour un data channel.
`version` + `boidCount`/`propCount` vérifiés au restore : mismatch → rejet + rollback
(les deux builds doivent être identiques ; un garde-fou, pas une compat multi-versions).

### B.4 API sim à ajouter (chemin froid — allocations tolérées)

`PhysicsEngine` (le binding hknp a tout ce qu'il faut, miroir des getters existants) :

- `readQTransform(handle)` → `HP_Body_GetQTransform` (pos + quaternion).
- `readAngularVelocity(handle)` → `HP_Body_GetAngularVelocity`.
- `restoreBody(handle, pos, quat, linVel, angVel)` → `HP_Body_SetQTransform` +
  `HP_Body_SetLinearVelocity` + `HP_Body_SetAngularVelocity`.
- Après un batch de restore : un `HP_World_GetBodyBuffer` de re-synchro (même précaution
  que dans `step()` — le body buffer peut bouger).

`GameSim` :

- `captureSnapshot(): ArrayBuffer` — sérialise selon B.3. Boids : `positions` (déjà lus),
  vitesses **physiques** (`readLinearVelocity`, pas les vitesses dérivées), `headings`.
  Props : `readQTransform` + les deux vélocités. Plus `targetPosition`, `moveInput`,
  `accumulatorMs`.
- `restoreSnapshot(buf: ArrayBuffer): void` — restaure chaque corps, puis **piège
  critique** : `GameSim` dérive les vitesses de `positions - prevPositions` ; après
  restore, poser `prevPositions[i] = positions[i] - vel[i] * (SIM_STEP_MS/1000)` pour que
  la première dérivation redonne exactement la vitesse restaurée (sinon vel=0 au premier
  pas → le steering décroche et le flock « hoquette » — c'est LE saut visuel à éviter).
  Restaurer aussi `headings` (sinon flip d'orientation des meshes), `targetPosition`
  (in-place, c'est un SAB partagé avec le render), `accumulatorMs`, puis `writeMatrices()`
  immédiat pour que le premier frame rendu soit déjà cohérent.

Exposées sur la surface Comlink du worker (`capture(): ArrayBuffer` /
`restore(buf: ArrayBuffer)` — transfert, pas copie).

### B.5 Prérequis structurel : le sim worker vit là où l'autorité peut vivre

Aujourd'hui `AppHost` ne spawne le sim worker que côté receiver. À généraliser : **les
deux rôles** spawnent+`init()` le worker au boot (préchauffe wasm ~identique, le
controller en a besoin dès le premier handoff) ; seul le device `ACTIVE` appelle
`start()`. Le rendu du jeu côté controller réutilise `attachGameBuffers` tel quel — les
SAB sont locaux à chaque device, remplis par SA sim quand il est autorité. Côté UI,
`GamepadScreen` gagne un bouton « PLAY HERE » (déclenche `hoReq`) et le receiver l'écran
`PLAYING_ON_PHONE` (flow CLAUDE.md §10) avec « BRING IT BACK » (déclenche `hoReq` dans
l'autre sens — même code, la FSM est symétrique).

Pendant que le controller est autorité, ses joysticks pilotent **sa** sim locale (le
`stickReducer` écrit dans le SAB de contrôle local au lieu d'envoyer `input` au peer —
switch par état d'autorité dans le sampler). Un seul chemin d'écriture à la fois.

### B.6 Cas limites

- **Peer perdu pendant `AWAITING_ACK`** : rollback (B.1). Pendant `RESTORING` : terminer
  le restore et rester ACTIVE (le jeu vit ici désormais) ; toast « connexion perdue ».
- **`hoReq` croisés** (les deux appuient en même temps) : l'autorité courante gagne —
  un device en transition (`CAPTURING`/`AWAITING_ACK`/`RESTORING`) ignore tout `hoReq`
  entrant ; le demandeur non-autorité dont la requête est ignorée retombe sur timeout.
- **Snapshot avant init Havok locale** : impossible par construction (init au boot des
  deux côtés, B.5) ; assert fail-fast si `restore` arrive avant `init` résolu.
- **Quantization** : tout est déjà Float32 de bout en bout (SAB, Havok) — le snapshot ne
  dégrade rien. Drift : non-problème, autorité unique = une seule sim steppe jamais.

### B.7 Vérification (critère de l'étape)

Transfert receiver→controller puis retour, **sans** : réinit WebGL (aucun log de context),
flash/écran noir, saut de position des boids/props (filmer un prop en cours de poussée :
sa trajectoire doit continuer), état physique incohérent (props qui s'envolent au restore).
Rollback vérifiable : tuer l'onglet controller pendant `AWAITING_ACK` → le receiver
reprend seul en < 6 s.

---

## Partie C — Ordre d'implémentation et pièges hérités

### C.1 Sous-étapes (chacune : critique §15 → go → implémentation → vérif)

1. **5a — SAB de contrôle + dispatcher** (sans réseau) : constantes, `createControlSAB`,
   `drainControl` dans GameSim, migration clavier dev → SAB, suppression `setMoveInput`.
   Vérif : `?dev` clavier fonctionne via le nouveau pipeline (workers ET monolith).
2. **5b — Transport + joysticks** : action `input`, `JoystickPad`, `stickReducer`.
   Vérif : critère A.7 sur deux devices réels.
3. **6a — Snapshot local round-trip** (sans réseau) : API B.4, test en `?dev` — bouton
   dev « capture/restore » : capture, laisser tourner 2 s, restore → l'état revient
   exactement (positions identiques à ε près, pas de hoquet de steering).
4. **6b — Protocole + FSM + UI** : B.1/B.2/B.5. Vérif : critère B.7.

### C.2 Pièges connus à ne pas repayer (hérités des étapes 0-4)

- Heap wasm Havok : toute croissance invalide les vues — relire `HEAPF32` à chaque accès ;
  le body buffer peut être réalloué par un step **et par un batch de Set**.
- Les getters du binding (`HP_Body_Get*`) allouent — chemin froid uniquement (snapshot).
- WebGL refuse les vues sur SAB — toute nouvelle donnée sim→render suit le pattern
  « copie SAB→buffer local » de `BoidsRenderer`.
- Trystero : un reload HMR du receiver régénère le room code — re-scanner le QR en test.
- Toasts ~2,8 s : trop courts pour un screenshot MCP — figer l'état pour vérifier.
- `engine.getDeltaTime()` = 0 en monolith (boucle custom) — mesurer le delta soi-même.
- Détail complet : `docs/onboarding.md` (journal des décisions + war stories).
