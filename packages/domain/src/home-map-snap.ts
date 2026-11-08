import {
  homeMapDistance,
  homeMapWallLength,
  type HomeMapSegmentShape,
  type HomeMapVec,
} from './home-map-geometry';

export const HOME_MAP_WALL_ANGLE_STEP_DEG = 45;
export const HOME_MAP_ROTATION_STEP_DEG = 15;
export const HOME_MAP_GRID_M = 0.1;
export const HOME_MAP_GRID_FINE_M = 0.05;

export interface HomeMapSnapWall extends HomeMapSegmentShape {
  readonly thickness: number;
}

export interface HomeMapSnapSettings {
  readonly radius: number;
  readonly gridM: number | null;
  readonly points: boolean;
  readonly guides: boolean;
  readonly anchor: HomeMapVec | null;
  readonly angleStepDeg: number | null;
}

export type HomeMapSnapKind =
  'endpoint' | 'midpoint' | 'intersection' | 'guide' | 'angle' | 'grid' | 'free';

export interface HomeMapSnapGuide {
  readonly kind: 'extension' | 'angle';
  readonly from: HomeMapVec;
  readonly to: HomeMapVec;
}

export interface HomeMapSnapResult {
  readonly point: HomeMapVec;
  readonly kind: HomeMapSnapKind;
  readonly guides: readonly HomeMapSnapGuide[];
}

export interface HomeMapHugInput {
  readonly at: HomeMapVec;
  readonly depth: number;
  readonly radius: number;
}

export interface HomeMapHugResult<W extends HomeMapSnapWall> {
  readonly wall: W;
  readonly at: HomeMapVec;
  readonly normal: HomeMapVec;
  readonly rotation: number;
}

interface SnapLine {
  readonly kind: 'extension' | 'angle';
  readonly origin: HomeMapVec;
  readonly dir: HomeMapVec;
  readonly from: HomeMapVec;
}

const EPS = 1e-9;

const cross = (a: HomeMapVec, b: HomeMapVec): number => a.x * b.y - a.y * b.x;

const dot = (a: HomeMapVec, b: HomeMapVec): number => a.x * b.x + a.y * b.y;

const minus = (a: HomeMapVec, b: HomeMapVec): HomeMapVec => ({ x: a.x - b.x, y: a.y - b.y });

const along = (origin: HomeMapVec, dir: HomeMapVec, t: number): HomeMapVec => ({
  x: origin.x + dir.x * t,
  y: origin.y + dir.y * t,
});

const unit = (from: HomeMapVec, to: HomeMapVec): HomeMapVec | null => {
  const length = homeMapDistance(from, to);
  return length < EPS ? null : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
};

const lineDistance = (line: SnapLine, point: HomeMapVec): number =>
  Math.abs(cross(minus(point, line.origin), line.dir));

const projectOnLine = (line: SnapLine, point: HomeMapVec): HomeMapVec =>
  along(line.origin, line.dir, dot(minus(point, line.origin), line.dir));

const intersect = (a: SnapLine, b: SnapLine): HomeMapVec | null => {
  const denominator = cross(a.dir, b.dir);
  if (Math.abs(denominator) < EPS) return null;
  return along(a.origin, a.dir, cross(minus(b.origin, a.origin), b.dir) / denominator);
};

export const homeMapSnapRotation = (degrees: number, stepDeg: number | null): number => {
  const stepped = stepDeg === null ? degrees : Math.round(degrees / stepDeg) * stepDeg;
  return ((stepped % 360) + 360) % 360;
};

const pointCandidates = (
  walls: readonly HomeMapSnapWall[],
  extra: readonly HomeMapVec[],
): readonly { readonly point: HomeMapVec; readonly kind: 'endpoint' | 'midpoint' }[] => [
  ...walls.flatMap((wall) => [
    { point: wall.from, kind: 'endpoint' as const },
    { point: wall.to, kind: 'endpoint' as const },
  ]),
  ...extra.map((point) => ({ point, kind: 'endpoint' as const })),
  ...walls.map((wall) => ({
    point: { x: (wall.from.x + wall.to.x) / 2, y: (wall.from.y + wall.to.y) / 2 },
    kind: 'midpoint' as const,
  })),
];

const snapToPoints = (
  point: HomeMapVec,
  walls: readonly HomeMapSnapWall[],
  extra: readonly HomeMapVec[],
  radius: number,
): HomeMapSnapResult | null => {
  let best: { point: HomeMapVec; kind: 'endpoint' | 'midpoint' } | null = null;
  let bestDistance = radius;
  for (const candidate of pointCandidates(walls, extra)) {
    const distance = homeMapDistance(candidate.point, point);
    if (distance <= bestDistance && (best === null || distance < bestDistance)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best ? { point: best.point, kind: best.kind, guides: [] } : null;
};

const snapToGrid = (point: HomeMapVec, grid: number | null): HomeMapVec =>
  grid === null
    ? point
    : { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid };

const gridOnLine = (point: HomeMapVec, line: SnapLine, grid: number | null): HomeMapVec => {
  if (grid === null) return point;
  const candidates: HomeMapVec[] = [];
  if (Math.abs(line.dir.x) > EPS) {
    const x = Math.round(point.x / grid) * grid;
    candidates.push(along(line.origin, line.dir, (x - line.origin.x) / line.dir.x));
  }
  if (Math.abs(line.dir.y) > EPS) {
    const y = Math.round(point.y / grid) * grid;
    candidates.push(along(line.origin, line.dir, (y - line.origin.y) / line.dir.y));
  }
  return (
    candidates.sort((a, b) => homeMapDistance(a, point) - homeMapDistance(b, point))[0] ?? point
  );
};

const angleRay = (point: HomeMapVec, settings: HomeMapSnapSettings): SnapLine | null => {
  const { anchor, angleStepDeg } = settings;
  if (!anchor || angleStepDeg === null || !unit(anchor, point)) return null;
  const step = (angleStepDeg * Math.PI) / 180;
  const angle = Math.round(Math.atan2(point.y - anchor.y, point.x - anchor.x) / step) * step;
  return {
    kind: 'angle',
    origin: anchor,
    dir: { x: Math.cos(angle), y: Math.sin(angle) },
    from: anchor,
  };
};

const extensionLines = (
  walls: readonly HomeMapSnapWall[],
  point: HomeMapVec,
  radius: number,
): readonly SnapLine[] =>
  walls
    .flatMap((wall): SnapLine[] => {
      const dir = unit(wall.from, wall.to);
      if (!dir) return [];
      const nearEnd = homeMapDistance(wall.to, point) < homeMapDistance(wall.from, point);
      return [{ kind: 'extension', origin: wall.from, dir, from: nearEnd ? wall.to : wall.from }];
    })
    .filter((line) => lineDistance(line, point) <= radius)
    .sort((a, b) => lineDistance(a, point) - lineDistance(b, point));

const guideOf = (line: SnapLine, to: HomeMapVec): HomeMapSnapGuide => ({
  kind: line.kind,
  from: line.from,
  to,
});

const snapOnRay = (
  ray: SnapLine,
  guides: readonly SnapLine[],
  point: HomeMapVec,
  settings: HomeMapSnapSettings,
): HomeMapSnapResult => {
  const base = projectOnLine(ray, point);
  const hit = guides
    .map((line) => ({ line, at: intersect(ray, line) }))
    .flatMap((entry) => (entry.at ? [{ line: entry.line, at: entry.at }] : []))
    .filter((entry) => homeMapDistance(entry.at, base) <= settings.radius)
    .sort((a, b) => homeMapDistance(a.at, base) - homeMapDistance(b.at, base))[0];
  if (hit) {
    return {
      point: hit.at,
      kind: 'intersection',
      guides: [guideOf(ray, hit.at), guideOf(hit.line, hit.at)],
    };
  }
  const snapped = gridOnLine(base, ray, settings.gridM);
  return { point: snapped, kind: 'angle', guides: [guideOf(ray, snapped)] };
};

const snapOnGuides = (
  guides: readonly SnapLine[],
  point: HomeMapVec,
  settings: HomeMapSnapSettings,
): HomeMapSnapResult | null => {
  const first = guides[0];
  if (!first) return null;
  for (const second of guides.slice(1)) {
    const at = intersect(first, second);
    if (at && homeMapDistance(at, point) <= settings.radius) {
      return {
        point: at,
        kind: 'intersection',
        guides: [guideOf(first, at), guideOf(second, at)],
      };
    }
  }
  const snapped = gridOnLine(projectOnLine(first, point), first, settings.gridM);
  return { point: snapped, kind: 'guide', guides: [guideOf(first, snapped)] };
};

export const homeMapSnapPoint = (
  point: HomeMapVec,
  walls: readonly HomeMapSnapWall[],
  settings: HomeMapSnapSettings,
  extraPoints: readonly HomeMapVec[] = [],
): HomeMapSnapResult => {
  if (settings.points) {
    const onPoint = snapToPoints(point, walls, extraPoints, settings.radius);
    if (onPoint) return onPoint;
  }
  const guides = settings.guides ? extensionLines(walls, point, settings.radius) : [];
  const ray = angleRay(point, settings);
  const result = ray
    ? snapOnRay(ray, guides, point, settings)
    : snapOnGuides(guides, point, settings);
  if (result) return result;
  const snapped = snapToGrid(point, settings.gridM);
  return { point: snapped, kind: settings.gridM === null ? 'free' : 'grid', guides: [] };
};

interface WallSide {
  readonly wall: HomeMapSnapWall;
  readonly foot: HomeMapVec;
  readonly normal: HomeMapVec;
  readonly distance: number;
}

const wallSide = (wall: HomeMapSnapWall, point: HomeMapVec): WallSide | null => {
  const dir = unit(wall.from, wall.to);
  if (!dir) return null;
  const rel = minus(point, wall.from);
  const t = dot(rel, dir);
  if (t < 0 || t > homeMapWallLength(wall)) return null;
  const side = cross(dir, rel);
  const sign = side < 0 ? -1 : 1;
  return {
    wall,
    foot: along(wall.from, dir, t),
    normal: { x: -dir.y * sign, y: dir.x * sign },
    distance: Math.abs(side),
  };
};

export const homeMapHugWall = <W extends HomeMapSnapWall>(
  walls: readonly W[],
  input: HomeMapHugInput,
): HomeMapHugResult<W> | null => {
  let best: (WallSide & { readonly source: W }) | null = null;
  for (const wall of walls) {
    const side = wallSide(wall, input.at);
    if (side && (best === null || side.distance < best.distance)) best = { ...side, source: wall };
  }
  if (!best) return null;
  const reach = best.wall.thickness / 2 + input.depth / 2;
  if (best.distance - reach > input.radius) return null;
  return {
    wall: best.source,
    at: along(best.foot, best.normal, reach),
    normal: best.normal,
    rotation: homeMapSnapRotation((Math.atan2(best.normal.y, best.normal.x) * 180) / Math.PI, null),
  };
};
