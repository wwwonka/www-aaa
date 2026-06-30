/** Quadratic ease-out: fast start, slow end */
export function easeOut(t: number): number { return 1 - (1 - t) * (1 - t) }

/** Quadratic ease-in: slow start, fast end */
export function easeIn(t: number): number { return t * t }

/** Position in normalised [0, 1] space */
export interface NormalizedPoint {
  readonly nx: number
  readonly ny: number
}

export const Anchor = {
  TOP_LEFT:      'TOP_LEFT',
  TOP_CENTER:    'TOP_CENTER',
  TOP_RIGHT:     'TOP_RIGHT',
  CENTER_LEFT:   'CENTER_LEFT',
  CENTER:        'CENTER',
  CENTER_RIGHT:  'CENTER_RIGHT',
  BOTTOM_LEFT:   'BOTTOM_LEFT',
  BOTTOM_CENTER: 'BOTTOM_CENTER',
  BOTTOM_RIGHT:  'BOTTOM_RIGHT',
} as const

export type Anchor = typeof Anchor[keyof typeof Anchor]

/** (ox, oy) multipliers on (elemW, elemH) — the origin offset for each anchor */
const ANCHOR_ORIGIN: Record<Anchor, readonly [number, number]> = {
  TOP_LEFT:      [0,   0  ],
  TOP_CENTER:    [0.5, 0  ],
  TOP_RIGHT:     [1,   0  ],
  CENTER_LEFT:   [0,   0.5],
  CENTER:        [0.5, 0.5],
  CENTER_RIGHT:  [1,   0.5],
  BOTTOM_LEFT:   [0,   1  ],
  BOTTOM_CENTER: [0.5, 1  ],
  BOTTOM_RIGHT:  [1,   1  ],
}

/**
 * Resolves a normalised position + anchor to pixel coordinates.
 *
 * @param point  - position in [0, 1] space
 * @param anchor - which corner/edge of the element is the origin
 * @param sw     - screen width in pixels
 * @param sh     - screen height in pixels
 * @param elemW  - element width in pixels (0 if unknown)
 * @param elemH  - element height in pixels (0 if unknown)
 */
export function resolvePosition(
  point:  NormalizedPoint,
  anchor: Anchor,
  sw:     number,
  sh:     number,
  elemW = 0,
  elemH = 0,
): { x: number; y: number } {
  const [ox, oy] = ANCHOR_ORIGIN[anchor]
  return {
    x: point.nx * sw - ox * elemW,
    y: point.ny * sh - oy * elemH,
  }
}
