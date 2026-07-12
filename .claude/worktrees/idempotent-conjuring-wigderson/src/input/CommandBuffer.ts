// Commandes abstraites — ni le clavier ni la manette ne doivent fuiter au-delà de ce fichier
export type GameCommand =
  | 'MOVE_UP' | 'MOVE_DOWN' | 'MOVE_LEFT' | 'MOVE_RIGHT'
  | 'DASH'
  | 'PAUSE'
  | 'CONFIRM' | 'CANCEL'

// Buffer circulaire de commandes — lu par la simulation à chaque tick
// TODO: implémenter avec un SAB partagé pour éviter les postMessage
export class CommandBuffer {
  private _queue: GameCommand[] = []

  push(cmd: GameCommand): void {
    this._queue.push(cmd)
  }

  flush(): GameCommand[] {
    const cmds  = this._queue
    this._queue = []
    return cmds
  }
}
