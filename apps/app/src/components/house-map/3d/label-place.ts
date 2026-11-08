export interface PlacedText {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

export interface LabelBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const CHAR_WIDTH_EM = 0.58;

const HALO_SCALE = 1.6;

const GAP_PX = 3;

const DESCENT_EM = 0.25;

export function labelBox(label: PlacedText, fontPx: number, padPx = 0): LabelBox {
  const half = (label.text.length * fontPx * CHAR_WIDTH_EM) / 2 + padPx;
  return {
    left: label.x - half,
    right: label.x + half,
    top: label.y - fontPx - padPx,
    bottom: label.y + fontPx * DESCENT_EM + padPx,
  };
}

export function robotBox(robot: {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}): LabelBox {
  const reach = robot.radius * HALO_SCALE;
  return {
    left: robot.x - reach,
    right: robot.x + reach,
    top: robot.y - reach,
    bottom: robot.y + reach,
  };
}

export function markBox(mark: {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}): LabelBox {
  return {
    left: mark.x - mark.r,
    right: mark.x + mark.r,
    top: mark.y - mark.r,
    bottom: mark.y + mark.r,
  };
}

export function boxesMeet(a: LabelBox, b: LabelBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function clearOf<T extends PlacedText>(
  label: T,
  fontPx: number,
  keepOut: LabelBox,
  padPx: number,
): T {
  const box = labelBox(label, fontPx, padPx);
  if (!boxesMeet(box, keepOut)) {
    return label;
  }
  const centre = (box.top + box.bottom) / 2;
  const above = centre <= (keepOut.top + keepOut.bottom) / 2;
  const y = above
    ? keepOut.top - GAP_PX - padPx - fontPx * DESCENT_EM
    : keepOut.bottom + GAP_PX + padPx + fontPx;
  return { ...label, y };
}

export interface LabelBounds {
  readonly width: number;
  readonly height: number;
}

function insideOf<T extends PlacedText>(
  label: T,
  fontPx: number,
  padPx: number,
  bounds: LabelBounds,
): T {
  const box = labelBox(label, fontPx, padPx);
  const dx = Math.max(0, -box.left) - Math.max(0, box.right - bounds.width);
  const dy = Math.max(0, -box.top) - Math.max(0, box.bottom - bounds.height);
  return dx === 0 && dy === 0 ? label : { ...label, x: label.x + dx, y: label.y + dy };
}

export interface PlaceOptions {
  readonly padPx?: number;
  readonly bounds?: LabelBounds;
}

const NUDGE_RINGS = 3;

function nudgesOf(rings: number): readonly (readonly [number, number])[] {
  const steps = Array.from({ length: rings * 2 + 1 }, (_, index) => index - rings);
  return steps
    .flatMap((across) => steps.map((down) => [across, down] as const))
    .sort(([a, b], [c, d]) => Math.hypot(a, b * 2) - Math.hypot(c, d * 2));
}

const NUDGES = nudgesOf(NUDGE_RINGS);

interface Placing {
  readonly fontPx: number;
  readonly padPx: number;
  readonly keepOut: readonly LabelBox[];
  readonly bounds: LabelBounds | undefined;
}

function overlapOf(box: LabelBox, others: readonly LabelBox[]): number {
  return others.reduce((sum, other) => {
    const wide = Math.min(box.right, other.right) - Math.max(box.left, other.left);
    const tall = Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
    return wide > 0 && tall > 0 ? sum + wide * tall : sum;
  }, 0);
}

function candidatesOf<T extends PlacedText>(label: T, placing: Placing): readonly T[] {
  const { fontPx, padPx, keepOut, bounds } = placing;
  const box = labelBox(label, fontPx, padPx);
  const stepX = (box.right - box.left) / 2 + GAP_PX;
  const stepY = box.bottom - box.top + GAP_PX;
  return NUDGES.map(([across, down]) => {
    const shifted = { ...label, x: label.x + across * stepX, y: label.y + down * stepY };
    const cleared = keepOut.reduce(
      (current, keep) => clearOf(current, fontPx, keep, padPx),
      shifted,
    );
    return bounds === undefined ? cleared : insideOf(cleared, fontPx, padPx, bounds);
  });
}

function bestOf<T extends PlacedText>(
  label: T,
  candidates: readonly T[],
  placing: Placing,
  taken: readonly LabelBox[],
): T {
  const others = [...placing.keepOut, ...taken];
  let best = label;
  let bestOverlap = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const overlap = overlapOf(labelBox(candidate, placing.fontPx, placing.padPx), others);
    if (overlap === 0) {
      return candidate;
    }
    if (overlap < bestOverlap) {
      best = candidate;
      bestOverlap = overlap;
    }
  }
  return best;
}

function bestSpot<T extends PlacedText>(label: T, placing: Placing, taken: readonly LabelBox[]): T {
  return bestOf(label, candidatesOf(label, placing), placing, taken);
}

export function placeLabels<T extends PlacedText>(
  labels: readonly T[],
  fontPx: number,
  keepOut: readonly LabelBox[],
  options: PlaceOptions = {},
): readonly T[] {
  const placing: Placing = { fontPx, padPx: options.padPx ?? 0, keepOut, bounds: options.bounds };
  const taken: LabelBox[] = [];
  return labels.map((label) => {
    const spot = bestSpot(label, placing, taken);
    taken.push(labelBox(spot, fontPx, placing.padPx));
    return spot;
  });
}

export const ROOM_LABEL_SPOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -30],
  [0, 30],
  [0, -60],
  [0, 60],
  [-50, 0],
  [50, 0],
];

export function placeAtSpots<T extends PlacedText>(
  labels: readonly T[],
  fontPx: number,
  keepOut: readonly LabelBox[],
  options: PlaceOptions & { readonly spots: readonly (readonly [number, number])[] },
): readonly T[] {
  const placing: Placing = { fontPx, padPx: options.padPx ?? 0, keepOut, bounds: options.bounds };
  const taken: LabelBox[] = [];
  return labels.map((label) => {
    const candidates = options.spots.map(([dx, dy]) => {
      const shifted = { ...label, x: label.x + dx, y: label.y + dy };
      return placing.bounds === undefined
        ? shifted
        : insideOf(shifted, fontPx, placing.padPx, placing.bounds);
    });
    const spot = bestOf(label, candidates, placing, taken);
    taken.push(labelBox(spot, fontPx, placing.padPx));
    return spot;
  });
}

const ELLIPSIS = '\u2026';

export function ellipsized(text: string, fontPx: number, maxPx: number): string {
  const fits = Math.floor(maxPx / (fontPx * CHAR_WIDTH_EM));
  if (text.length <= fits) return text;
  return `${text.slice(0, Math.max(0, fits - 1)).trimEnd()}${ELLIPSIS}`;
}
