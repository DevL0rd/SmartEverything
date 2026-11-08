import {
  homeMapDistance,
  homeMapPointInPolygon,
  homeMapProjectOnSegment,
  type HomeMapPolygonShape,
  type HomeMapSegmentShape,
  type HomeMapVec,
} from './home-map-geometry';

export interface AutoSize {
  readonly w: number;
  readonly d: number;
}

export interface AutoRect extends AutoSize {
  readonly at: HomeMapVec;
  readonly rotation: number;
}

export interface AutoWallEdge extends HomeMapSegmentShape {
  readonly dir: HomeMapVec;
  readonly normal: HomeMapVec;
  readonly length: number;
}

export interface AutoBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Scored {
  readonly p: HomeMapVec;
  readonly s: number;
}

export const AUTO_EPS = 1e-9;
const RAD = Math.PI / 180;

export const autoSub = (a: HomeMapVec, b: HomeMapVec): HomeMapVec => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

export const autoAlong = (p: HomeMapVec, dir: HomeMapVec, t: number): HomeMapVec => ({
  x: p.x + dir.x * t,
  y: p.y + dir.y * t,
});

export const autoUnit = (v: HomeMapVec): HomeMapVec => {
  const length = Math.hypot(v.x, v.y);
  return length < AUTO_EPS ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length };
};

export const autoAngleDeg = (v: HomeMapVec): number => Math.atan2(v.y, v.x) / RAD;

export const autoKey = (value: number): number => Math.round(value * 1e6);

export const autoText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const autoPolygonEdges = (polygon: HomeMapPolygonShape): readonly HomeMapSegmentShape[] =>
  [polygon.outer, ...polygon.holes].flatMap((ring) =>
    ring
      .map((from, index) => ({ from, to: ring[(index + 1) % ring.length] ?? from }))
      .filter((edge) => homeMapDistance(edge.from, edge.to) > AUTO_EPS),
  );

export const autoBoundaryDistance = (
  edges: readonly HomeMapSegmentShape[],
  p: HomeMapVec,
): number => Math.min(...edges.map((edge) => homeMapProjectOnSegment(edge, p).distance));

export const autoBounds = (ring: readonly HomeMapVec[]): AutoBox => {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

export const autoWallEdges = (polygon: HomeMapPolygonShape): readonly AutoWallEdge[] =>
  autoPolygonEdges(polygon)
    .map((edge) => {
      const length = homeMapDistance(edge.from, edge.to);
      const dir = autoUnit(autoSub(edge.to, edge.from));
      const left = { x: -dir.y, y: dir.x };
      const mid = autoAlong(edge.from, dir, length / 2);
      const inside = homeMapPointInPolygon(polygon, autoAlong(mid, left, 0.02));
      const normal = inside ? left : { x: -left.x, y: -left.y };
      return { ...edge, dir, normal, length };
    })
    .sort((p, q) => autoKey(q.length) - autoKey(p.length));

const scanBest = (box: AutoBox, step: number, score: (p: HomeMapVec) => number): Scored | null => {
  let best: Scored | null = null;
  for (let y = box.y; y <= box.y + box.h + AUTO_EPS; y += step) {
    for (let x = box.x; x <= box.x + box.w + AUTO_EPS; x += step) {
      const s = score({ x, y });
      if (s >= 0 && (best === null || s > best.s + AUTO_EPS)) best = { p: { x, y }, s };
    }
  }
  return best;
};

export const autoPole = (
  polygon: HomeMapPolygonShape,
  edges: readonly HomeMapSegmentShape[],
): Scored => {
  const box = autoBounds(polygon.outer);
  const score = (p: HomeMapVec): number =>
    homeMapPointInPolygon(polygon, p) ? autoBoundaryDistance(edges, p) : -1;
  let step = Math.max(box.w, box.h) / 16;
  let best = scanBest(box, step, score);
  while (best === null) {
    step /= 2;
    best = scanBest(box, step, score);
  }
  for (let level = 0; level < 8; level += 1) {
    step /= 2;
    const around = scanBest(
      { x: best.p.x - step, y: best.p.y - step, w: 2 * step, h: 2 * step },
      step,
      score,
    );
    if (around && around.s > best.s + AUTO_EPS) best = around;
  }
  return best;
};

export const autoGridSpots = (
  polygon: HomeMapPolygonShape,
  edges: readonly HomeMapSegmentShape[],
  count: number,
  clearance: number,
): readonly HomeMapVec[] => {
  const box = autoBounds(polygon.outer);
  for (let total = count; ; total += 1) {
    const cols = Math.min(total, Math.max(1, Math.round(Math.sqrt((total * box.w) / box.h))));
    const rows = Math.ceil(total / cols);
    const spots: HomeMapVec[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const p = { x: box.x + ((c + 0.5) * box.w) / cols, y: box.y + ((r + 0.5) * box.h) / rows };
        if (homeMapPointInPolygon(polygon, p) && autoBoundaryDistance(edges, p) >= clearance) {
          spots.push(p);
        }
      }
    }
    if (spots.length >= count) {
      return Array.from({ length: count }, (_, i) =>
        Math.floor(((i + 0.5) * spots.length) / count),
      ).flatMap((index) => spots[index] ?? []);
    }
  }
};

export const autoWithoutNearest = (
  spots: readonly HomeMapVec[],
  p: HomeMapVec,
): readonly HomeMapVec[] => {
  let nearest = 0;
  spots.forEach((spot, index) => {
    const best = spots[nearest];
    if (best && homeMapDistance(spot, p) < homeMapDistance(best, p) - AUTO_EPS) nearest = index;
  });
  return spots.filter((_, index) => index !== nearest);
};

const rectCorners = (rect: AutoRect): readonly HomeMapVec[] => {
  const cos = Math.cos(rect.rotation * RAD);
  const sin = Math.sin(rect.rotation * RAD);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx = 0, sy = 0]) => {
    const lx = (sx * rect.d) / 2;
    const ly = (sy * rect.w) / 2;
    return { x: rect.at.x + lx * cos - ly * sin, y: rect.at.y + lx * sin + ly * cos };
  });
};

const rectAxes = (rect: AutoRect): readonly HomeMapVec[] => {
  const cos = Math.cos(rect.rotation * RAD);
  const sin = Math.sin(rect.rotation * RAD);
  return [
    { x: cos, y: sin },
    { x: -sin, y: cos },
  ];
};

const span = (corners: readonly HomeMapVec[], axis: HomeMapVec): AutoSpan => {
  const values = corners.map((p) => p.x * axis.x + p.y * axis.y);
  return { low: Math.min(...values), high: Math.max(...values) };
};

interface AutoSpan {
  readonly low: number;
  readonly high: number;
}

export const autoRectsOverlap = (a: AutoRect, b: AutoRect): boolean => {
  const ca = rectCorners(a);
  const cb = rectCorners(b);
  return [...rectAxes(a), ...rectAxes(b)].every((axis) => {
    const sa = span(ca, axis);
    const sb = span(cb, axis);
    return sa.high > sb.low + AUTO_EPS && sb.high > sa.low + AUTO_EPS;
  });
};

const toLocal = (rect: AutoRect, p: HomeMapVec): HomeMapVec => {
  const cos = Math.cos(rect.rotation * RAD);
  const sin = Math.sin(rect.rotation * RAD);
  const dx = p.x - rect.at.x;
  const dy = p.y - rect.at.y;
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
};

const segmentHitsBox = (a: HomeMapVec, b: HomeMapVec, hx: number, hy: number): boolean => {
  let t0 = 0;
  let t1 = 1;
  const slabs = [
    { delta: b.x - a.x, start: a.x, half: hx },
    { delta: b.y - a.y, start: a.y, half: hy },
  ];
  for (const { delta, start, half } of slabs) {
    if (Math.abs(delta) < AUTO_EPS) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    const u = (-half - start) / delta;
    const v = (half - start) / delta;
    t0 = Math.max(t0, Math.min(u, v));
    t1 = Math.min(t1, Math.max(u, v));
    if (t0 > t1) return false;
  }
  return true;
};

export const autoRectClear = (
  polygon: HomeMapPolygonShape,
  edges: readonly HomeMapSegmentShape[],
  rect: AutoRect,
  margin: number,
): boolean => {
  if (!homeMapPointInPolygon(polygon, rect.at)) return false;
  const hx = rect.d / 2 + margin;
  const hy = rect.w / 2 + margin;
  return edges.every(
    (edge) => !segmentHitsBox(toLocal(rect, edge.from), toLocal(rect, edge.to), hx, hy),
  );
};
