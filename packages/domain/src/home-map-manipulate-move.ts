import { homeMapBoxCorners, homeMapEditSnapSize } from './home-map-manipulate-base';
import type {
  HomeMapEditBox,
  HomeMapGuideLine,
  HomeMapMoveContext,
  HomeMapMoveOptions,
  HomeMapMoveResult,
} from './home-map-manipulate-types';
import { homeMapHugWall, type HomeMapSnapWall } from './home-map-snap';

type Triple = readonly [number, number, number];

interface Extents {
  readonly x: Triple;
  readonly y: Triple;
}

interface AxisHit {
  readonly shift: number;
  readonly value: number;
  readonly kind: 'edge' | 'centre';
  readonly id: string;
  readonly across: Triple;
}

interface AxisTarget {
  readonly id: string;
  readonly line: Triple;
  readonly across: Triple;
}

const triple = (values: readonly number[]): Triple => {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return [low, (low + high) / 2, high];
};

const extentsOf = (box: HomeMapEditBox): Extents => {
  const corners = homeMapBoxCorners(box);
  return { x: triple(corners.map((c) => c.x)), y: triple(corners.map((c) => c.y)) };
};

const shifted = (values: Triple, by: number): Triple => [
  values[0] + by,
  values[1] + by,
  values[2] + by,
];

const axisHit = (mine: Triple, targets: readonly AxisTarget[], radius: number): AxisHit | null => {
  const hits = targets.flatMap((target) =>
    mine.flatMap((a, i) =>
      target.line.flatMap((b, j): AxisHit[] =>
        Math.abs(b - a) > radius
          ? []
          : [
              {
                shift: b - a,
                value: b,
                kind: i === 1 || j === 1 ? 'centre' : 'edge',
                id: target.id,
                across: target.across,
              },
            ],
      ),
    ),
  );
  return hits.reduce<AxisHit | null>(
    (best, hit) => (best && Math.abs(best.shift) <= Math.abs(hit.shift) ? best : hit),
    null,
  );
};

const guideLine = (
  hit: AxisHit,
  orientation: HomeMapGuideLine['orientation'],
  mineAcross: Triple,
): HomeMapGuideLine => {
  const low = Math.min(hit.across[0], mineAcross[0]);
  const high = Math.max(hit.across[2], mineAcross[2]);
  const vertical = orientation === 'vertical';
  return {
    orientation,
    kind: hit.kind,
    targetId: hit.id,
    from: vertical ? { x: hit.value, y: low } : { x: low, y: hit.value },
    to: vertical ? { x: hit.value, y: high } : { x: high, y: hit.value },
  };
};

const targetsOf = (
  others: HomeMapMoveContext<HomeMapSnapWall>['others'],
  main: 'x' | 'y',
): readonly AxisTarget[] =>
  others.map((other) => {
    const ext = extentsOf(other.box);
    return {
      id: other.id,
      line: main === 'x' ? ext.x : ext.y,
      across: main === 'x' ? ext.y : ext.x,
    };
  });

const guidesOf = (
  mine: Extents,
  xHit: AxisHit | null,
  yHit: AxisHit | null,
): readonly HomeMapGuideLine[] => [
  ...(xHit ? [guideLine(xHit, 'vertical', shifted(mine.y, yHit?.shift ?? 0))] : []),
  ...(yHit ? [guideLine(yHit, 'horizontal', shifted(mine.x, xHit?.shift ?? 0))] : []),
];

export const homeMapObjectGuides = (
  box: HomeMapEditBox,
  others: HomeMapMoveContext<HomeMapSnapWall>['others'],
  radius: number,
): {
  readonly dx: number | null;
  readonly dy: number | null;
  readonly guides: readonly HomeMapGuideLine[];
} => {
  const mine = extentsOf(box);
  const xHit = axisHit(mine.x, targetsOf(others, 'x'), radius);
  const yHit = axisHit(mine.y, targetsOf(others, 'y'), radius);
  return {
    dx: xHit?.shift ?? null,
    dy: yHit?.shift ?? null,
    guides: guidesOf(mine, xHit, yHit),
  };
};

export const homeMapMoveObject = <W extends HomeMapSnapWall>(
  box: HomeMapEditBox,
  desired: { readonly x: number; readonly y: number },
  context: HomeMapMoveContext<W>,
  options: HomeMapMoveOptions,
): HomeMapMoveResult<W> => {
  if (options.radiusM <= 0) {
    return { at: desired, rotation: box.rotation, snap: 'free', wall: null, guides: [] };
  }
  const hug = options.hugWalls
    ? homeMapHugWall(context.walls, { at: desired, depth: box.d, radius: options.radiusM })
    : null;
  if (hug) return { at: hug.at, rotation: hug.rotation, snap: 'wall', wall: hug.wall, guides: [] };
  const found = homeMapObjectGuides({ ...box, at: desired }, context.others, options.radiusM);
  const at = {
    x: found.dx === null ? homeMapEditSnapSize(desired.x, options.gridM) : desired.x + found.dx,
    y: found.dy === null ? homeMapEditSnapSize(desired.y, options.gridM) : desired.y + found.dy,
  };
  const grid = options.gridM === null ? 'free' : 'grid';
  const snap = found.guides.length > 0 ? 'object' : grid;
  return { at, rotation: box.rotation, snap, wall: null, guides: found.guides };
};
