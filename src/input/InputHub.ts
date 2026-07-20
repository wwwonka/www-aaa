// L'orchestrateur du pipeline d'input — le SEUL point d'entrée que les Hosts touchent. Il possède
// l'unique boucle rAF, interroge les sources enregistrées, arbitre laquelle « possède » la sortie
// (latest-active-wins), réduit les 2 sticks en une direction et l'émet vers un sink canonique
// `(x, z) => void`. Transport-agnostic : le sink route ensuite vers le SAB local OU le RTC (voir
// `pairingHost.sendInput`) — le hub ne le sait pas. La politique d'émission (30 Hz, détection de
// changement, keepalive, pas d'axes fantômes à l'arrêt) est reprise telle quelle de l'ancien
// `Joysticks._tick`, désormais centralisée.

import type { InputSource } from './sources/InputSource';
import { isControllerFrameActive, type ControllerFrame } from './ControllerFrame';
import { reduceSticks } from './math/stickReducer';

const SAMPLE_MS = 33; // ~30 Hz — limite le trafic RTC (aligné sur l'ancien GamepadScreen)
const KEEPALIVE_MS = 500; // ré-émission périodique même sans changement (anti-perte RTC)

const QUANT = 32767;
const quant = (v: number): number => (Math.max(-1, Math.min(1, v)) * QUANT) | 0;

export interface InputHubOptions {
  /**
   * Sink des axes réduits, normalisés `[-1, 1]`. Typiquement `pairingHost.sendInput` : il écrit le
   * SAB local si ce device est l'autorité, sinon envoie en RTC au peer pairé. Le hub l'ignore.
   */
  readonly axisSink: (dirX: number, dirZ: number) => void;
  /**
   * Sink des actions discrètes (`ActionId`), appelé une fois par **front montant** (pression, pas
   * maintien). Contrairement aux axes, les actions ne passent pas par l'arbitrage : l'union de
   * toutes les sources est écoutée (un bouton manette compte même si le tactile possède les axes).
   */
  readonly actionSink?: (actionId: number) => void;
}

/** État d'arbitrage tenu par le hub pour une source. */
interface SourceSlot {
  readonly source: InputSource;
  active: boolean;
  /** Rang d'engagement (transition neutre→actif) : le plus grand parmi les sources actives gagne. */
  engagedAt: number;
}

/**
 * Fusionne plusieurs sources d'entrée en un flux d'axes unique.
 *
 * **Arbitrage latest-active-wins** : la source qui a pris la main le plus récemment (dernière
 * transition neutre→actif) possède la sortie tant qu'elle reste active ; quand elle recentre, la
 * source active suivante (engagée le plus récemment) reprend. Immunisé au jitter : tenir un stick
 * ne re-déclenche pas d'engagement, donc ne vole pas la main à une source qui vient de bouger.
 */
export class InputHub {
  private readonly _axisSink: (x: number, z: number) => void;
  private readonly _actionSink: ((actionId: number) => void) | null;
  private readonly _slots: SourceSlot[] = [];

  private _running = false;
  private _raf = 0;
  private _lastTs = 0;
  private _sampleAcc = 0;
  private _keepaliveAcc = 0;
  private _engageCounter = 0;
  private _lastQx = 0;
  private _lastQz = 0;
  /** Bitset d'actions du tick précédent (toutes sources confondues) — base de l'edge-detection. */
  private _prevActions = 0;

  constructor(opts: InputHubOptions) {
    this._axisSink = opts.axisSink;
    this._actionSink = opts.actionSink ?? null;
  }

  /** Enregistre une source. Si le hub tourne déjà, la démarre aussitôt. */
  register(source: InputSource): void {
    this._slots.push({ source, active: false, engagedAt: 0 });
    if (this._running) source.start();
  }

  /** Démarre la capture (sources + boucle rAF). Idempotent. */
  start(): void {
    if (this._running) return;
    this._running = true;
    for (const slot of this._slots) slot.source.start();
    this._lastTs = performance.now();
    this._sampleAcc = 0;
    this._keepaliveAcc = 0;
    this._raf = requestAnimationFrame(this._tick);
  }

  /** Arrête la capture et émet des axes nuls (pas d'axes fantômes à la reprise). Idempotent. */
  stop(): void {
    if (!this._running) return;
    this._running = false;
    cancelAnimationFrame(this._raf);
    for (const slot of this._slots) {
      slot.source.stop();
      slot.active = false;
    }
    this._prevActions = 0; // pas de latch périmé : une action tenue au stop re-frontera à la reprise
    this._forceEmit(0, 0);
  }

  private readonly _tick = (ts: number): void => {
    if (!this._running) return;
    const delta = ts - this._lastTs;
    this._lastTs = ts;
    this._sampleAcc += delta;
    this._keepaliveAcc += delta;
    if (this._sampleAcc >= SAMPLE_MS) {
      this._sampleAcc = 0;
      this._sampleAndEmit();
    }
    this._raf = requestAnimationFrame(this._tick);
  };

  private _sampleAndEmit(): void {
    let owner: SourceSlot | null = null;
    let ownerFrame: ControllerFrame | null = null;
    let actionsNow = 0;

    for (const slot of this._slots) {
      const frame = slot.source.poll();
      if (frame !== null) actionsNow |= frame.actions; // union : les actions ignorent l'arbitrage
      const active = frame !== null && isControllerFrameActive(frame);
      // Nouvelle prise en main (neutre→actif) → engagement le plus récent.
      if (active && !slot.active) slot.engagedAt = ++this._engageCounter;
      slot.active = active;
      if (active && (owner === null || slot.engagedAt > owner.engagedAt)) {
        owner = slot;
        ownerFrame = frame;
      }
    }

    this._emitActionEdges(actionsNow);

    if (ownerFrame === null) {
      this._maybeEmit(0, 0); // aucune source active → recentrage
      return;
    }
    const reduced = reduceSticks(ownerFrame.leftStick, ownerFrame.rightStick);
    this._maybeEmit(reduced.x, reduced.z);
  }

  /** Émet chaque `ActionId` en front montant (bit levé ce tick, pas au précédent), une seule fois. */
  private _emitActionEdges(actionsNow: number): void {
    const rising = actionsNow & ~this._prevActions;
    this._prevActions = actionsNow;
    if (rising === 0 || this._actionSink === null) return;
    for (let actionId = 0; actionId < 32; actionId++) {
      if ((rising & (1 << actionId)) !== 0) this._actionSink(actionId);
    }
  }

  /** Émet si la valeur quantifiée a changé, ou si le keepalive est échu. */
  private _maybeEmit(x: number, z: number): void {
    const qx = quant(x);
    const qz = quant(z);
    const changed = qx !== this._lastQx || qz !== this._lastQz;
    if (changed || this._keepaliveAcc >= KEEPALIVE_MS) {
      this._axisSink(x, z);
      this._lastQx = qx;
      this._lastQz = qz;
      this._keepaliveAcc = 0;
    }
  }

  /** Émet inconditionnellement (utilisé pour forcer le retour à zéro à l'arrêt). */
  private _forceEmit(x: number, z: number): void {
    this._axisSink(x, z);
    this._lastQx = quant(x);
    this._lastQz = quant(z);
    this._keepaliveAcc = 0;
  }
}
