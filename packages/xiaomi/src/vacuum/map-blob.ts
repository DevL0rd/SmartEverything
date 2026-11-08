import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { MapBlobError } from '../errors';
import {
  MAP_DOCUMENT,
  MAP_ENVELOPE,
  stage,
  type MapDocument,
  type TrajectoryPoint,
} from './map-document';

const MAP_IV = Uint8Array.from(Buffer.from('ABCDEF1234123412', 'latin1'));
const MODEL_KEY_LENGTH = 16;
export const MAP_INFLATED_MAX_BYTES = 32 * 1024 * 1024;
const INFLATE_LIMIT = { maxOutputLength: MAP_INFLATED_MAX_BYTES } as const;
const TRAJECTORY_RECORD_BYTES = 9;
const TRAJECTORY_SWEEP_MARKER = 2;
const TRAJECTORY_MOP_MARKER = 3;

export const GRID_FIRST_ROOM = 3;
export const GRID_LAST_ROOM = 63;

export const CELL_FLAG = { hidden: 1, unreachable: 2, aiCarpet: 4, object: 8 } as const;

const DIRT_LEVELS: Readonly<Record<number, number>> = { 3: 1, 4: 2, 5: 3 };

export type MapLayer = 'map_data' | 'additional_map_data' | 'dirty_map_data';

export function hasCellFlag(value: number, flag: number): boolean {
  return (value & flag) !== 0;
}

export function dirtLevel(value: number): number {
  return DIRT_LEVELS[value] ?? 0;
}

export function mapKey(model: string, did: string): Uint8Array {
  const modelKey = Buffer.from(model.slice(-MODEL_KEY_LENGTH), 'latin1');
  if (modelKey.length !== MODEL_KEY_LENGTH) {
    throw new MapBlobError(
      'key derivation',
      `a model of at least ${String(MODEL_KEY_LENGTH)} characters`,
      model,
    );
  }
  const cipher = createCipheriv('aes-128-cbc', modelKey, MAP_IV);
  const wrapped = Buffer.concat([
    cipher.update(Buffer.concat([modelKey, Buffer.from(did, 'latin1')])),
    cipher.final(),
  ]);
  return Uint8Array.from(createHash('md5').update(wrapped).digest());
}

export function decryptMapBlob(raw: Uint8Array, model: string, did: string): MapDocument {
  const envelope = stage('envelope', 'JSON {"version":2,"data":"<base64>"}', () =>
    MAP_ENVELOPE.parse(JSON.parse(Buffer.from(raw).toString('utf8'))),
  );
  const compressed = stage('decryption', 'AES-128-CBC with the model and device key', () => {
    const decipher = createDecipheriv('aes-128-cbc', mapKey(model, did), MAP_IV);
    return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
  });
  const text = stage('decompression', 'a zlib stream', () =>
    inflateSync(compressed, INFLATE_LIMIT).toString('utf8'),
  );
  return stage('map document', 'the vacuum map JSON with its required fields', () =>
    MAP_DOCUMENT.parse(JSON.parse(text)),
  );
}

export function decodeMapLayer(map: MapDocument, layer: MapLayer): Uint8Array {
  const encoded = map[layer];
  if (encoded === undefined) {
    throw new MapBlobError(`${layer} presence`, `a ${layer} field`, 'no such field');
  }
  const cells = stage(`${layer} decompression`, 'a base64 zlib stream', () =>
    Uint8Array.from(inflateSync(Buffer.from(encoded, 'base64'), INFLATE_LIMIT)),
  );
  const expected = map.width * map.height;
  if (cells.length !== expected) {
    throw new MapBlobError(
      `${layer} size`,
      `${String(expected)} cells`,
      `${String(cells.length)} cells`,
    );
  }
  return cells;
}

export function roomCellCounts(cells: Uint8Array): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const value of cells) {
    if (value >= GRID_FIRST_ROOM && value <= GRID_LAST_ROOM) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

export function cellToMillimetres(
  map: MapDocument,
  column: number,
  row: number,
): { readonly x: number; readonly y: number } {
  return { x: map.origin_x + column * map.resolution, y: map.origin_y + row * map.resolution };
}

export function millimetresToCell(
  map: MapDocument,
  x: number,
  y: number,
): { readonly column: number; readonly row: number } {
  return { column: (x - map.origin_x) / map.resolution, row: (y - map.origin_y) / map.resolution };
}

export function decodeTrajectory(compressed: Uint8Array): readonly TrajectoryPoint[] {
  const records = stage('trajectory decompression', 'a zlib stream', () =>
    inflateSync(compressed, INFLATE_LIMIT),
  );
  if (records.length % TRAJECTORY_RECORD_BYTES !== 0) {
    throw new MapBlobError(
      'trajectory size',
      `a multiple of ${String(TRAJECTORY_RECORD_BYTES)} bytes`,
      `${String(records.length)} bytes`,
    );
  }
  const points: TrajectoryPoint[] = [];
  for (let offset = 0; offset < records.length; offset += TRAJECTORY_RECORD_BYTES) {
    const marker = records.readUInt8(offset);
    if (marker !== TRAJECTORY_SWEEP_MARKER && marker !== TRAJECTORY_MOP_MARKER) {
      throw new MapBlobError('trajectory record', 'marker 2 or 3', `marker ${String(marker)}`);
    }
    points.push({
      x: records.readInt32LE(offset + 1),
      y: records.readInt32LE(offset + 5),
      mopping: marker === TRAJECTORY_MOP_MARKER,
    });
  }
  return points;
}
