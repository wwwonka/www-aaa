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
