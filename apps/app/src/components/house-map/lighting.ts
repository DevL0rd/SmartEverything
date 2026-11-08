import { appendTo, placementFacts, type ModelSpec } from '@smarteverything/domain';
import { compareText } from '../../format/text';
import { hexRgb } from './light-blend';
import {
  boundsOfPoints,
  renderRoomAt,
  sceneKeyHash,
  type RenderBounds,
  type RenderFloor,
  type RenderPlacement,
  type RenderPoint,
  type RenderPolygon,
  type RenderRing,
} from './render-scene';

export const LIGHT_POOL_KINDS = ['ceiling', 'lamp', 'strip'] as const;

export type LightPoolKind = (typeof LIGHT_POOL_KINDS)[number];

export const LIGHT_POOL_REACH_M: Readonly<Record<LightPoolKind, number>> = {
  ceiling: 2.5,
  lamp: 1.5,
  strip: 1,
};

export const LIGHT_POOL_SEGMENTS = 48;

export const DEFAULT_LIGHT_KELVIN = 2700;

export interface LightState {
  readonly on: boolean;
  readonly brightness: number | null;
  readonly colour: string | null;
  readonly colourTempK: number | null;
}

export interface LightEmitterFacts {
  readonly kind: LightPoolKind;
  readonly colour: string;
  readonly lengthM: number;
}

export interface LightPool {
  readonly deviceId: string;
  readonly roomId: string | null;
  readonly kind: LightPoolKind;
  readonly from: RenderPoint;
  readonly to: RenderPoint;
  readonly reachM: number;
  readonly colour: string;
  readonly strength: number;
  readonly heightM: number;
  readonly clip: readonly RenderPolygon[];
}

export interface RoomLightPools {
  readonly id: string;
  readonly roomId: string | null;
  readonly name: string | null;
  readonly bounds: RenderBounds;
  readonly pools: readonly LightPool[];
}

export interface CeilingGlow {
  readonly deviceId: string;
  readonly at: RenderPoint;
  readonly heightM: number;
  readonly colour: string;
  readonly strength: number;
}

export interface DuskAmbient {
  readonly ambientScale: number;
  readonly sunScale: number;
  readonly tint: string;
  readonly veilOpacity: number;
}

export interface FloorLighting {
  readonly key: string;
  readonly enabled: boolean;
  readonly rooms: readonly RoomLightPools[];
  readonly glows: readonly CeilingGlow[];
  readonly dusk: DuskAmbient;
}

export interface LightingInput {
  readonly floor: RenderFloor;
  readonly enabled: boolean;
  readonly lights: ReadonlyMap<string, LightState>;
  readonly emitterOf: (placement: RenderPlacement) => LightEmitterFacts;
}

export const DAYLIGHT: DuskAmbient = {
  ambientScale: 1,
  sunScale: 1,
  tint: '#ffffff',
  veilOpacity: 0,
};

export const DUSK: DuskAmbient = {
  ambientScale: 0.42,
  sunScale: 0.25,
  tint: '#8d9bd6',
  veilOpacity: 0.28,
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const channel = (value: number): string =>
  Math.round(clamp01(value / 255) * 255)
    .toString(16)
    .padStart(2, '0');

export function kelvinColour(kelvin: number): string {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  const red = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const green =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492;
  const blue = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

type EmitterAnchor = Extract<NonNullable<ModelSpec['anchors']>[number], { kind: 'emitter' }>;

function emitterAnchors(spec: ModelSpec | undefined): readonly EmitterAnchor[] {
  return (spec?.anchors ?? []).flatMap((anchor) => (anchor.kind === 'emitter' ? [anchor] : []));
}

function mountOf(mount: RenderPlacement['mount'], spec: ModelSpec | undefined): string {
  return (spec === undefined ? undefined : placementFacts(spec.id, spec)?.mount) ?? mount;
}

export function lightEmitterFacts(
  mount: RenderPlacement['mount'],
  spec?: ModelSpec,
): LightEmitterFacts {
  const emitters = emitterAnchors(spec);
  const colour = emitters[0]?.color ?? kelvinColour(DEFAULT_LIGHT_KELVIN);
  if (mountOf(mount, spec) === 'ceiling') return { kind: 'ceiling', colour, lengthM: 0 };
  const along = new Set(emitters.map((emitter) => emitter.position?.[0] ?? 0));
  if (along.size > 1 && spec !== undefined) {
    return { kind: 'strip', colour, lengthM: spec.footprint.width };
  }
  return { kind: 'lamp', colour, lengthM: 0 };
}

function lightColour(state: LightState, facts: LightEmitterFacts): string {
  if (state.colour !== null && hexRgb(state.colour) !== null) return state.colour;
  if (state.colourTempK !== null) return kelvinColour(state.colourTempK);
  return facts.colour;
}

function circleRing(centre: RenderPoint, radius: number, segments: number): RenderRing {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
  });
}

function stadiumRing(from: RenderPoint, to: RenderPoint, radius: number): RenderRing {
  const heading = Math.atan2(to.y - from.y, to.x - from.x);
  const half = LIGHT_POOL_SEGMENTS / 2;
  const arc = (centre: RenderPoint, start: number): RenderPoint[] =>
    Array.from({ length: half + 1 }, (_, index) => {
      const angle = start + (index / half) * Math.PI;
      return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
    });
  return [...arc(to, heading - Math.PI / 2), ...arc(from, heading + Math.PI / 2)];
}

export function poolRegion(pool: Pick<LightPool, 'from' | 'to' | 'reachM'>): RenderRing {
  const same = pool.from.x === pool.to.x && pool.from.y === pool.to.y;
  return same
    ? circleRing(pool.from, pool.reachM, LIGHT_POOL_SEGMENTS)
    : stadiumRing(pool.from, pool.to, pool.reachM);
}

const cross = (a: RenderPoint, b: RenderPoint, p: RenderPoint): number =>
  (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

function crossing(p: RenderPoint, q: RenderPoint, a: RenderPoint, b: RenderPoint): RenderPoint {
  const dp = cross(a, b, p);
  const dq = cross(a, b, q);
  const t = dp / (dp - dq);
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

function clipByEdge(ring: RenderRing, a: RenderPoint, b: RenderPoint): RenderPoint[] {
  const out: RenderPoint[] = [];
  ring.forEach((current, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length] ?? current;
    const inside = cross(a, b, current) >= 0;
    const before = cross(a, b, previous) >= 0;
    if (inside !== before) out.push(crossing(previous, current, a, b));
    if (inside) out.push(current);
  });
  return out;
}

export function clipRingConvex(ring: RenderRing, convexCcw: RenderRing): RenderRing {
  let result: RenderRing = ring;
  convexCcw.forEach((a, index) => {
    const b = convexCcw[(index + 1) % convexCcw.length] ?? a;
    if (result.length > 0) result = clipByEdge(result, a, b);
  });
  return result.length >= 3 ? result : [];
}

export function clipPolygonConvex(
  polygon: RenderPolygon,
  convexCcw: RenderRing,
): RenderPolygon | null {
  const outer = clipRingConvex(polygon.outer, convexCcw);
  if (outer.length === 0) return null;
  const holes = polygon.holes.map((hole) => clipRingConvex(hole, convexCcw));
  return { outer, holes: holes.filter((hole) => hole.length > 0) };
}

interface PoolSeat {
  readonly roomId: string | null;
  readonly clip: readonly RenderPolygon[];
  readonly heightM: number;
}

function seatOf(floor: RenderFloor, placement: RenderPlacement, region: RenderRing): PoolSeat {
  const known = floor.rooms.find((room) => room.id === placement.roomId);
  const roomId = known?.id ?? renderRoomAt(floor.rooms, placement.at);
  const room = floor.rooms.find((candidate) => candidate.id === roomId);
  if (room === undefined) {
    return { roomId: null, clip: [{ outer: region, holes: [] }], heightM: floor.ceilingHeight };
  }
  const clip = room.polygons.flatMap((polygon) => clipPolygonConvex(polygon, region) ?? []);
  return { roomId: room.id, clip, heightM: room.ceilingHeight };
}

function stripEnds(
  placement: RenderPlacement,
  lengthM: number,
): readonly [RenderPoint, RenderPoint] {
  const turn = (placement.rotationDeg * Math.PI) / 180;
  const dx = (-Math.sin(turn) * lengthM) / 2;
  const dy = (Math.cos(turn) * lengthM) / 2;
  const { x, y } = placement.at;
  return [
    { x: x - dx, y: y - dy },
    { x: x + dx, y: y + dy },
  ];
}

function poolOf(
  input: LightingInput,
  placement: RenderPlacement,
  state: LightState,
): LightPool | null {
  const strength = clamp01(state.brightness ?? 1);
  if (!state.on || strength <= 0) return null;
  const facts = input.emitterOf(placement);
  const [from, to] =
    facts.kind === 'strip' && facts.lengthM > 0
      ? stripEnds(placement, facts.lengthM)
      : [placement.at, placement.at];
  const reachM = LIGHT_POOL_REACH_M[facts.kind];
  const seat = seatOf(input.floor, placement, poolRegion({ from, to, reachM }));
  const heightM = facts.kind === 'ceiling' ? seat.heightM : placement.height;
  const colour = lightColour(state, facts);
  return {
    deviceId: placement.deviceId,
    roomId: seat.roomId,
    kind: facts.kind,
    from,
    to,
    reachM,
    colour,
    strength,
    heightM,
    clip: seat.clip,
  };
}

function groupPools(floor: RenderFloor, pools: readonly LightPool[]): RoomLightPools[] {
  const groups = new Map<string, LightPool[]>();
  for (const pool of pools) {
    const id = pool.roomId ?? `device:${pool.deviceId}`;
    appendTo(groups, id, pool);
  }
  return [...groups].flatMap(([id, members]) => {
    const bounds = boundsOfPoints(members.flatMap((pool) => pool.clip.map((p) => p.outer).flat()));
    if (bounds === null) return [];
    const roomId = members[0]?.roomId ?? null;
    const name = floor.rooms.find((room) => room.id === roomId)?.name ?? null;
    return [{ id, roomId, name, bounds, pools: members }];
  });
}

function keyOf(enabled: boolean, pools: readonly LightPool[]): string {
  return sceneKeyHash([
    String(enabled),
    ...pools.map((pool) =>
      [
        pool.deviceId,
        pool.roomId,
        pool.kind,
        pool.from.x,
        pool.from.y,
        pool.to.x,
        pool.to.y,
        pool.colour,
        pool.strength,
        pool.heightM,
      ].join(':'),
    ),
  ]);
}

export function floorLighting(input: LightingInput): FloorLighting {
  const pools = input.enabled
    ? [...input.floor.placements]
        .sort((left, right) => compareText(left.deviceId, right.deviceId))
        .flatMap((placement) => {
          const state = input.lights.get(placement.deviceId);
          return state === undefined ? [] : (poolOf(input, placement, state) ?? []);
        })
    : [];
  const glows = pools.flatMap((pool) =>
    pool.kind === 'ceiling'
      ? [
          {
            deviceId: pool.deviceId,
            at: pool.from,
            heightM: pool.heightM,
            colour: pool.colour,
            strength: pool.strength,
          },
        ]
      : [],
  );
  return {
    key: keyOf(input.enabled, pools),
    enabled: input.enabled,
    rooms: groupPools(input.floor, pools),
    glows,
    dusk: input.enabled ? DUSK : DAYLIGHT,
  };
}

export const litRoomNames = (lighting: FloorLighting): readonly string[] =>
  lighting.rooms.flatMap((room) => (room.name === null ? [] : [room.name]));
