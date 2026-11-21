import { parentPort } from 'node:worker_threads';
import { VACUUM_SLOT } from '@smarteverything/domain';
import { z } from 'zod';
import type { PushedMapObjects } from '@smarteverything/xiaomi';
import { decodeVacuumMap } from './map-decode';

const LAYERS = [
  'restrictedAreas',
  'virtualWalls',
  'hiddenZones',
  'sills',
  'furniture',
  'aiObjects',
] as const;

const PUSHED = z.custom<PushedMapObjects>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    LAYERS.every((layer) => layer in value && Array.isArray(Reflect.get(value, layer))),
  'pushed map objects with every layer',
);

export const MAP_DECODE_REQUEST = z.strictObject({
  id: z.int(),
  job: z.strictObject({
    bytes: z.custom<Uint8Array>((value) => value instanceof Uint8Array),
    model: z.string().min(1),
    did: z.string().min(1),
    slot: VACUUM_SLOT,
    index: z.int(),
    fetchedAt: z.string(),
    pushed: PUSHED,
  }),
});

export type MapDecodeRequest = z.infer<typeof MAP_DECODE_REQUEST>;

parentPort?.on('message', (raw: unknown) => {
  const { id, job } = MAP_DECODE_REQUEST.parse(raw);
  parentPort?.postMessage({ id, outcome: decodeVacuumMap(job) });
});
