import type { VacuumPoint, VacuumPose } from '@smarteverything/domain';
import { OMNI_STATION_FOOTPRINT } from '@smarteverything/domain/model-footprint';
import type { VacuumFinish } from '@smarteverything/domain/vacuum-finish';
import {
  addPrism,
  createCollector,
  finishLayer,
  type Collector,
  type MeshLayer,
  type Rgb,
  type Vec3,
} from './mesh';
import {
  addAnnulus,
  addBand,
  addCap,
  mix,
  roundedRing,
  shade,
  type Lathe,
  type Paint,
  type Profile,
} from './vacuum-solids';

export const ROBOT_RADIUS_METRES = 0.175;

export const ROBOT_HEIGHT_METRES = 0.09;

export const TURRET_RADIUS_METRES = 0.04;

export const TURRET_HEIGHT_METRES = 0.03;

export const TURRET_TRAVEL_METRES = 0.02;

const TURRET_FORWARD_METRES = 0.03;

const TURRET_FLUSH_METRES = 0.004;

const BODY_SEGMENTS = 40;

const TURRET_SEGMENTS = 24;

const BUMPER_HALF_ANGLE = 1.08;

const WINDOW: Rgb = [0.09, 0.1, 0.12];

const GLASS: Rgb = [0.16, 0.19, 0.26];

const WHITE: Rgb = [1, 1, 1];

const ROBOT_PROFILE: readonly Profile[] = [
  { r: 0.16, y: 0 },
  { r: 0.175, y: 0.02 },
  { r: 0.175, y: 0.036 },
  { r: 0.175, y: 0.066 },
  { r: 0.175, y: 0.074 },
  { r: 0.169, y: 0.085 },
  { r: 0.158, y: ROBOT_HEIGHT_METRES },
];

const TURRET_PROFILE: readonly Profile[] = [
  { r: TURRET_RADIUS_METRES, y: 0 },
  { r: TURRET_RADIUS_METRES, y: TURRET_HEIGHT_METRES - 0.004 },
  { r: TURRET_RADIUS_METRES - 0.004, y: TURRET_HEIGHT_METRES },
];

const TOWER_MIN: VacuumPoint = { x: -0.4, y: -0.22 };

const TOWER_MAX: VacuumPoint = { x: -0.05, y: 0.22 };

const RAMP_MIN: VacuumPoint = { x: -0.05, y: -0.18 };

const RAMP_MAX: VacuumPoint = { x: 0.25, y: 0.18 };

const CLEAN_TANK: Rgb = [0.36, 0.62, 0.9];

const DIRTY_TANK: Rgb = [0.6, 0.55, 0.46];

const STATUS_LIGHT: Rgb = [0.42, 0.66, 1];

const CONTACT: Rgb = [0.85, 0.7, 0.36];

export const DOCK_TOWER_HEIGHT_METRES = OMNI_STATION_FOOTPRINT.h;

export const DOCK_RAMP_HEIGHT_METRES = 0.02;

export interface RobotColours {
  readonly body: Rgb;
  readonly marker: Rgb;
  readonly turret: Rgb;
}

export interface DockColours {
  readonly tower: Rgb;
  readonly ramp: Rgb;
}

export type ModelTheme = 'light' | 'dark';

type Themed<T> = Readonly<Record<ModelTheme, T>>;

const RED_STEP = 65_536;

const CHANNEL_RANGE = 256;

const CHANNEL_MAX = 255;

export function rgb(hex: number): Rgb {
  return [
    (Math.floor(hex / RED_STEP) % CHANNEL_RANGE) / CHANNEL_MAX,
    (Math.floor(hex / CHANNEL_RANGE) % CHANNEL_RANGE) / CHANNEL_MAX,
    (hex % CHANNEL_RANGE) / CHANNEL_MAX,
  ];
}

interface FinishPaint {
  readonly body: number;
  readonly turret: number;
  readonly tower: number;
  readonly ramp: number;
}

const FINISH_PAINT: Readonly<Record<VacuumFinish, Themed<FinishPaint>>> = {
  graphite: {
    light: { body: 0x5c5f67, turret: 0x1e1f23, tower: 0x7a7d85, ramp: 0x3e4046 },
    dark: { body: 0x6c6f78, turret: 0x18191c, tower: 0x82858d, ramp: 0x2f3135 },
  },
  white: {
    light: { body: 0xf4f3f0, turret: 0x3a3a3a, tower: 0xe8e6e1, ramp: 0x5e5c58 },
    dark: { body: 0xe9e7e2, turret: 0x20201f, tower: 0xc9c6c0, ramp: 0x2c2b29 },
  },
  black: {
    light: { body: 0x2c2d33, turret: 0x141518, tower: 0x36373d, ramp: 0x1e1f23 },
    dark: { body: 0x3e3f47, turret: 0x101114, tower: 0x484950, ramp: 0x1a1b1e },
  },
};

const MARKER: Themed<Rgb> = { light: rgb(0xe07a10), dark: rgb(0xf09030) };

export function robotColoursOf(finish: VacuumFinish, theme: ModelTheme): RobotColours {
  const paint = FINISH_PAINT[finish][theme];
  return { body: rgb(paint.body), marker: MARKER[theme], turret: rgb(paint.turret) };
}

export function dockColoursOf(finish: VacuumFinish, theme: ModelTheme): DockColours {
  const paint = FINISH_PAINT[finish][theme];
  return { tower: rgb(paint.tower), ramp: rgb(paint.ramp) };
}

export interface Placement {
  readonly position: Vec3;
  readonly rotationY: number;
}

function isFront(angle: number): boolean {
  return angle < BUMPER_HALF_ANGLE || angle > 2 * Math.PI - BUMPER_HALF_ANGLE;
}

function solid(colour: Rgb): Paint {
  return (): Rgb => colour;
}

function bodyPaint(colours: RobotColours, band: number): Paint {
  const side = shade(colours.body, 0.94);
  if (band === 0) return solid(shade(colours.body, 0.5));
  if (band === 2) return (angle: number): Rgb => (isFront(angle) ? WINDOW : side);
  return solid(band < 4 ? side : colours.body);
}

function addLathe(
  collector: Collector,
  lathe: Lathe,
  profile: readonly Profile[],
  paint: (band: number) => Paint,
): void {
  profile.slice(1).forEach((to, band) => {
    const from = profile[band] ?? to;
    addBand(collector, lathe, [from, to], paint(band));
  });
}

export function robotPlacement(pose: VacuumPose): Placement {
  return { position: [pose.x, 0, -pose.y], rotationY: pose.yaw };
}

export function turretElevation(raised: number): number {
  const fraction = Math.max(0, Math.min(1, raised));
  return (
    ROBOT_HEIGHT_METRES +
    TURRET_FLUSH_METRES -
    TURRET_HEIGHT_METRES +
    fraction * TURRET_TRAVEL_METRES
  );
}

export function buildRobotLayers(colours: RobotColours): readonly MeshLayer[] {
  const body = createCollector();
  const lathe: Lathe = { centre: { x: 0, y: 0 }, segments: BODY_SEGMENTS };
  addLathe(body, lathe, ROBOT_PROFILE, (band) => bodyPaint(colours, band));
  addCap(body, lathe, { r: 0.158, y: ROBOT_HEIGHT_METRES }, colours.body);
  addAnnulus(
    body,
    lathe,
    { inner: 0.116, outer: 0.119, y: ROBOT_HEIGHT_METRES + 0.0004 },
    shade(colours.body, 0.82),
  );
  const well: Lathe = { centre: { x: TURRET_FORWARD_METRES, y: 0 }, segments: TURRET_SEGMENTS };
  addAnnulus(
    body,
    well,
    { inner: 0.046, outer: 0.054, y: ROBOT_HEIGHT_METRES + 0.0006 },
    colours.marker,
  );
  addCap(body, well, { r: 0.046, y: ROBOT_HEIGHT_METRES + 0.0006 }, shade(colours.turret, 0.7));
  const turret = createCollector();
  const turretLathe: Lathe = {
    centre: { x: TURRET_FORWARD_METRES, y: 0 },
    segments: TURRET_SEGMENTS,
  };
  addLathe(turret, turretLathe, TURRET_PROFILE, () => solid(colours.turret));
  addCap(
    turret,
    turretLathe,
    { r: TURRET_RADIUS_METRES - 0.004, y: TURRET_HEIGHT_METRES },
    mix(colours.turret, GLASS, 0.6),
  );
  addAnnulus(
    turret,
    turretLathe,
    { inner: 0.012, outer: 0.024, y: TURRET_HEIGHT_METRES + 0.0004 },
    mix(GLASS, WHITE, 0.25),
  );
  return [finishLayer('robot-body', body, 1), finishLayer('robot-turret', turret, 1)].flatMap(
    (layer) => (layer === null ? [] : [layer]),
  );
}

function placed(ring: readonly VacuumPoint[], dock: VacuumPose): readonly VacuumPoint[] {
  const cosine = Math.cos(dock.yaw);
  const sine = Math.sin(dock.yaw);
  return ring.map((point) => ({
    x: dock.x + point.x * cosine - point.y * sine,
    y: dock.y + point.x * sine + point.y * cosine,
  }));
}

interface FrontPart {
  readonly from: VacuumPoint;
  readonly to: VacuumPoint;
  readonly base: number;
  readonly height: number;
}

const FACE = TOWER_MAX.x;

const TANKS: readonly (readonly [FrontPart, Rgb])[] = [
  [
    { from: { x: FACE, y: -0.19 }, to: { x: FACE + 0.006, y: -0.01 }, base: 0.3, height: 0.19 },
    CLEAN_TANK,
  ],
  [
    { from: { x: FACE, y: 0.01 }, to: { x: FACE + 0.006, y: 0.19 }, base: 0.3, height: 0.19 },
    DIRTY_TANK,
  ],
  [
    { from: { x: FACE, y: -0.012 }, to: { x: FACE + 0.006, y: 0.012 }, base: 0.515, height: 0.016 },
    STATUS_LIGHT,
  ],
];

const BAY: FrontPart = {
  from: { x: FACE - 0.02, y: -0.17 },
  to: { x: FACE + 0.003, y: 0.17 },
  base: DOCK_RAMP_HEIGHT_METRES,
  height: 0.2,
};

const LID_INSET = 0.02;

function box(collector: Collector, dock: VacuumPose, part: FrontPart, colour: Rgb): void {
  addPrism(collector, placed(roundedRing(part.from, part.to, 0.004, 1), dock), {
    base: part.base,
    height: part.height,
    colour,
  });
}

function addTowerFront(collector: Collector, dock: VacuumPose, colours: DockColours): void {
  TANKS.forEach(([part, colour]) => {
    box(collector, dock, part, colour);
  });
  box(collector, dock, BAY, shade(colours.ramp, 0.8));
  const lid = roundedRing(
    { x: TOWER_MIN.x + LID_INSET, y: TOWER_MIN.y + LID_INSET },
    { x: TOWER_MAX.x - LID_INSET, y: TOWER_MAX.y - LID_INSET },
    0.03,
    3,
  );
  addPrism(collector, placed(lid, dock), {
    base: DOCK_TOWER_HEIGHT_METRES,
    height: 0.006,
    colour: shade(colours.tower, 0.9),
  });
}

function addRamp(collector: Collector, dock: VacuumPose, colours: DockColours): void {
  addPrism(collector, placed(roundedRing(RAMP_MIN, RAMP_MAX, 0.03, 3), dock), {
    base: 0,
    height: DOCK_RAMP_HEIGHT_METRES,
    colour: colours.ramp,
  });
  for (const y of [-0.05, 0.05]) {
    const contact = { from: { x: 0.02, y: y - 0.025 }, to: { x: 0.035, y: y + 0.025 } };
    box(collector, dock, { ...contact, base: DOCK_RAMP_HEIGHT_METRES, height: 0.002 }, CONTACT);
  }
}

export function buildDockLayer(dock: VacuumPose, colours: DockColours): MeshLayer | null {
  const collector = createCollector();
  addRamp(collector, dock, colours);
  addPrism(collector, placed(roundedRing(TOWER_MIN, TOWER_MAX, 0.035, 3), dock), {
    base: 0,
    height: DOCK_TOWER_HEIGHT_METRES,
    colour: colours.tower,
  });
  addTowerFront(collector, dock, colours);
  return finishLayer('dock', collector, 1);
}
