type Setter = (value: number) => void

const targets = new Map<string, Setter>()

/** Registers a settable target under `id` — screens/components call this once at construction. */
export function registerAnimatable(id: string, setter: Setter): void {
  targets.set(id, setter)
}

/** Pushes `value` into whatever registered under `id`, if anything. Called by the dev bridge (Comlink) or `AnimationPlayer` (prod) — neither knows what it's animating. */
export function applyAnimatedValue(id: string, value: number): void {
  targets.get(id)?.(value)
}
