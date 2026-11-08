import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CELL_FLAG,
  MAP_DOCUMENT,
  MapBlobError,
  cellToMillimetres,
  decodeMapLayer,
  decodeTrajectory,
  decryptMapBlob,
  dirtLevel,
  hasCellFlag,
  mapKey,
  millimetresToCell,
  roomCellCounts,
  type MapDocument,
} from '../src';
import { MAP_INFLATED_MAX_BYTES } from '../src/vacuum/map-blob';
import { fixtureJson, pv11glMap, sealMapBytes, sealMapDocument } from './vacuum-support';

const MODEL = 'xiaomi.vacuum.pv11gl';
const DID = '1000000001';

function publicMap(): MapDocument {
  return MAP_DOCUMENT.parse(fixtureJson('maps/b108gl-map.json'));
}

function trajectories(): readonly { readonly taken: string; readonly trajectory: string }[] {
  return z
    .array(z.object({ taken: z.string(), trajectory: z.string() }))
    .parse(fixtureJson('maps/b108gl-trajectories.json'));
}

function sorted(ids: readonly number[] | undefined): readonly number[] {
  return (ids ?? []).toSorted((a, b) => a - b);
}

function failure(work: () => unknown): MapBlobError {
  try {
    work();
  } catch (error) {
    if (error instanceof MapBlobError) return error;
    throw error;
  }
  throw new Error('expected a MapBlobError');
}

function record(marker: number, x: number, y: number): Buffer {
  const bytes = Buffer.alloc(9);
  bytes.writeUInt8(marker, 0);
  bytes.writeInt32LE(x, 1);
  bytes.writeInt32LE(y, 5);
  return bytes;
}

describe('map key', () => {
  it('derives the sixteen byte key from the last sixteen characters of the model and the device id', () => {
    expect(Buffer.from(mapKey(MODEL, DID)).toString('hex')).toBe(
      '74275536a025eaa5836b86a4a66d5f4e',
    );
    expect(Buffer.from(mapKey('xiaomi.vacuum.b108gl', '42')).toString('hex')).toBe(
      'f497133079784f515537e2663f785870',
    );
  });

  it('refuses a model shorter than the key', () => {
    expect(() => mapKey('xiaomi.pv11', DID)).toThrow(MapBlobError);
  });
});

describe('map blob', () => {
  it('opens a sealed map document and returns every field of it', () => {
    const sealed = sealMapDocument(fixtureJson('maps/b108gl-map.json'), MODEL, DID);
    expect(decryptMapBlob(sealed, MODEL, DID)).toEqual(publicMap());
  });

  it('reads the fields of a pv11gl shaped map: second layer, path points, carpets, position', () => {
    const document = {
      ...publicMap(),
      additional_map_data: Buffer.from(deflateSync(Buffer.alloc(144 * 245, 2))).toString('base64'),
      position: { x: 718, y: -339, yaw: 2985 },
      carpets: [{ p: [-938, -375, -938, -1397], d: '0_20001' }],
      paths: {
        pose_id: 13,
        points: [{ x: 855, y: -362, type: 1, sweep_mop_mode: 1, yaw: 2967 }],
      },
    };
    const opened = decryptMapBlob(sealMapDocument(document, MODEL, DID), MODEL, DID);
    expect(opened.paths?.points[0]).toEqual({
      x: 855,
      y: -362,
      type: 1,
      sweep_mop_mode: 1,
      yaw: 2967,
    });
    expect(opened.position).toEqual({ x: 718, y: -339, yaw: 2985 });
    expect(decodeMapLayer(opened, 'additional_map_data')).toHaveLength(144 * 245);
  });

  it('names the failing step for an envelope, key, compression or document problem', () => {
    const good = sealMapDocument(fixtureJson('maps/b108gl-map.json'), MODEL, DID);
    const steps = [
      [Buffer.from('not json'), 'envelope'],
      [Buffer.from(JSON.stringify({ version: 1, data: 'AAAA' })), 'envelope'],
      [good, 'decryption'],
      [sealMapBytes(Buffer.from('plain text'), MODEL, DID), 'decompression'],
      [sealMapBytes(deflateSync(Buffer.from('nope')), MODEL, DID), 'map document'],
      [sealMapDocument({ width: 1 }, MODEL, DID), 'map document'],
    ] as const;
    const failed = steps.map(([bytes, step]) => {
      const wrongDevice = step === 'decryption';
      try {
        decryptMapBlob(bytes, MODEL, wrongDevice ? '999' : DID);
        return null;
      } catch (error) {
        return error instanceof MapBlobError ? error.step : 'other';
      }
    });
    expect(failed).toEqual(steps.map(([, step]) => step));
  });
});

describe('the synthetic pv11gl maps', () => {
  const slots = [
    ['current', 219, 127, 21841],
    ['saved', 219, 127, 21841],
    ['backup', 224, 130, 22156],
  ] as const;

  it.each(slots)(
    'opens the %s map with a grid of its own size and five rooms',
    (slot, w, h, floor) => {
      const map = pv11glMap(slot);
      expect([map.width, map.height, map.resolution]).toEqual([w, h, 50]);
      const cells = decodeMapLayer(map, 'map_data');
      const rooms = roomCellCounts(cells);
      expect(sorted([...rooms.keys()])).toEqual([3, 4, 5, 6, 8]);
      expect([...rooms.values()].reduce((sum, count) => sum + count, 0)).toBe(floor);
      expect(sorted(map.map_room_info?.map((room) => room.grid_id))).toEqual([3, 4, 5, 6, 8]);
      expect(sorted(map.room_attrs?.map((room) => room.id))).toEqual([3, 4, 5, 6, 8]);
      expect(sorted(map.map_3d_info?.rooms?.map((room) => room.room_id))).toEqual([3, 4, 5, 6, 8]);
    },
  );

  it.each(slots)('keeps the dock of the %s map inside a room', (slot) => {
    const map = pv11glMap(slot);
    const cells = decodeMapLayer(map, 'map_data');
    const dock = millimetresToCell(map, map.pile_x ?? 0, map.pile_y ?? 0);
    expect(cells[Math.round(dock.row) * map.width + Math.round(dock.column)]).toBe(3);
  });

  it('reads the current map as a running task: cleaning job, position, path and carpet', () => {
    const map = pv11glMap('current');
    expect(map.current_cleaning_config).toEqual({
      rooms: [3, 4],
      clean_mode: 3,
      is_ai_cleaning: false,
      dirty_cleaning: false,
    });
    expect(map.position?.yaw).toBe(3120);
    expect(map.paths?.pose_id).toBe(41);
    expect(map.paths?.points).toHaveLength(41);
    expect(map.carpets).toHaveLength(1);
    expect(map.map_3d_info?.carpets?.[0]?.p_3d).toHaveLength(20);
    expect(map.task_id).toBe(1000001);
    expect(map.map_name).toBe('Fixture');
  });

  it('reads the second layer of the current map as cell flags', () => {
    const map = pv11glMap('current');
    const flags = decodeMapLayer(map, 'additional_map_data');
    expect(flags).toHaveLength(map.width * map.height);
    const flagged = Object.values(CELL_FLAG).map(
      (flag) => flags.filter((value) => hasCellFlag(value, flag)).length,
    );
    expect(Math.max(...flags)).toBe(12);
    expect(flagged[2]).toBeGreaterThan(0);
    expect(flagged[3]).toBeGreaterThan(0);
    expect(flagged[0]).toBe(0);
  });

  it('has no path or position in a saved map or a backup', () => {
    for (const slot of ['saved', 'backup'] as const) {
      const map = pv11glMap(slot);
      expect(map.paths).toBeUndefined();
      expect(map.position).toBeUndefined();
      expect(map.task_id).toBeUndefined();
    }
  });

  it('holds no identifier of the home: task, name and room names are generic', () => {
    for (const slot of ['current', 'saved', 'backup'] as const) {
      const map = pv11glMap(slot);
      expect(map.room_attrs?.every((room) => /^Fixture room \d$/.test(room.room_name))).toBe(true);
      expect(map.map_name === undefined || map.map_name === 'Fixture').toBe(true);
    }
  });
});

describe('dirty map layer', () => {
  it('reads dirty_map_data as a grid of the map size and maps 3, 4, 5 to dirt levels 1, 2, 3', () => {
    const map = publicMap();
    const dirt = Buffer.alloc(map.width * map.height);
    dirt[0] = 3;
    dirt[1] = 4;
    dirt[2] = 5;
    const withDirt = { ...map, dirty_map_data: deflateSync(dirt).toString('base64') };
    const cells = decodeMapLayer(withDirt, 'dirty_map_data');
    expect([0, 1, 2, 3].map((index) => dirtLevel(cells[index] ?? 0))).toEqual([1, 2, 3, 0]);
    const opened = decryptMapBlob(sealMapDocument(withDirt, MODEL, DID), MODEL, DID);
    expect(opened.dirty_map_data).toBe(withDirt.dirty_map_data);
    expect(() => decodeMapLayer(map, 'dirty_map_data')).toThrow(/dirty_map_data presence/);
  });

  it('refuses a dirty layer of the wrong size', () => {
    const map = publicMap();
    const wrong = { ...map, dirty_map_data: deflateSync(Buffer.alloc(3)).toString('base64') };
    expect(() => decodeMapLayer(wrong, 'dirty_map_data')).toThrow(/dirty_map_data size/);
  });
});

describe('map document reader', () => {
  it('ignores keys it does not know and reads the fields it does', () => {
    const document = { ...publicMap(), fb_regions: [{ id: 1 }], hot_spray: 3, ai_obj: 'x' };
    const opened = decryptMapBlob(sealMapDocument(document, MODEL, DID), MODEL, DID);
    expect(opened).toEqual(publicMap());
    expect(Object.keys(opened)).not.toContain('fb_regions');
  });

  it('names the missing or malformed fields and never prints their values', () => {
    const attempts = [
      [{ ...publicMap(), width: undefined, origin_x: undefined }, 'width, origin_x'],
      [{ ...publicMap(), map_data: 12345 }, 'map_data'],
      [{ ...publicMap(), paths: { pose_id: 'secret-1', points: [{ x: 1 }] } }, 'paths.pose_id'],
    ] as const;
    for (const [document, fields] of attempts) {
      const error = failure(() =>
        decryptMapBlob(sealMapDocument(document, MODEL, DID), MODEL, DID),
      );
      expect(error.step).toBe('map document');
      expect(error.received).toContain(fields);
      expect(error.message).not.toContain('secret-1');
    }
  });

  it('keeps a decompression error free of the blob content', () => {
    const error = failure(() =>
      decryptMapBlob(sealMapBytes(Buffer.from('private text'), MODEL, DID), MODEL, DID),
    );
    expect(error.step).toBe('decompression');
    expect(error.received).toBe('Error Z_DATA_ERROR');
    const notJson = failure(() => decryptMapBlob(Buffer.from('private text'), MODEL, DID));
    expect(notJson.step).toBe('envelope');
    expect(notJson.message).not.toContain('private');
  });
});

describe('map grid', () => {
  it('decodes a grid with one cell per width times height and counts the cells of each room', () => {
    const map = publicMap();
    const cells = decodeMapLayer(map, 'map_data');
    expect(cells).toHaveLength(map.width * map.height);
    const rooms = roomCellCounts(cells);
    expect([...rooms.keys()]).toEqual(expect.arrayContaining([3, 4, 5, 6]));
    expect(Math.max(...rooms.keys())).toBeLessThanOrEqual(13);
    expect([...rooms.values()].every((count) => count > 0)).toBe(true);
  });

  it('refuses a layer that is missing, not compressed or the wrong size', () => {
    const map = publicMap();
    const wrong = {
      ...map,
      map_data: Buffer.from(deflateSync(Buffer.alloc(10))).toString('base64'),
    };
    expect(() => decodeMapLayer(map, 'additional_map_data')).toThrow(
      /additional_map_data presence/,
    );
    expect(() => decodeMapLayer({ ...map, map_data: 'AAAA' }, 'map_data')).toThrow(/decompression/);
    expect(() => decodeMapLayer(wrong, 'map_data')).toThrow(
      /expected 35280 cells, received 10 cells/,
    );
  });

  it('puts the dock of the public map inside a room and converts cells and millimetres both ways', () => {
    const map = publicMap();
    const cells = decodeMapLayer(map, 'map_data');
    const dock = millimetresToCell(map, map.pile_x ?? 0, map.pile_y ?? 0);
    const column = Math.round(dock.column);
    const row = Math.round(dock.row);
    expect(cells[row * map.width + column]).toBeGreaterThanOrEqual(3);
    const back = cellToMillimetres(map, dock.column, dock.row);
    expect(back).toEqual({ x: map.pile_x, y: map.pile_y });
  });
});

describe('trajectory', () => {
  it('decodes the public captures into points with the mop flag', () => {
    const decoded = trajectories().map((capture) =>
      decodeTrajectory(Buffer.from(capture.trajectory, 'base64')),
    );
    expect(decoded.map((points) => points.length)).toEqual([139, 218]);
    expect(decoded[0]?.[0]).toEqual({ x: 284, y: -357, mopping: false });
    expect(decoded.flat().some((point) => point.mopping)).toBe(true);
  });

  it('decodes hand built records', () => {
    const packed = deflateSync(Buffer.concat([record(2, 1, -2), record(3, 3, 4)]));
    expect(decodeTrajectory(packed)).toEqual([
      { x: 1, y: -2, mopping: false },
      { x: 3, y: 4, mopping: true },
    ]);
  });

  it('refuses a compressed stream that inflates past the limit', () => {
    const bomb = deflateSync(Buffer.alloc(MAP_INFLATED_MAX_BYTES + 1));
    expect(() => decodeTrajectory(bomb)).toThrow(/trajectory decompression/);
    expect(() => decryptMapBlob(sealMapBytes(bomb, MODEL, DID), MODEL, DID)).toThrow(
      /decompression/,
    );
    const map = publicMap();
    expect(() => decodeMapLayer({ ...map, map_data: bomb.toString('base64') }, 'map_data')).toThrow(
      /decompression/,
    );
  });

  it('refuses data that is not a zlib stream, not whole records or has an unknown marker', () => {
    expect(() => decodeTrajectory(Buffer.from('plain'))).toThrow(/trajectory decompression/);
    expect(() => decodeTrajectory(deflateSync(Buffer.alloc(10)))).toThrow(/multiple of 9 bytes/);
    expect(() => decodeTrajectory(deflateSync(record(7, 0, 0)))).toThrow(/marker 7/);
  });
});

describe('MapBlobError', () => {
  it('names the step, what was expected and what was received', () => {
    const error = new MapBlobError('envelope', 'JSON', 'text');
    expect(error.name).toBe('MapBlobError');
    expect(error.message).toBe('The vacuum map failed at envelope: expected JSON, received text.');
  });
});
