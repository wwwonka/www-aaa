import { createMachine, createActor, assign } from 'xstate';
import type { SnapshotFrom } from 'xstate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * `PLAYING_ON_PHONE` — le jeu continue de tourner mais le rendu est transféré à un contrôleur mobile (voir event `TRANSFER`).
 * `PAIRING_MODE` — overlay de pairing affiché par-dessus l'écran courant (le screen sous-jacent reste visible, voir `ScreenManager`).
 */
export type AppState = 'TITLE_SCREEN' | 'PAIRING_MODE' | 'IN_GAME' | 'PAUSED' | 'PLAYING_ON_PHONE';

export type AppEvent =
  | { type: 'PLAY' }
  | { type: 'OPEN_PAIRING' }
  | { type: 'CLOSE_PAIRING' }
  // Émis par l'UI (PLAY HERE / BRING IT BACK) mais intercepté par AppHost → HandoffCoordinator :
  // aucune transition ici, l'autorité est orthogonale à l'AppState (design étapes 5-6 §B.1).
  | { type: 'REQUEST_HANDOFF' }
  // Émis par l'UI (item title « USE DEVICE AS CONTROLLER ») mais intercepté par AppHost → ouvre le
  // scanner QR in-app puis rejoint la room scannée en controller. Aucune transition d'AppState ici.
  | { type: 'USE_AS_CONTROLLER' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'QUIT' }
  | { type: 'TRANSFER' }
  | { type: 'TRANSFER_BACK' }
  | { type: 'CONTROLLER_CONNECTED' }
  | { type: 'CONTROLLER_DISCONNECTED' }
  | { type: 'ASSET_START'; total: number }
  | { type: 'ASSET_PROGRESS'; path: string; loaded: number; total: number }
  | { type: 'ASSET_COMPLETE' }
  | { type: 'ASSET_ERROR'; path: string; error: string };

export interface AppContext {
  hasController: boolean;
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const appMachine = createMachine(
  {
    id: 'app',
    initial: 'TITLE_SCREEN',
    types: {},
    context: { hasController: false },

    on: {
      CONTROLLER_CONNECTED: { actions: assign({ hasController: true }) },
      CONTROLLER_DISCONNECTED: { actions: assign({ hasController: false }) },
    },

    states: {
      TITLE_SCREEN: {
        on: {
          PLAY: {
            target: 'IN_GAME',
            guard: 'hasController',
          },
          OPEN_PAIRING: 'PAIRING_MODE',
        },
      },

      // Overlay par-dessus TITLE_SCREEN (le screen sous-jacent reste visible — voir
      // ScreenManager). Accessible plus tard depuis PAUSED : le retour multi-états sera géré à
      // ce moment-là (historique xstate ou state parent), pas construit maintenant.
      PAIRING_MODE: {
        on: {
          CLOSE_PAIRING: 'TITLE_SCREEN',
        },
      },

      IN_GAME: {
        on: {
          PAUSE: 'PAUSED',
          QUIT: 'TITLE_SCREEN',
          TRANSFER: {
            target: 'PLAYING_ON_PHONE',
            guard: 'hasController',
          },
        },
      },

      PAUSED: {
        on: {
          RESUME: 'IN_GAME',
          QUIT: 'TITLE_SCREEN',
        },
      },

      PLAYING_ON_PHONE: {
        on: {
          TRANSFER_BACK: 'IN_GAME',
          QUIT: 'TITLE_SCREEN',
        },
      },
    },
  },
  {
    guards: {
      hasController: ({ context }) => context.hasController,
    },
  },
);

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Cerveau organisationnel du Shell (main thread). Détient le cycle de vie et l'état
 * applicatif (xstate) du jeu, et dirige les autres managers (ScreenManager, AssetsManager)
 * via des events de haut niveau plutôt que de laisser cette logique s'éparpiller dans AppHost.
 */
export class AppOrchestrator {
  private readonly _actor = createActor(appMachine);

  startUp(): void {
    this._actor.start();
  }

  shutDown(): void {
    this._actor.stop();
  }

  send(event: AppEvent): void {
    this._actor.send(event);
  }

  subscribe(listener: Parameters<typeof this._actor.subscribe>[0]): void {
    this._actor.subscribe(listener);
  }

  getSnapshot(): SnapshotFrom<typeof appMachine> {
    return this._actor.getSnapshot();
  }
}

export const appOrchestrator = new AppOrchestrator();
