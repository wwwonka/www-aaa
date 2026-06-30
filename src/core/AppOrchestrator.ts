import { createMachine, createActor, assign } from 'xstate'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppState =
  | 'TITLE_SCREEN'
  | 'IN_GAME'
  | 'PAUSED'
  | 'PLAYING_ON_PHONE'

export type AppEvent =
  | { type: 'PLAY' }
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
  | { type: 'ASSET_ERROR'; path: string; error: string }

interface AppContext {
  hasController: boolean
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const appMachine = createMachine(
  {
    id: 'app',
    initial: 'TITLE_SCREEN',
    types: {} as { context: AppContext; events: AppEvent },
    context: { hasController: false },

    on: {
      CONTROLLER_CONNECTED:    { actions: assign({ hasController: true }) },
      CONTROLLER_DISCONNECTED: { actions: assign({ hasController: false }) },
    },

    states: {
      TITLE_SCREEN: {
        on: {
          PLAY: {
            target: 'IN_GAME',
            guard: 'hasController',
          },
        },
      },

      IN_GAME: {
        on: {
          PAUSE:    'PAUSED',
          QUIT:     'TITLE_SCREEN',
          TRANSFER: {
            target: 'PLAYING_ON_PHONE',
            guard: 'hasController',
          },
        },
      },

      PAUSED: {
        on: {
          RESUME: 'IN_GAME',
          QUIT:   'TITLE_SCREEN',
        },
      },

      PLAYING_ON_PHONE: {
        on: {
          TRANSFER_BACK: 'IN_GAME',
          QUIT:          'TITLE_SCREEN',
        },
      },
    },
  },
  {
    guards: {
      hasController: ({ context }) => context.hasController,
    },
  },
)

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Cerveau organisationnel du Shell (main thread). Détient le cycle de vie et l'état
 * applicatif (xstate) du jeu, et dirige les autres managers (ScreenManager, AssetsManager)
 * via des events de haut niveau plutôt que de laisser cette logique s'éparpiller dans AppHost.
 */
export class AppOrchestrator {
  private readonly actor = createActor(appMachine)

  startUp(): void {
    this.actor.start()
  }

  shutDown(): void {
    this.actor.stop()
  }

  send(event: AppEvent): void {
    this.actor.send(event)
  }

  subscribe(listener: Parameters<typeof this.actor.subscribe>[0]): void {
    this.actor.subscribe(listener)
  }

  getSnapshot() {
    return this.actor.getSnapshot()
  }
}

export const appOrchestrator = new AppOrchestrator()
