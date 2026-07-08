# Pipeline d'animation — Theatre.js (dev) → binaire (prod)

## Objectif

Animer des écrans UI (fade-in du titre, etc.) en les auteurant visuellement dans Theatre.js Studio
plutôt qu'à la main en code, tout en gardant `src/render/**` (le render worker, qui tourne aussi bien
en dev qu'en prod) totalement ignorant de Theatre.js — ni import statique, ni vocabulaire ("Theatre",
"Authoring") qui fuiterait dans son code.

Deux formats du même contenu :

- **Dev** — JSON natif Theatre.js, committé, lisible/diffable, ré-exportable depuis Studio.
- **Prod** — binaire compact `.anim`, généré au build, jamais committé.

## Vue d'ensemble

```
Theatre Studio (main thread, DEV only)
    │  Cmd/Ctrl+S
    ▼
src/_dev/@theatre/export.ts ── POST /__save-anim/:fileName ──► public/game/anim/<name>.anim.json
    │                                                                    │
    │                                                      pnpm build ─ _dev/vite-anim-plugin.ts
    │                                                                    ▼
    │                                                       dist/game/anim/<name>.anim (binaire)
    ▼
AnimationPlayer.playAnimation(id)  ──►  AnimationRegistry.applyAnimatedValue(trackId, value)
    ▲                                            ▲
    │ prod: AnimationLoader.ts (.anim)           │ dev: AnimationRegistry aussi alimenté en direct
    │ dev:  JsonAnimationLoader.ts (.anim.json)  │ par le bridge Theatre pendant qu'on scrub dans Studio
```

`AnimationRegistry` (`src/render/animation/AnimationRegistry.ts`) est le seul point de contact entre
tout ça et l'UI : une `Map<string, (value: number) => void>` plate. `UIComponent.registerAnimatable(id)`
y inscrit 6 setters génériques (voir plus bas) ; `applyAnimatedValue(id, value)` les invoque. Ni ce
fichier ni son appelant `AnimationPlayer` ne savent si la valeur vient d'un fichier rejoué ou de
Studio en train d'être scrubé en direct — c'est le même sink dans les deux cas.

## Un fichier = un écran, plusieurs pistes dedans

Convention : `public/game/anim/<fileName>.anim.json`, où `fileName` correspond à
`AnimationScenario.fileName` (`src/_dev/@theatre/scenarios/types.ts`) — indépendant du `sheetName`
Theatre pour éviter toute logique de conversion de casse. Le fichier titre est
`public/game/anim/title-screen.anim.json` (sheet Theatre `'TitleScreen'`).

Un fichier contient **toutes** les pistes keyframées de l'écran, pas une par propriété — évite une
explosion de petits fichiers quand plusieurs sous-composants (`title`, `connectController`, ...)
animent chacun plusieurs propriétés (opacity, x, y, scale, rotation).

### Format JSON (dev) — la vraie forme sur-disque de Theatre.js

Pas un format inventé : c'est exactement ce que `studio.createContentOfSaveFile(projectId)` renvoie,
sliced à un seul sheet. Validé contre un export réel (`public/game/anim/title-screen.anim.json`).

```ts
interface TheatreOnDiskState {
  sheetsById: Record<
    string,
    {
      staticOverrides?: { byObject: Record<string, Record<string, number>> };
      sequence?: {
        tracksByObject: Record<
          string,
          {
            trackIdByPropPath: Record<string, string>; // '["opacity"]' -> trackId
            trackData: Record<
              string,
              {
                type: 'BasicKeyframedTrack';
                keyframes: { position: number; value: number }[]; // position en SECONDES
              }
            >;
          }
        >;
      };
    }
  >;
}
```

`src/_dev/assets/theatreState.ts#extractSheetTracks(state, sheetName)` aplatit ça en
`{ "objectKey.propName": track }`, en résolvant `trackIdByPropPath` (`JSON.parse('["opacity"]')[0]`).
**`staticOverrides` n'est jamais lu** — une valeur ajustée dans Studio sans jamais être keyframée
n'est pas "animée", elle ne sort ni dans le JSON exporté ni dans le binaire. Cette fonction est
partagée entre `src/_dev/assets/JsonAnimationLoader.ts` (lecture, dev runtime) et
`_dev/vite-anim-plugin.ts` (conversion, build-time Node) — un seul endroit connaît ce schéma.

### Format binaire (prod) — `.anim`

`src/render/assets/loaders/AnimationLoader.ts` :

```
u16 trackCount
pour chaque piste :
  u8  idLength
  idLength bytes   — id UTF-8, ex. "title.opacity"
  u8  trackType    — 0 = FLOAT (seul implémenté ; VECTOR3/QUATERNION réservés, YAGNI)
  u16 keyframeCount
  keyframeCount × (f32 time, f32 value)   — paires séquentielles
```

Séquentiel plutôt qu'à offsets fixes : la longueur d'id variable empêcherait un alignement 4 octets
stable pour lire les floats comme une vue `Float32Array` sur le buffer — le loader les lit un par un
via `DataView.getFloat32`. L'encodeur (`_dev/vite-anim-plugin.ts#encodeAnim`) et le décodeur
(`AnimationLoader.ts`) doivent rester en phase octet pour octet — les deux sont commentés en miroir
l'un de l'autre.

## `AnimationPlayer` — lecture

`src/render/animation/AnimationPlayer.ts` :

```ts
playAnimation(id: string): Promise<void>       // charge <id>.anim.json (dev) ou <id>.anim (prod), démarre la lecture
updateAnimations(delta: number): void          // appelé chaque frame par RenderManager._frame
pausePlayback(): void                          // stoppe tout, vide la liste playing
resumePlayback(): void                         // réautorise playAnimation — ne relance rien tout seul
```

- `import.meta.env.DEV` choisit l'extension au build — Vite élimine la branche morte, donc un bundle
  prod ne référence jamais `.anim.json`.
- Les positions Theatre sont en **secondes** ; `delta` (passé par `RenderManager`) est en
  **millisecondes** — `updateAnimations` fait `elapsed += delta / 1000`.
- `playAnimation(id)` **remplace** toute lecture en cours pour ce même `id` plutôt que d'empiler
  (bug corrigé après revue : sans ça, chaque ré-invocation de `TitleScreen.onEnter()` — revisite
  d'écran, sortie du mode Authoring via `ScreenManager.replayCurrentReveal()` — empilait une entrée
  `playing` de plus, jamais nettoyée hors d'un `pausePlayback()` explicite).
- Un fichier manquant (écran jamais encore exporté) loggue `console.info` et ne fait rien — pas une
  erreur bloquante, l'écran reste simplement à ses valeurs par défaut.

## Déclenchement — l'écran, pas `RenderManager`

`TitleScreen.onEnter()` (`src/ui/screens/TitleScreen.ts`) appelle directement
`playAnimation('title-screen')` — override complet, pas de `super.onEnter()` (ce screen ne veut pas
le tween fade par défaut d'`UIScreen`, chaque sous-composant pilote sa propre opacité via
`AnimationRegistry`). `RenderManager` ne connaît **aucun** id d'animation ; il se contente de
`this._screenManager?.transition(state)`.

`ScreenManager.replayCurrentReveal()` ré-invoque simplement `onEnter()` du screen actuellement
affiché — utilisé par `RenderManager.resumeAnimationPlayback()` pour relancer l'animation courante
après une sortie du mode Authoring, sans passer par une vraie transition d'état.

## Propriétés animables — un socle générique, pas du câblage au cas par cas

`UIComponent.registerAnimatable(id)` (`src/ui/UIComponent.ts`) inscrit **6 propriétés de transform**
d'un coup dans `AnimationRegistry` : `opacity`, `x`, `y`, `scaleX`, `scaleY`, `rotation`. N'importe
quel composant qui appelle ça (ex. `TextLabel` avec un `animatableId`) les rend toutes disponibles
dans Theatre Studio sans qu'il faille deviner à l'avance laquelle sera effectivement keyframée.

Limite connue, pas encore vérifiée en usage réel : `x`/`y` sont normalement pilotés par le layout
Yoga (`@pixi/layout`) pour un enfant d'un conteneur flex — les animer directement peut entrer en
conflit avec le repositionnement automatique. À valider dans le viewport le jour où un scénario les
utilise réellement ; si conflit, limiter x/y aux nœuds hors flux de layout (le screen racine, pas un
enfant de `TitleMenuPanel`).

Le bridge Theatre (`src/_dev/@theatre/bridge/index.ts`) expose le même socle par défaut
(`DEFAULT_TRANSFORM_PROPS`) à chaque objet Theatre créé — un scénario n'a plus besoin de déclarer
`defaults`/`ranges` du tout pour avoir les 6 props prêtes à scruber ; il ne les override que s'il
veut des bornes différentes.

## Scénarios — descripteur déclaratif

`src/_dev/@theatre/scenarios/types.ts` :

```ts
interface AnimationObject {
  objectKey: string; // clé Theatre — devient le préfixe d'id, ex. 'title'
  defaults?: Record<string, number>; // override du socle par défaut, optionnel
  ranges?: Partial<Record<string, readonly [number, number]>>;
}
interface AnimationScenario {
  sheetName: string; // sheet Theatre, ex. 'TitleScreen'
  fileName: string; // base de fichier sous public/game/anim/, ex. 'title-screen'
  triggerState: AppState; // état de AppOrchestrator qui joue la séquence
  objects: AnimationObject[];
}
```

`src/_dev/@theatre/scenarios/TitleScreen.dev.ts` en est l'unique instance aujourd'hui — deux objets
(`title`, `connectController`), aucun `defaults`/`ranges` explicite.

## Bridge Theatre — main thread, DEV only

`src/_dev/@theatre/bridge/index.ts#setupTheatreBridge(orchestrator, applyAnimatedValue)` :

1. `initStudio()` (`src/_dev/@theatre/studio/index.ts`) — idempotent.
2. Pour chaque scénario : `project.sheet(scenario.sheetName)`, puis un objet Theatre par
   `AnimationObject` avec le socle de props fusionné.
3. `theatreObject.onValuesChange(values => ...)` pousse chaque prop modifiée vers
   `applyAnimatedValue('${objectKey}.${prop}', value)` — Comlink jusqu'au render worker.
4. S'abonne à `orchestrator` : joue la séquence du scénario dont `triggerState` matche l'état courant.

**Piège Theatre résolu** : `sheet.object(id, config)` jette si rappelé avec un config
numériquement identique mais un objet différent — Theatre ne peut pas distinguer ça d'une
reconfiguration volontaire. `src/_dev/initDev.ts` garde un flag `bridgeInitialized` : le bridge n'est
jamais réinstancié après le premier toggle 'T', seulement `restoreStudio()`/`hideStudio()`.

**Piège de double-wrap du default export** : `@theatre/studio`'s CJS build, réexporté deux fois par
l'interop ESM de Vite — `(studioModule as unknown as {default:{default:...}}).default.default` est la
vraie instance, pas `.default`. Confirmé en marchant l'objet à l'exécution.

## Export Cmd/Ctrl+S — Studio → disque

Avant ce lot, rien n'écrivait jamais l'état de Studio sur disque — seul un export placé à la main
existait. `src/_dev/DevKeyboardShortcutListener.ts` écoute Cmd/Ctrl+S (`e.preventDefault()`, actif
seulement si le mode Authoring est ouvert) → `src/_dev/@theatre/export.ts#exportScenarios()` :

1. `getSaveFileContent('GameUI')` (`src/_dev/@theatre/studio/index.ts`, wrapper autour de
   `studio.createContentOfSaveFile`) — état complet du projet, tous sheets confondus.
2. Pour **chaque scénario déclaré** (pas de tentative de deviner lequel est "actif" — tous sont
   petits et bon marché à écrire), slice `sheetsById[scenario.sheetName]`, POST vers
   `/__save-anim/${scenario.fileName}`.
3. Le middleware dev (`_dev/vite-anim-plugin.ts#configureServer`) écrit le corps de la requête tel
   quel dans `public/game/anim/<fileName>.anim.json`.

## `_dev/vite-anim-plugin.ts` — deux responsabilités, ni l'une ni l'autre en prod

1. **Middleware dev** — `POST /__save-anim/:fileName`, décrit ci-dessus.
2. **Conversion build-time** (`writeBundle`, après que Vite ait copié `public/` dans `dist/`) —
   chaque `public/game/anim/*.anim.json` devient un `.anim` binaire dans `dist/game/anim/`, et le
   `.json` copié est supprimé de la sortie : un bundle prod ne référence jamais de JSON d'animation.
   Ne touche jamais la source `public/`, seulement `dist/`.

## Conventions Git

`.gitignore` exclut `public/game/anim/*.anim` — seuls les `.json` (dev, lisibles, diffables) sont
committés ; le binaire est régénéré à chaque `pnpm build`.

## Vérifié en conditions réelles

- Chargement + lecture du vrai fichier `public/game/anim/title-screen.anim.json` dans le navigateur
  (pas un fichier de test) — fade-in correct des deux pistes.
- `pnpm build` → `dist/game/anim/title-screen.anim`, décodé par script Python, deux pistes avec les
  bonnes valeurs, aucune trace de `staticOverrides`.
- Middleware `POST /__save-anim/:fileName` testé directement (`curl`), écrit et nettoyé correctement.

## Non vérifié — à faire au prochain passage

- Cmd+S déclenché depuis l'UI réelle de Studio (testé uniquement via `curl` direct sur le
  middleware, pas via l'interaction clavier + Studio ouvert).
- Un scénario qui keyframe `x`/`y` sur un enfant sous layout Yoga (voir limite connue plus haut).
- `staticOverrides` sur un objet qui n'a **aucune** piste keyframée — vérifier que l'objet
  n'apparaît alors nulle part dans le fichier exporté (comportement attendu mais pas testé pour ce
  cas précis, seulement pour le cas mixte où l'objet a au moins une vraie piste).

## Hors scope (décisions actées, pas des oublis)

- **`@pixi/ui`** pour remplacer `Button.ts`/`TextLabel.ts` — évalué, reporté à un lot séparé.
- **AssetPack** (pixijs/assetpack) pour remplacer/étendre `vite-anim-plugin.ts` (+ compression
  textures/mesh/fonts) — évalué, reporté à un lot séparé.
- Renommage `public/game/models/` → `public/game/mesh/` — proposé, pas encore tranché.
