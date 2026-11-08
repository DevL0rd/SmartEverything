import { describe, expect, it } from 'vitest';
import {
  VacuumCodecError,
  decodeDndWindow,
  decodePreset,
  decodePresetLabels,
  decodeRestrictedAreas,
  decodeVirtualWalls,
  encodeDndWindow,
  encodePreset,
  encodeRestrictedAreas,
  encodeVirtualWalls,
  type VacuumPreset,
} from '../src';

const TASK: VacuumPreset['user_cfg'][number] = {
  mode: 3,
  mop: 3,
  fan_level: 2,
  water_level: 2,
  more: 0,
  clean_path: 2,
  clean_count: 1,
  room_ids: [3],
};

const KITCHEN: VacuumPreset = { id: -1, source: 0, name: 'Kitchen', user_cfg: [TASK] };

describe('do-not-disturb window 11.2', () => {
  it('encodes 22:00 to 08:00 as the value the robot accepted live', () => {
    const window = { startHour: 22, startMinute: 0, endHour: 8, endMinute: 0 };
    expect(encodeDndWindow(window)).toBe(369100800);
    expect(decodeDndWindow(369100800)).toEqual(window);
  });

  it('encodes 23:00 to 07:00 as the first value tried live', () => {
    expect(encodeDndWindow({ startHour: 23, startMinute: 0, endHour: 7, endMinute: 0 })).toBe(
      385877760,
    );
  });

  it('round trips minutes in both halves', () => {
    const window = { startHour: 21, startMinute: 45, endHour: 6, endMinute: 15 };
    expect(decodeDndWindow(encodeDndWindow(window))).toEqual(window);
  });

  it('refuses equal times, hours above 23, minutes above 59 and non integers', () => {
    const base = { startHour: 22, startMinute: 0, endHour: 8, endMinute: 0 };
    expect(() => encodeDndWindow({ ...base, endHour: 22 })).toThrow(VacuumCodecError);
    expect(() => encodeDndWindow({ ...base, startHour: 24 })).toThrow(VacuumCodecError);
    expect(() => encodeDndWindow({ ...base, endMinute: 60 })).toThrow(VacuumCodecError);
    expect(() => encodeDndWindow({ ...base, startMinute: 1.5 })).toThrow(VacuumCodecError);
  });

  it('refuses stored values that are no window', () => {
    expect(() => decodeDndWindow(4294967296)).toThrow(VacuumCodecError);
    expect(() => decodeDndWindow(-1)).toThrow(VacuumCodecError);
    expect(() => decodeDndWindow(0)).toThrow(VacuumCodecError);
    expect(() => decodeDndWindow(60 * 65536)).toThrow(VacuumCodecError);
  });
});

describe('restricted areas 2.13 and virtual walls 2.14', () => {
  const corners = [-3260, 2725, -3260, 725, -1260, 725, -1260, 2725];

  it('encodes the exact read format with ids as the array index', () => {
    expect(encodeRestrictedAreas([{ corners, kind: 'no-go' }])).toBe(
      '{"forbidden_regions":[{"id":0,"fb_point":[-3260,2725,-3260,725,-1260,725,-1260,2725],"fb_attr":0}]}',
    );
    expect(
      encodeRestrictedAreas([
        { corners, kind: 'no-go' },
        { corners, kind: 'no-mop' },
      ]),
    ).toContain('"id":1,"fb_point":[-3260,2725,-3260,725,-1260,725,-1260,2725],"fb_attr":1');
  });

  it('round trips areas and reads the empty live value', () => {
    const areas = [
      { corners, kind: 'no-go' as const },
      { corners, kind: 'no-mop' as const },
    ];
    expect(decodeRestrictedAreas(encodeRestrictedAreas(areas))).toEqual(
      areas.map((area, id) => ({ ...area, id })),
    );
    expect(decodeRestrictedAreas('{"forbidden_regions":[]}')).toEqual([]);
  });

  it('encodes and round trips virtual walls', () => {
    const walls = [{ points: [-1265, 4165, 1225, 4165] }];
    expect(encodeVirtualWalls(walls)).toBe(
      '{"restricted_walls":[{"id":0,"wall_points":[-1265,4165,1225,4165]}]}',
    );
    expect(decodeVirtualWalls(encodeVirtualWalls(walls))).toEqual([{ id: 0, ...walls[0] }]);
    expect(decodeVirtualWalls('{"restricted_walls":[]}')).toEqual([]);
  });

  it('refuses shapes of the wrong size and text that is no JSON', () => {
    expect(() => encodeRestrictedAreas([{ corners: [1, 2], kind: 'no-go' }])).toThrow(
      VacuumCodecError,
    );
    expect(() => encodeVirtualWalls([{ points: [1, 2, 3] }])).toThrow(VacuumCodecError);
    expect(() => decodeRestrictedAreas('{"forbidden_regions":[{"id":0}]}')).toThrow(
      VacuumCodecError,
    );
    expect(() => decodeVirtualWalls('not json')).toThrow(VacuumCodecError);
  });
});

describe('custom cleanup (plugin-derived, live-unconfirmed)', () => {
  it('plugin-derived: writes the A2.38 object exactly', () => {
    expect(encodePreset(KITCHEN)).toBe(
      '{"id":-1,"source":0,"name":"Kitchen","user_cfg":[{"mode":3,"mop":3,"fan_level":2,"water_level":2,"more":0,"clean_path":2,"clean_count":1,"room_ids":[3]}]}',
    );
  });

  it('plugin-derived: round trips a room task and a zone task', () => {
    const zones: VacuumPreset = {
      ...KITCHEN,
      id: 7,
      user_cfg: [
        {
          mode: 2,
          mop: 1,
          fan_level: 3,
          water_level: 1,
          more: 0,
          clean_path: 1,
          clean_count: 2,
          parts: [[-500, 300, -500, -300, 500, -300, 500, 300]],
        },
        { mode: 1, mop: 3, fan_level: 2, water_level: 2, more: 0, clean_path: 2, clean_count: 1 },
      ],
    };
    expect(decodePreset(encodePreset(KITCHEN))).toEqual(KITCHEN);
    expect(decodePreset(encodePreset(zones))).toEqual(zones);
  });

  it('plugin-derived: reads the label list of 2.42, empty and filled', () => {
    expect(decodePresetLabels('{"user_labels":[]}')).toEqual([]);
    expect(decodePresetLabels('{"user_labels":[{"id":7,"name":"Kitchen","source":0}]}')).toEqual([
      { id: 7, name: 'Kitchen', source: 0 },
    ]);
  });

  it('plugin-derived: refuses no tasks, six tasks, an empty name and a zone with the wrong size', () => {
    expect(() => encodePreset({ ...KITCHEN, user_cfg: [] })).toThrow(VacuumCodecError);
    expect(() =>
      encodePreset({ ...KITCHEN, user_cfg: Array.from({ length: 6 }, () => TASK) }),
    ).toThrow(VacuumCodecError);
    expect(() => encodePreset({ ...KITCHEN, name: '' })).toThrow(VacuumCodecError);
    expect(() =>
      encodePreset({ ...KITCHEN, user_cfg: [{ ...TASK, mode: 2 as const, parts: [[1, 2]] }] }),
    ).toThrow(VacuumCodecError);
    expect(() => decodePresetLabels('{"user_labels":[{"id":"x"}]}')).toThrow(VacuumCodecError);
  });
});
