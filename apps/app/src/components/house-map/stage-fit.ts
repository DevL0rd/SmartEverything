export interface ChromeBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PlanArea {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface PlanPlace {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

const CHROME_GAP_PX = 6;

const SEARCH_STEPS = 18;

const SMALLEST_SHARE = 0.2;

interface Size {
  readonly w: number;
  readonly h: number;
}

function clear(at: ChromeBox, boxes: readonly ChromeBox[]): boolean {
  return boxes.every(
    (box) =>
      at.x >= box.x + box.w + CHROME_GAP_PX ||
      box.x >= at.x + at.w + CHROME_GAP_PX ||
      at.y >= box.y + box.h + CHROME_GAP_PX ||
      box.y >= at.y + at.h + CHROME_GAP_PX,
  );
}

function candidates(
  low: number,
  high: number,
  size: number,
  edges: readonly (readonly [number, number])[],
): readonly number[] {
  const middle = (low + high - size) / 2;
  const beside = edges.flatMap(([start, end]) => [
    end + CHROME_GAP_PX,
    start - CHROME_GAP_PX - size,
  ]);
  return [middle, low, high - size, ...beside].filter(
    (value) => value >= low - 0.5 && value + size <= high + 0.5,
  );
}

function placeAt(area: PlanArea, size: Size, boxes: readonly ChromeBox[]): ChromeBox | null {
  const xs = candidates(
    area.left,
    area.width - area.right,
    size.w,
    boxes.map((box) => [box.x, box.x + box.w]),
  );
  const ys = candidates(
    area.top,
    area.height - area.bottom,
    size.h,
    boxes.map((box) => [box.y, box.y + box.h]),
  );
  const centre = { x: area.width / 2, y: area.height / 2 };
  let best: ChromeBox | null = null;
  let bestDistance = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const at = { x, y, w: size.w, h: size.h };
      const distance = Math.hypot(x + size.w / 2 - centre.x, y + size.h / 2 - centre.y);
      if (distance < bestDistance && clear(at, boxes)) {
        best = at;
        bestDistance = distance;
      }
    }
  }
  return best;
}

export function placePlan(
  area: PlanArea,
  span: { readonly x: number; readonly y: number },
  boxes: readonly ChromeBox[],
): PlanPlace {
  const largest = Math.min(
    Math.max(1, area.width - area.left - area.right) / span.x,
    Math.max(1, area.height - area.top - area.bottom) / span.y,
  );
  const fit = (scale: number): ChromeBox | null =>
    placeAt(area, { w: span.x * scale, h: span.y * scale }, boxes);
  const whole = fit(largest);
  if (whole !== null) {
    return { scale: largest, x: whole.x, y: whole.y };
  }
  let low = largest * SMALLEST_SHARE;
  let high = largest;
  let best = fit(low);
  for (let step = 0; best !== null && step < SEARCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    const placed = fit(middle);
    if (placed === null) {
      high = middle;
    } else {
      low = middle;
      best = placed;
    }
  }
  return best === null ? centredAt(area, span, low) : { scale: low, x: best.x, y: best.y };
}

function centredAt(
  area: PlanArea,
  span: { readonly x: number; readonly y: number },
  scale: number,
): PlanPlace {
  return {
    scale,
    x: area.left + (area.width - area.left - area.right - span.x * scale) / 2,
    y: area.top + (area.height - area.top - area.bottom - span.y * scale) / 2,
  };
}

export interface StageInsets {
  readonly top: number;
  readonly bottom: number;
}
