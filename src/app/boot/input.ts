// Câblage d'input **partagé** par les deux hosts (receiver via ShellHost, controller via ShellHost) :
// crée l'InputHub et y branche les sources standard — la manette (toujours, agnostique et inerte
// sans périphérique) et le tactile (si ce device a des joysticks). C'est le point unique qui garantit
// « mêmes inputs partout » : peu importe le device, les mêmes sources, le même hub ; seul l'`axisSink`
// (SAB local vs RTC) diffère, et il est injecté. Les sources dev (clavier) s'ajoutent séparément via
// `initDev`, jamais ici (zéro `_dev` en prod).
//
// C'est aussi ICI que vit le mapping actions UI → commande FSM, par écran (SCREEN_COMMANDS) : les
// sources parlent en `ActionId` abstraits (aucun index de bouton physique ne sort de sa source), et
// la signification d'une action dépend uniquement de l'écran courant.

import { InputHub } from '../../input/InputHub';
import { GamepadSource } from '../../input/sources/GamepadSource';
import { TouchSource } from '../../input/sources/TouchSource';
import { appOrchestrator, type AppState } from '../../core/AppOrchestrator';
import { ACTION_ID } from '../../shared/constants';
import type { JoysticksView } from '../shell/components/JoysticksView';

// Événements FSM sans payload déclenchables par une action UI (élargir l'union au besoin).
type UiCommand = 'PLAY' | 'PAUSE' | 'RESUME';

// ActionId → événement orchestrateur, selon l'écran courant. Écran absent ou action absente =
// ignoré (PAIRING_MODE : rien ne passe sous l'overlay ; dash/split iront au ring SAB, passe
// future — pas des événements FSM). Au title, CONFIRM (Cross) et MENU (Share) démarrent tous
// deux ; ensuite MENU = toggle pause, CONFIRM reste libre pour le gameplay/menus.
const SCREEN_COMMANDS: Partial<Record<AppState, Partial<Record<number, UiCommand>>>> = {
  TITLE_SCREEN: { [ACTION_ID.CONFIRM]: 'PLAY', [ACTION_ID.MENU]: 'PLAY' },
  IN_GAME: { [ACTION_ID.MENU]: 'PAUSE' },
  PAUSED: { [ACTION_ID.MENU]: 'RESUME' },
};

/** Route une action UI (front montant du hub) vers le FSM selon l'écran courant. */
function dispatchUiAction(actionId: number): void {
  const screen = appOrchestrator.getSnapshot().value as AppState;
  const command = SCREEN_COMMANDS[screen]?.[actionId];
  if (command === undefined) return;
  // PLAY est gardé par `hasController`. L'event `gamepadconnected` (soloMode) part de la MÊME
  // première pression que celle qu'on dispatch (privacy gate navigateur) → course. On arme la
  // garde nous-mêmes, comme le pairing et le clavier dev (idempotent).
  if (command === 'PLAY') appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
  appOrchestrator.send({ type: command });
}

export function setupInput(opts: {
  /** Où partent les axes réduits (`pairingHost.sendInput` : SAB local si autorité, sinon RTC). */
  readonly axisSink: (dirX: number, dirZ: number) => void;
  /** La vue joysticks montée, ou `null` si ce device n'a pas d'input tactile (desktop). */
  readonly joysticksView: JoysticksView | null;
}): InputHub {
  const hub = new InputHub({ axisSink: opts.axisSink, actionSink: dispatchUiAction });
  hub.register(new GamepadSource());
  if (opts.joysticksView !== null) {
    hub.register(new TouchSource(opts.joysticksView.surface, opts.joysticksView));
  }
  return hub;
}
