# SystemAllocator — allocation dynamique des systèmes "agiles"

## Contexte

Avant ce doc, le placement des systèmes était codé en dur : un fichier `*.worker.ts` dédié par
système (`assetsManager.worker.ts`), sans tenir compte du nombre de cœurs réellement disponibles.
Sur un appareil à 2 cœurs, ça donnait déjà 3 threads (Main + Render + AssetsManager) sans même
compter Simulation/Audio — exactement le scénario que `docs/worker-adaptive-strategy.md` met en
garde. Voir aussi `docs/threading-model.md` pour la décision "4 threads (pas 5)" qui ne comptait
pas ce worker.

`SystemAllocator` (`src/core/SystemAllocator.ts`) résout ça pour les systèmes "agiles" : il
décide au runtime, selon `navigator.hardwareConcurrency`, s'ils tournent dans un worker dédié ou
inline sur le main thread.

## Classification — Ancres vs Agiles

- **Ancre (non-compressible)** : le Render Worker. Contexte WebGL/OffscreenCanvas lourd, usage
  unique — reste câblé en dur dans `AppHost.ts`, pas géré par `SystemAllocator`. Consomme
  toujours un slot.
- **Agiles (compressibles)** : `AssetsManager` aujourd'hui. Futurs candidats quand ils existeront
  réellement (pas des stubs) : Simulation, Audio, SignalingBus/Network. Ce sont des classes
  portables au sens de `docs/worker-responsibilities.md` ("Règle de conception — Classes
  portables") — aucune référence DOM/`window`/`self`, donc déplaçables entre main thread et
  worker sans réécriture.

## Règle N-1

```
availableSlots = max(1, hardwareConcurrency - 1)   // toujours un cœur libre pour le Main Thread
remainingAfterRenderAnchor = availableSlots - 1     // le Render Worker consomme un slot
```

- `remainingAfterRenderAnchor >= 1` → les systèmes agiles tournent dans un `SystemHost` worker.
- Sinon → ils tournent **inline sur le main thread**. Coût nul puisque les factories
  (`createAssetsManager()`, etc.) sont déjà portables — c'est la même fonction appelée
  directement plutôt qu'exposée via Comlink.

## Le pattern SystemHost — multiplexage lazy via `get(id)`

`src/core/SystemHost.worker.ts` est **générique et statique** : il n'a pas de paramètres à la
construction. Il expose une seule méthode RPC `get(id: SystemId)` qui instancie le système
demandé à la demande (lazy, mis en cache dans une `Map`) depuis le registre de factories
(`src/core/systems/registry.ts`).

Pourquoi pas "une liste de systèmes passée au démarrage du worker" (l'idée initiale) : `AppHost.ts`
crée ses workers via `new Worker(new URL('...worker.ts', import.meta.url))`, un pattern que Vite
analyse statiquement pour le chunking au build. Ajouter des paramètres (ex: query string avec la
liste des systèmes) casserait cette analyse statique. Le `get(id)` lazy évite complètement le
problème : le même fichier worker, sans paramètres, peut héberger n'importe quelle combinaison de
systèmes — la décision de qui demande quoi se fait au runtime, côté appelant.

**Piège Comlink** : l'objet retourné par `get()` traverse la frontière comme _valeur de retour de
RPC_, pas comme racine exposée. Sans l'envelopper dans `Comlink.proxy()`, ses méthodes async
seraient perdues au structured clone au lieu de rester appelables à distance (les fonctions ne
survivent pas à `postMessage` sans ce marquage).

## SystemLifecycle — contrat commun

Tout système hébergeable via `get(id)` doit implémenter `SystemLifecycle`
(`src/core/systems/SystemLifecycle.ts`) :

```ts
interface SystemLifecycle {
  startUp(): Promise<void>;
  shutDown(): Promise<void>;
}
```

Le `SystemHost` ne fait qu'**instancier** physiquement (`get(id)` construit l'objet) — il ne
décide jamais quand un système démarre logiquement. C'est `AppOrchestrator` qui appelle
`startUp()`/`shutDown()` après avoir obtenu l'instance, pour garder le contrôle de l'ordre entre
systèmes. `AssetsManagerApi.startUp()` est aujourd'hui un alias fin sur `warmUp(undefined,
onEvent)` ; `shutDown()` est un no-op documenté (pas de ressource à libérer pour l'instant).

## État actuel (un seul système agile)

Un seul système agile existe réellement aujourd'hui (`AssetsManager` — Simulation/Audio sont des
stubs `console.log`, rien à enregistrer dans `registry.ts` tant qu'ils ne font rien). La décision
de `SystemAllocator` est donc binaire (worker vs inline), pas encore un vrai regroupement
multi-systèmes dans un même host. Le pattern `get(id)` le permet sans changement : ajouter un
2ᵉ système agile, c'est une ligne dans `registry.ts` (`SystemId` + factory) — pas de réécriture
du host ni de l'allocateur.

## Hors scope (pour l'instant)

- Regroupement de plusieurs systèmes agiles dans le même host quand plusieurs slots sont
  disponibles vs un seul (ex: répartir Assets+Simulation vs Network+Audio sur deux hosts séparés
  à 4 cœurs) — pas conçu en détail tant qu'un seul système agile existe.
- Work Stealing / Load Balancing — déjà explicitement hors scope dans
  `docs/worker-adaptive-strategy.md`.
