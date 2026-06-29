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
// Actor (singleton)
// ---------------------------------------------------------------------------

export const appActor = createActor(appMachine)

export function startAppStateMachine() {
  appActor.start()
}
