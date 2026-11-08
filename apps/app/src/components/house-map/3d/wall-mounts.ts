import type { HomeMapWallAttachment } from '@smarteverything/domain';
import {
  BufferGeometry,
  Line,
  LineDashedMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three';
import type { RenderFloor, RenderPoint, RenderWall } from '../render-scene';
import { CUT_HEIGHT_METRES, styledWallHeight, type WallStyle } from './cutaway';
import { groundPosition } from './mesh';
import { basic, mesh, type OverlayLook } from './overlay-kit';

export const STEM_M = { dash: 0.05, gap: 0.04, foot: 0.025, clear: 0.05 } as const;

const EPS = 1e-9;

export interface WallMountItem {
  readonly id: string;
  readonly wallId: string;
  readonly offset: number;
  readonly side: 'left' | 'right';
  readonly height: number;
  readonly device: boolean;
}

export type WallCut = ReadonlyMap<string, number>;

export interface WallFacePose {
  readonly at: RenderPoint;
  readonly normal: RenderPoint;
  readonly facingRad: number;
}

export function wallFacePose(
  wall: RenderWall,
  item: Pick<WallMountItem, 'offset' | 'side'>,
): WallFacePose | null {
  const length = Math.hypot(wall.to.x - wall.from.x, wall.to.y - wall.from.y);
  if (length < EPS) return null;
  const dir = { x: (wall.to.x - wall.from.x) / length, y: (wall.to.y - wall.from.y) / length };
  const normal = item.side === 'left' ? { x: -dir.y, y: dir.x } : { x: dir.y, y: -dir.x };
  const along = Math.min(length, Math.max(0, item.offset));
  const half = wall.thickness / 2;
  return {
    at: {
      x: wall.from.x + dir.x * along + normal.x * half,
      y: wall.from.y + dir.y * along + normal.y * half,
    },
    normal,
    facingRad: Math.atan2(normal.y, normal.x),
  };
}

export interface MountedPose {
  readonly at: RenderPoint;
  readonly rotationDeg: number;
  readonly normal: RenderPoint | null;
}

export interface MountedSubject {
  readonly at: RenderPoint;
  readonly rotationDeg: number;
  readonly wall: HomeMapWallAttachment | null;
}

const DEGREES_PER_RADIAN = 180 / Math.PI;

export function mountedPose(
  walls: ReadonlyMap<string, RenderWall>,
  subject: MountedSubject,
): MountedPose {
  const wall = subject.wall === null ? undefined : walls.get(subject.wall.wallId);
  const pose =
    wall === undefined || subject.wall === null ? null : wallFacePose(wall, subject.wall);
  if (pose === null) return { at: subject.at, rotationDeg: subject.rotationDeg, normal: null };
  return { at: pose.at, rotationDeg: pose.facingRad * DEGREES_PER_RADIAN, normal: pose.normal };
}

export interface WallView {
  readonly style: WallStyle;
  readonly cutIds: ReadonlySet<string>;
  readonly lowHeight: number;
}

const mountOf = (
  id: string,
  wall: HomeMapWallAttachment,
  height: number,
  device: boolean,
): WallMountItem => ({
  id,
  wallId: wall.wallId,
  offset: wall.offset,
  side: wall.side,
  height,
  device,
});

export function wallMountItems(
  floor: Pick<RenderFloor, 'placements' | 'objects'>,
): readonly WallMountItem[] {
  const devices = floor.placements.flatMap((placement): readonly WallMountItem[] =>
    placement.wall === null
      ? []
      : [mountOf(placement.deviceId, placement.wall, placement.height, true)],
  );
  const decor = floor.objects.flatMap((object): readonly WallMountItem[] =>
    object.wall === null ? [] : [mountOf(object.id, object.wall, object.elevation, false)],
  );
  return [...devices, ...decor];
}

export function wallCutOf(walls: readonly RenderWall[], view: WallView): WallCut {
  return new Map(
    walls.flatMap((wall): readonly (readonly [string, number])[] => {
      if (view.style === 'low') {
        const low = styledWallHeight('low', wall.height, view.lowHeight);
        const top = view.cutIds.has(wall.id) ? Math.min(low, CUT_HEIGHT_METRES) : low;
        return top < wall.height ? [[wall.id, top]] : [];
      }
      if (view.style === 'cutaway' && view.cutIds.has(wall.id)) {
        return [[wall.id, Math.min(wall.height, CUT_HEIGHT_METRES)]];
      }
      return [];
    }),
  );
}

export function wallMountKey(items: readonly WallMountItem[], cut: WallCut): string {
  const tops = items.map((item) => cut.get(item.wallId) ?? null);
  return JSON.stringify([items, tops]);
}

function stem(
  item: WallMountItem,
  base: RenderPoint,
  span: { readonly y: number; readonly top: number },
  look: OverlayLook,
): readonly Object3D[] {
  const colour = item.device ? look.accent : look.muted;
  const points = [
    new Vector3(...groundPosition(base, span.y + span.top)),
    new Vector3(...groundPosition(base, span.y + item.height - STEM_M.clear)),
  ];
  const line = new Line(
    new BufferGeometry().setFromPoints(points),
    new LineDashedMaterial({
      color: colour,
      transparent: true,
      opacity: 0.9,
      dashSize: STEM_M.dash,
      gapSize: STEM_M.gap,
    }),
  );
  line.name = `stem:${item.id}`;
  line.computeLineDistances();
  const foot = mesh(
    `stem-foot:${item.id}`,
    new SphereGeometry(STEM_M.foot, 10, 6),
    basic(colour, 1),
    4,
  );
  foot.position.set(...groundPosition(base, span.y + span.top));
  return [line, foot];
}

export function buildWallStems(input: {
  readonly walls: readonly RenderWall[];
  readonly items: readonly WallMountItem[];
  readonly cut: WallCut;
  readonly y: number;
  readonly look: OverlayLook;
}): readonly Object3D[] {
  const byId = new Map(input.walls.map((wall) => [wall.id, wall]));
  return input.items.flatMap((item) => {
    const wall = byId.get(item.wallId);
    const top = input.cut.get(item.wallId);
    if (wall === undefined || top === undefined) return [];
    if (item.height - STEM_M.clear <= top) return [];
    const pose = wallFacePose(wall, item);
    if (pose === null) return [];
    return stem(item, pose.at, { y: input.y, top }, input.look);
  });
}
