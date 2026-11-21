import { VACUUM_SCENE, type VacuumScene, type VacuumSlot } from '@smarteverything/domain';
import {
  MapBlobError,
  applyRoute,
  buildVacuumScene,
  buildWallsLayer,
  decodeMapLayer,
  decodeMapRoute,
  decryptMapBlob,
  type MapDocument,
  type PushedMapObjects,
  type Route,
} from '@smarteverything/xiaomi';
import { z } from 'zod';

export interface MapDecodeJob {
  readonly bytes: Uint8Array;
  readonly model: string;
  readonly did: string;
  readonly slot: VacuumSlot;
  readonly index: number;
  readonly fetchedAt: string;
  readonly pushed: PushedMapObjects;
}

const BLOB_FAILURE = z.strictObject({
  step: z.string(),
  expected: z.string(),
  received: z.string(),
});

const WIRE_ERROR = z.strictObject({
  name: z.string(),
  message: z.string(),
  blob: BLOB_FAILURE.nullable(),
});

const ROUTE_POINT = z.strictObject({
  poseId: z.number(),
  x: z.number(),
  y: z.number(),
  yaw: z.number().nullable(),
  penDown: z.boolean(),
  mode: z.enum(['idle', 'sweep', 'mop', 'both']),
});

const ROUTE = z.strictObject({ cursor: z.number(), points: z.array(ROUTE_POINT) }).nullable();

export const MAP_DECODE_OUTCOME = z.discriminatedUnion('stage', [
  z.strictObject({ stage: z.literal('decode'), error: WIRE_ERROR }),
  z.strictObject({
    stage: z.literal('scene'),
    taskId: z.number().nullable(),
    route: ROUTE,
    error: WIRE_ERROR,
  }),
  z.strictObject({
    stage: z.literal('done'),
    taskId: z.number().nullable(),
    route: ROUTE,
    scene: VACUUM_SCENE,
  }),
]);

export type WireError = z.infer<typeof WIRE_ERROR>;

export type MapDecodeOutcome =
  | { readonly stage: 'decode'; readonly error: WireError }
  | {
      readonly stage: 'scene';
      readonly taskId: number | null;
      readonly route: Route | null;
      readonly error: WireError;
    }
  | {
      readonly stage: 'done';
      readonly taskId: number | null;
      readonly route: Route | null;
      readonly scene: VacuumScene;
    };

export interface MapDecoder {
  decode(job: MapDecodeJob): Promise<MapDecodeOutcome>;
  close(): Promise<void>;
}

export class MapDecodeFailure extends Error {
  override readonly name: string;

  constructor(failure: Pick<WireError, 'name' | 'message'>) {
    super(failure.message);
    this.name = failure.name;
  }
}

export function wireError(error: unknown): WireError {
  if (error instanceof MapBlobError) {
    const { name, message, step, expected, received } = error;
    return { name, message, blob: { step, expected, received } };
  }
  if (error instanceof Error) return { name: error.name, message: error.message, blob: null };
  return { name: typeof error, message: String(error), blob: null };
}

export function errorOf(wire: WireError): Error {
  return wire.blob === null
    ? new MapDecodeFailure(wire)
    : new MapBlobError(wire.blob.step, wire.blob.expected, wire.blob.received);
}

function sceneOf(job: MapDecodeJob, map: MapDocument, route: Route | null): VacuumScene {
  const base = buildVacuumScene({
    map,
    index: job.index,
    slot: job.slot,
    fetchedAt: job.fetchedAt,
  });
  const layer = buildWallsLayer(map, decodeMapLayer(map, 'map_data'), job.pushed);
  const own = job.slot === 'current' && map.map_id !== undefined ? { robotMapId: map.map_id } : {};
  return VACUUM_SCENE.parse(applyRoute({ ...base, ...own, ...layer }, route));
}

function decoded(job: MapDecodeJob): { readonly map: MapDocument; readonly route: Route | null } {
  const map = decryptMapBlob(job.bytes, job.model, job.did);
  return { map, route: decodeMapRoute(map.paths) };
}

export function decodeVacuumMap(job: MapDecodeJob): MapDecodeOutcome {
  let map: MapDocument;
  let route: Route | null;
  try {
    ({ map, route } = decoded(job));
  } catch (error) {
    return { stage: 'decode', error: wireError(error) };
  }
  const taskId = map.task_id ?? null;
  try {
    return { stage: 'done', taskId, route, scene: sceneOf(job, map, route) };
  } catch (error) {
    return { stage: 'scene', taskId, route, error: wireError(error) };
  }
}
