# Responsabilités des Workers

## Simulation Worker — La Vérité

Tout ce qui a un état logique de jeu. Producteur du SAB.

| Système | Raison |
|---------|--------|
| Havok + IA des boids | État physique, déterminisme |
| Triggers et zones | Influencent le gameplay |
| Objets destructibles | Changement d'état (santé, activation) |
| Animations logiques | Position "maître" des objets sur courbe (les boids doivent les éviter) |

## Render Worker — L'Illusion

Consommateur pur du SAB. Aucun état de jeu.

| Système | Raison |
|---------|--------|
| Skybox / environnement | Pas d'interaction physique, libère des cycles CPU dans Simulation |
| Particules cosmétiques | Étincelles, bulles — GPU uniquement, zéro collision |
| Post-processing | Bloom, God Rays — aucun impact sur la simulation |

## ⚠️ Gotcha — Promotion d'objets

Un objet décoratif (ex: plante) qui devient collidable doit être "promu" dans le
Simulation Worker pour que Havok puisse créer son corps physique.
Prévoir cette possibilité dès la conception du SceneManager.

## Moteur physique

Havok (via `@babylonjs/havok`) — intégré à Babylon.js, tourne dans le Simulation Worker.

## Règle de conception — Classes portables (Worker-ready)

Toute classe métier (`WebRTCManager`, `SignalingTransport`, `AudioAggregator`, etc.) doit être
**portable entre contextes d'exécution** : elle doit pouvoir tourner indifféremment sur le Main
Thread ou dans un Worker sans modification.

**Interdit dans une classe métier :**
- `window.*`, `document.*`, toute référence DOM
- `self.postMessage` — réservé au fichier `.worker.ts`
- `Atomics.wait()` — bloquant, interdit sur le Main Thread

**Autorisé partout :**
- `SharedArrayBuffer` + `Atomics.store/load/notify`
- `WebSocket`, `fetch`
- `Comlink.expose` / `Comlink.wrap` — dans le `.worker.ts` uniquement, pas dans la classe

**Pourquoi :** `RTCPeerConnection` et `RTCDataChannel` ne sont pas disponibles dans les Workers
en 2026 (support expérimental Chrome uniquement). Ces classes tournent donc sur le Main Thread
aujourd'hui. Quand le support cross-browser arrivera, le déplacement dans un Worker se fera en
changeant uniquement le fichier `.worker.ts` — zéro réécriture des classes métier.

Exemple :
```
input/
  input.worker.ts       ← contexte, Comlink.expose, postMessage — RIEN d'autre
  WebRTCManager.ts      ← logique pure, aucune référence à window/self/DOM
  SignalingTransport.ts ← logique pure, aucune référence à window/self/DOM
```
