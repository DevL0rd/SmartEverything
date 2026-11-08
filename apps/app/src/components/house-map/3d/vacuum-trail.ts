import type { RenderTrailRun } from '../render-scene';
import {
  addFlat,
  createCollector,
  finishLayer,
  segmentRing,
  type MeshLayer,
  type Rgb,
} from './mesh';
import { simplifyPoints } from './simplify';

export { simplifyPoints };

export const TRAIL_WIDTH_METRES = 0.06;

export const TRAIL_HEIGHT_METRES = 0.03;

export const TRAIL_SEGMENT_CAP = 20_000;

export const TRAIL_MINIMUM_TOLERANCE_METRES = 0.01;

export const TRAIL_MAXIMUM_TOLERANCE_METRES = 2;

const TOLERANCE_GROWTH = 2;

const TRIANGLES_PER_SEGMENT = 2;

export interface TrailColours {
  readonly sweep: Rgb;
  readonly mop: Rgb;
}

export interface FittedTrail {
  readonly runs: readonly RenderTrailRun[];
  readonly toleranceMetres: number;
  readonly segments: number;
}

function segmentsOf(runs: readonly RenderTrailRun[]): number {
  return runs.reduce((sum, run) => sum + Math.max(0, run.points.length - 1), 0);
}

function simplifyRuns(runs: readonly RenderTrailRun[], tolerance: number): RenderTrailRun[] {
  return runs.map((run) => ({ ...run, points: simplifyPoints(run.points, tolerance) }));
}

export function fitTrail(runs: readonly RenderTrailRun[], maxSegments: number): FittedTrail {
  let fitted: readonly RenderTrailRun[] = runs.filter((run) => run.points.length >= 2);
  let tolerance = 0;
  while (segmentsOf(fitted) > maxSegments && tolerance < TRAIL_MAXIMUM_TOLERANCE_METRES) {
    tolerance = tolerance === 0 ? TRAIL_MINIMUM_TOLERANCE_METRES : tolerance * TOLERANCE_GROWTH;
    fitted = simplifyRuns(fitted, tolerance);
  }
  return { runs: fitted, toleranceMetres: tolerance, segments: segmentsOf(fitted) };
}

export function trailTriangles(segments: number): number {
  return segments * TRIANGLES_PER_SEGMENT;
}

function ribbonLayer(
  id: 'trail-sweep' | 'trail-mop',
  runs: readonly RenderTrailRun[],
  colour: Rgb,
): MeshLayer | null {
  const collector = createCollector();
  for (const run of runs) {
    run.points.forEach((from, index) => {
      const to = run.points[index + 1];
      if (to === undefined) return;
      addFlat(collector, segmentRing(from, to, TRAIL_WIDTH_METRES / 2), {
        y: TRAIL_HEIGHT_METRES,
        colour,
      });
    });
  }
  return finishLayer(id, collector, 1);
}

export function buildTrailLayers(trail: FittedTrail, colours: TrailColours): readonly MeshLayer[] {
  const layers = [
    ribbonLayer(
      'trail-sweep',
      trail.runs.filter((run) => !run.mopping),
      colours.sweep,
    ),
    ribbonLayer(
      'trail-mop',
      trail.runs.filter((run) => run.mopping),
      colours.mop,
    ),
  ];
  return layers.flatMap((layer) => (layer === null ? [] : [layer]));
}
