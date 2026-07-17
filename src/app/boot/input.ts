// Câblage d'input **partagé** par les deux hosts (receiver via ShellHost, controller via ShellHost) :
// crée l'InputHub et y branche les sources standard — la manette (toujours, agnostique et inerte
// sans périphérique) et le tactile (si ce device a des joysticks). C'est le point unique qui garantit
// « mêmes inputs partout » : peu importe le device, les mêmes sources, le même hub ; seul l'`axisSink`
// (SAB local vs RTC) diffère, et il est injecté. Les sources dev (clavier) s'ajoutent séparément via
// `initDev`, jamais ici (zéro `_dev` en prod).

import { InputHub } from '../../input/InputHub';
import { GamepadSource } from '../../input/sources/GamepadSource';
import { TouchSource } from '../../input/sources/TouchSource';
import type { JoysticksView } from '../shell/components/JoysticksView';

export function setupInput(opts: {
  /** Où partent les axes réduits (`pairingHost.sendInput` : SAB local si autorité, sinon RTC). */
  readonly axisSink: (dirX: number, dirZ: number) => void;
  /** La vue joysticks montée, ou `null` si ce device n'a pas d'input tactile (desktop). */
  readonly joysticksView: JoysticksView | null;
}): InputHub {
  const hub = new InputHub({ axisSink: opts.axisSink });
  hub.register(new GamepadSource());
  if (opts.joysticksView !== null) {
    hub.register(new TouchSource(opts.joysticksView.surface, opts.joysticksView));
  }
  return hub;
}
