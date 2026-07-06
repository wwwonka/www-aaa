# Threading Model

## Décision : 4 threads (pas 5)

### Pourquoi pas un Network Worker ?

`RTCDataChannel` ne peut pas tourner dans un Web Worker — c'est une limitation navigateur,
pas encore standardisée (W3C proposal ouvert). Apple a annoncé un support partiel à WWDC 2023
mais l'implémentation cross-browser est incomplète en 2026.

Références :

- https://github.com/w3c/webrtc-pc/issues/230
- https://github.com/w3c/webrtc-extensions/issues/77

Le Gamepad API (DOM events) est aussi limité au Main Thread — les deux sources d'input
atterrissent donc naturellement au même endroit.

### Architecture finale

```
[Main Thread]
  Gamepad API + WebRTC (Trystero + DataChannel)
  DOM, shell PWA, joysticks CSS
       ↓ écrit SAB (section Input)

[Simulation Worker] ← lit SAB Input + écrit SAB Matrices & Audio queue
[Render Worker]     ← lit SAB Matrices
[Audio Worker]      ← lit SAB Audio queue
```

Le Main Thread reste léger : il reçoit les inputs et les écrit dans le SAB.
Aucune logique de jeu ne tourne sur le Main Thread.

### Communication inter-threads

- **Chemin chaud (every frame) :** SharedArrayBuffer + Atomics — zéro copie, zéro latence
- **Chemin froid (init, pause, resize) :** postMessage — acceptable pour les événements rares

### Note — 5ᵉ thread, placement maintenant dynamique

AssetsManager (voir `docs/assets-manager.md`) tourne hors du chemin chaud SAB décrit ci-dessus (pas
de boucle de jeu, juste quelques appels async au démarrage) — soit dans `src/core/SystemHost.worker.ts`
(worker dédié), soit inline sur le main thread, selon la décision de `src/core/SystemAllocator.ts`
au runtime. Ce doc décrit les 4 threads de la boucle de jeu (Main/Simulation/Render/Audio), pas
l'inventaire complet des workers du projet. Voir `docs/system-allocator.md` pour la règle N-1 et
le pattern de multiplexage lazy qui remplace l'ancien `assetsManager.worker.ts` codé en dur.
