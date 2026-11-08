import { DEFAULT_VACUUM_FINISH, type VacuumFinish } from '@smarteverything/domain/vacuum-finish';
import type { VacuumPose } from '@smarteverything/domain/vacuum-scene';
import type {
  RenderFloor,
  RenderPose,
  RenderSceneSource,
  RenderTrailRun,
  RenderZone,
} from '../render-scene';
import { styledWallHeight, type WallSpan, type WallStyle } from './cutaway';
import type { FloorTone } from './floor-looks';
import { VACUUM_QUALITY_TARGET } from './quality-target';
import { DEFAULT_STRUCTURE_OPTIONS, buildStructure } from './geometry-structure';
import {
  addPrism,
  createCollector,
  finishLayer,
  segmentRing,
  type LayerId,
  type MeshLayer,
  type Rgb,
  type Vec3,
} from './mesh';
import {
  buildDockLayer,
  buildRobotLayers,
  dockColoursOf,
  rgb,
  robotColoursOf,
  robotPlacement,
  type Placement,
} from './vacuum-models';
import {
  TRAIL_SEGMENT_CAP,
  buildTrailLayers,
  fitTrail,
  trailTriangles,
  type TrailColours,
} from './vacuum-trail';

export {
  ROBOT_HEIGHT_METRES,
  ROBOT_RADIUS_METRES,
  robotPlacement,
  turretElevation,
} from './vacuum-models';
export { simplifyPoints } from './vacuum-trail';

export type { LayerId, MeshLayer } from './mesh';
export type { WallSpan } from './cutaway';

export const NOMINAL_WALL_HEIGHT_METRES = 1.2;

const ZONE_HEIGHT_METRES = 0.5;

const VIRTUAL_WALL_HEIGHT_METRES = 0.35;

const VIRTUAL_WALL_THICKNESS_METRES = 0.05;

const ZONE_OPACITY = 0.35;

const VIRTUAL_WALL_OPACITY = 0.6;

const RADIUS_PADDING = 1.15;

const MINIMUM_RADIUS_METRES = 1;

const DEGREES_TO_RADIANS = Math.PI / 180;

export type SceneTheme = 'light' | 'dark';

export interface SceneOptions {
  readonly theme: SceneTheme;
  readonly finish: VacuumFinish;
}

export const DEFAULT_SCENE_OPTIONS: SceneOptions = {
  theme: 'light',
  finish: DEFAULT_VACUUM_FINISH,
};

export interface SceneLook {
  readonly floorTone: FloorTone;
  readonly wallStyle: WallStyle;
  readonly lowWallHeight: number;
  readonly cutsOpenings: boolean;
}

export const SOURCE_LOOKS: Readonly<Record<RenderSceneSource, SceneLook>> = {
  vacuum: {
    floorTone: 'room',
    wallStyle: 'low',
    lowWallHeight: NOMINAL_WALL_HEIGHT_METRES,
    cutsOpenings: false,
  },
  home_map: {
    floorTone: DEFAULT_STRUCTURE_OPTIONS.floorTone,
    wallStyle: DEFAULT_STRUCTURE_OPTIONS.wallStyle,
    lowWallHeight: DEFAULT_STRUCTURE_OPTIONS.lowWallHeight,
    cutsOpenings: true,
  },
};

export interface SceneInput {
  readonly key: string;
  readonly source: RenderSceneSource;
  readonly floor: RenderFloor;
}

interface Palette {
  readonly noGo: Rgb;
  readonly noMop: Rgb;
  readonly virtualWall: Rgb;
  readonly trail: TrailColours;
}

const PALETTES: Readonly<Record<SceneTheme, Palette>> = {
  light: {
    noGo: rgb(0xd0382d),
    noMop: rgb(0x2f6fd0),
    virtualWall: rgb(0xd0382d),
    trail: { sweep: rgb(0x3f8f5a), mop: rgb(0x2f8fbf) },
  },
  dark: {
    noGo: rgb(0xef5a4f),
    noMop: rgb(0x5a93ef),
    virtualWall: rgb(0xef5a4f),
    trail: { sweep: rgb(0x5fc07f), mop: rgb(0x5cbfee) },
  },
};

export interface RoomRange {
  readonly roomId: string;
  readonly firstTriangle: number;
  readonly triangleCount: number;
}

export interface SceneFrame {
  readonly centre: Vec3;
  readonly radius: number;
}

export interface SceneStats {
  readonly triangles: number;
  readonly drawCalls: number;
  readonly trailToleranceMetres: number;
  readonly trailSegments: number;
}

export interface SceneLabel {
  readonly roomId: string;
  readonly name: string;
  readonly position: Vec3;
}

export interface SceneGeometry {
  readonly version: string;
  readonly labels: readonly SceneLabel[];
  readonly extent: readonly Vec3[];
  readonly base: readonly MeshLayer[];
  readonly trail: readonly MeshLayer[];
  readonly robot: readonly MeshLayer[];
  readonly rooms: readonly RoomRange[];
  readonly walls: readonly WallSpan[];
  readonly cutHeight: number;
  readonly wallStyle: WallStyle;
  readonly lowWallHeight: number;
  readonly frame: SceneFrame;
  readonly dock: Placement | null;
  readonly stats: SceneStats;
}

export const vacuumPoseOf = (pose: RenderPose): VacuumPose => ({
  x: pose.x,
  y: pose.y,
  yaw: pose.yawDeg * DEGREES_TO_RADIANS,
});

const zonesOf = (floor: RenderFloor): readonly RenderZone[] => floor.vacuum?.zones ?? [];

const trailOf = (floor: RenderFloor): readonly RenderTrailRun[] => floor.vacuum?.trail ?? [];

function baseLayers(
  floor: RenderFloor,
  structure: ReturnType<typeof buildStructure>,
  options: SceneOptions,
): readonly MeshLayer[] {
  const palette = PALETTES[options.theme];
  const zones = zonesOf(floor);
  return present([
    structure.floor,
    structure.walls,
    structure.carpets,
    zoneLayer(
      'no-go',
      zones.filter((zone) => zone.kind === 'no_go'),
      palette.noGo,
    ),
    zoneLayer(
      'no-mop',
      zones.filter((zone) => zone.kind === 'no_mop'),
      palette.noMop,
    ),
    virtualWallLayer(zones, palette),
    dockLayerOf(floor, options),
  ]);
}

function structureOf(
  floor: RenderFloor,
  look: SceneLook,
  options: SceneOptions,
): ReturnType<typeof buildStructure> {
  return buildStructure(look.cutsOpenings ? floor : { ...floor, openings: [] }, {
    theme: options.theme,
    wallStyle: look.wallStyle,
    lowWallHeight: look.lowWallHeight,
    floorTone: look.floorTone,
  });
}

function zoneLayer(id: LayerId, zones: readonly RenderZone[], colour: Rgb): MeshLayer | null {
  const collector = createCollector();
  for (const zone of zones) {
    addPrism(collector, zone.points, { base: 0, height: ZONE_HEIGHT_METRES, colour });
  }
  return finishLayer(id, collector, ZONE_OPACITY);
}

function virtualWallLayer(zones: readonly RenderZone[], palette: Palette): MeshLayer | null {
  const collector = createCollector();
  for (const zone of zones.filter((candidate) => candidate.kind === 'wall')) {
    zone.points.forEach((from, index) => {
      const to = zone.points[index + 1];
      if (to === undefined) return;
      addPrism(collector, segmentRing(from, to, VIRTUAL_WALL_THICKNESS_METRES / 2), {
        base: 0,
        height: VIRTUAL_WALL_HEIGHT_METRES,
        colour: palette.virtualWall,
      });
    });
  }
  return finishLayer('virtual-walls', collector, VIRTUAL_WALL_OPACITY);
}

function wallTopOf(floor: RenderFloor, look: SceneLook): number {
  const tallest = floor.walls.reduce(
    (top, wall) => Math.max(top, wall.height),
    floor.ceilingHeight,
  );
  return styledWallHeight(look.wallStyle, tallest, look.lowWallHeight);
}

function extentOf(floor: RenderFloor, height: number): readonly Vec3[] {
  if (floor.bounds === null) return [];
  const { minX, minY, maxX, maxY } = floor.bounds;
  return [0, height].flatMap((y) => [
    [minX, y, -minY] as const,
    [maxX, y, -minY] as const,
    [minX, y, -maxY] as const,
    [maxX, y, -maxY] as const,
  ]);
}

function present(layers: readonly (MeshLayer | null)[]): readonly MeshLayer[] {
  return layers.flatMap((layer) => (layer === null ? [] : [layer]));
}

function frameOf(floor: RenderFloor): SceneFrame {
  if (floor.bounds === null) return { centre: [0, 0, 0], radius: MINIMUM_RADIUS_METRES };
  const { minX, minY, maxX, maxY } = floor.bounds;
  return {
    centre: [(minX + maxX) / 2, 0, -(minY + maxY) / 2],
    radius: Math.max(
      MINIMUM_RADIUS_METRES,
      (Math.hypot(maxX - minX, maxY - minY) / 2) * RADIUS_PADDING,
    ),
  };
}

function totalTriangles(layers: readonly MeshLayer[]): number {
  return layers.reduce((sum, layer) => sum + layer.triangles, 0);
}

function dockLayerOf(floor: RenderFloor, options: SceneOptions): MeshLayer | null {
  const dock = floor.vacuum?.dock ?? null;
  return dock === null
    ? null
    : buildDockLayer(vacuumPoseOf(dock), dockColoursOf(options.finish, options.theme));
}

function robotLayersOf(floor: RenderFloor, options: SceneOptions): readonly MeshLayer[] {
  return floor.vacuum === null
    ? []
    : buildRobotLayers(robotColoursOf(options.finish, options.theme));
}

function trailLayersOf(
  floor: RenderFloor,
  budget: number,
  palette: Palette,
): { readonly layers: readonly MeshLayer[]; readonly fitted: ReturnType<typeof fitTrail> } {
  const target = Math.floor((VACUUM_QUALITY_TARGET.triangles - 1 - budget) / trailTriangles(1));
  const fitted = fitTrail(trailOf(floor), Math.max(0, Math.min(TRAIL_SEGMENT_CAP, target)));
  return { layers: buildTrailLayers(fitted, palette.trail), fitted };
}

export function buildSceneGeometry(
  input: SceneInput,
  options: SceneOptions = DEFAULT_SCENE_OPTIONS,
): SceneGeometry {
  const { floor } = input;
  const look = SOURCE_LOOKS[input.source];
  const structure = structureOf(floor, look, options);
  const base = baseLayers(floor, structure, options);
  const robot = robotLayersOf(floor, options);
  const trail = trailLayersOf(
    floor,
    totalTriangles(base) + totalTriangles(robot),
    PALETTES[options.theme],
  );
  const dock = floor.vacuum?.dock ?? null;
  return {
    version: input.key,
    labels: structure.labels,
    extent: extentOf(floor, wallTopOf(floor, look)),
    base,
    trail: trail.layers,
    robot,
    rooms: structure.rooms.map(({ roomId, firstTriangle, triangleCount }) => ({
      roomId,
      firstTriangle,
      triangleCount,
    })),
    walls: structure.spans,
    cutHeight: structure.cutHeight,
    wallStyle: look.wallStyle,
    lowWallHeight: look.lowWallHeight,
    frame: frameOf(floor),
    dock: dock === null ? null : robotPlacement(vacuumPoseOf(dock)),
    stats: {
      triangles: totalTriangles(base) + totalTriangles(trail.layers) + totalTriangles(robot),
      drawCalls: base.length + trail.layers.length + robot.length,
      trailToleranceMetres: trail.fitted.toleranceMetres,
      trailSegments: trail.fitted.segments,
    },
  };
}

export function buildLiveTrail(
  runs: readonly RenderTrailRun[],
  theme: SceneTheme,
): readonly MeshLayer[] {
  return buildTrailLayers(fitTrail(runs, TRAIL_SEGMENT_CAP), PALETTES[theme].trail);
}
