type Setter = (value: number) => void

const targets = new Map<string, Setter>()

/**
 * Registers a settable target under `id` — screens/components call this once at construction.
 *
 * @param id - Unique target id, conventionally `` `${objectKey}.${prop}` `` (e.g. `'title.opacity'`).
 * @param setter - Applies an incoming numeric value to the underlying property.
 */
export function registerAnimatable(id: string, setter: Setter): void {
  targets.set(id, setter)
}

/**
 * Pushes `value` into whatever registered under `id`, if anything. Called by the dev bridge
 * (Comlink) or `AnimationPlayer` (prod) — neither knows what it's animating.
 *
 * @param id - Target id, as passed to {@link registerAnimatable}. Silently ignored if unregistered.
 * @param value - The value to apply.
 */
export function applyAnimatedValue(id: string, value: number): void {
  targets.get(id)?.(value)
}
