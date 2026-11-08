import type { JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_BUDGET,
  FLOOR_MATERIAL,
  PRESETS_MAX,
  VacuumCommandError,
  ZONES_MAX,
  closeAlert,
  commandWire,
  encodePreset,
  findRobot,
  goToDock,
  pauseCleaning,
  presetAdd,
  presetDelete,
  presetModify,
  presetStart,
  resumeCleaning,
  roomFloor,
  roomVisibility,
  setRestrictions,
  startHouse,
  startRooms,
  startZones,
  stationStart,
  stationStop,
  stopCleaning,
  vacuumProperty,
  vacuumStatus,
  type VacuumCommand,
  type VacuumPreset,
  type VacuumPushed,
} from '../src';

const DID = 'test-did';
const ZONE = [-500, 300, -500, -300, 500, -300, 500, 300];

const PRESET: VacuumPreset = {
  id: -1,
  source: 0,
  name: 'Kitchen',
  user_cfg: [
    {
      mode: 3,
      mop: 3,
      fan_level: 2,
      water_level: 2,
      more: 0,
      clean_path: 2,
      clean_count: 1,
      room_ids: [3],
    },
  ],
};

function pushed(values: Readonly<Record<string, JsonValue>>): VacuumPushed {
  return (siid, piid) => values[`${String(siid)}.${String(piid)}`];
}

function actionWire(command: VacuumCommand, inputs: JsonValue[], siid: number, aiid: number): void {
  expect(commandWire(DID, command)).toEqual({
    set: null,
    action: { did: DID, siid, aiid, in: inputs },
  });
}

function config(fields: Record<string, JsonValue>): string {
  return JSON.stringify({ ...fields, is_ai_cleaning: false, dirty_cleaning: false });
}

describe('wire payloads of the proven forms', () => {
  it('starts the whole house with no input and nothing written first', () => {
    actionWire(startHouse(), [], 2, 1);
    expect(startHouse().properties).toEqual([]);
  });

  it('starts rooms with the piid 15 tagged id array text, order kept', () => {
    actionWire(startRooms([3, 4]), [{ piid: 15, value: '[3,4]' }], 2, 16);
    actionWire(startRooms([4, 3]), [{ piid: 15, value: '[4,3]' }], 2, 16);
  });

  it('starts one room with the single id text proven live', () => {
    actionWire(startRooms([3]), [{ piid: 15, value: '3' }], 2, 16);
  });

  it('starts zones with the piid 12 tagged blocks_region text, as proven live', () => {
    actionWire(
      startZones([ZONE]),
      [
        {
          piid: 12,
          value: '[{"blocks_region":[-500,300,-500,-300,500,-300,500,300],"blocks_attr":0}]',
        },
      ],
      2,
      37,
    );
    const two = startZones([ZONE, [0, 0, 0, 100, 100, 100, 100, 0]]);
    expect(commandWire(DID, two).action).toEqual({
      did: DID,
      siid: 2,
      aiid: 37,
      in: [
        {
          piid: 12,
          value:
            '[{"blocks_region":[-500,300,-500,-300,500,-300,500,300],"blocks_attr":0},{"blocks_region":[0,0,0,100,100,100,100,0],"blocks_attr":0}]',
        },
      ],
    });
  });

  it('writes the per run options first as one batch in the order 2.4, 2.8, 2.9, 2.10, 2.74', () => {
    const options = { sweepRoute: 3, mopWater: 2, suction: 4, cleanTimes: 2, sweepMopType: 3 };
    expect(commandWire(DID, startRooms([3], options))).toEqual({
      set: [
        { did: DID, siid: 2, piid: 4, value: 3 },
        { did: DID, siid: 2, piid: 8, value: 2 },
        { did: DID, siid: 2, piid: 9, value: 4 },
        { did: DID, siid: 2, piid: 10, value: 2 },
        { did: DID, siid: 2, piid: 74, value: 3 },
      ],
      action: { did: DID, siid: 2, aiid: 16, in: [{ piid: 15, value: '3' }] },
    });
    expect(commandWire(DID, startHouse({ cleanTimes: 2 })).set).toEqual([
      { did: DID, siid: 2, piid: 8, value: 2 },
    ]);
    expect(commandWire(DID, startZones([ZONE], { cleanTimes: 2 })).set).toEqual([
      { did: DID, siid: 2, piid: 8, value: 2 },
    ]);
  });

  it('sends pause, resume, dock, stop and find robot with no input', () => {
    actionWire(pauseCleaning(), [], 2, 7);
    actionWire(resumeCleaning(), [], 2, 8);
    actionWire(goToDock(), [], 2, 3);
    actionWire(stopCleaning(), [], 2, 2);
    actionWire(findRobot(), [], 6, 1);
  });

  it('closes an alert card with the piid 24 fault text', () => {
    actionWire(closeAlert(100051), [{ piid: 24, value: '{"fault":[100051]}' }], 2, 48);
  });

  it('sends the station actions of this model, the roller ones for washing', () => {
    actionWire(stationStart('dust-collection'), [], 2, 18);
    actionWire(stationStart('roller-wash'), [], 24, 2);
    actionWire(stationStop('roller-wash'), [], 24, 3);
    actionWire(stationStart('dry'), [], 2, 20);
    actionWire(stationStop('dry'), [], 2, 32);
  });

  it('tagged by analogy, live-unconfirmed: room floor and visibility with piid 16', () => {
    actionWire(
      roomFloor(3, 'wood-floor'),
      [{ piid: 16, value: '{"room_attrs":[{"id":3,"floor":4010}]}' }],
      2,
      13,
    );
    actionWire(
      roomVisibility(3, true),
      [{ piid: 16, value: '{"room_attrs":[{"id":3,"notshow":1}]}' }],
      2,
      13,
    );
    expect(FLOOR_MATERIAL.marble).toBe(4030);
  });

  it('writes both restriction lists in one batch, areas first', () => {
    const command = setRestrictions([{ corners: ZONE, kind: 'no-go' }], [{ points: [1, 2, 3, 4] }]);
    expect(commandWire(DID, command)).toEqual({
      set: [
        {
          did: DID,
          siid: 2,
          piid: 13,
          value:
            '{"forbidden_regions":[{"id":0,"fb_point":[-500,300,-500,-300,500,-300,500,300],"fb_attr":0}]}',
        },
        {
          did: DID,
          siid: 2,
          piid: 14,
          value: '{"restricted_walls":[{"id":0,"wall_points":[1,2,3,4]}]}',
        },
      ],
      action: null,
    });
  });

  it('plugin-derived, live-unconfirmed: preset add, modify, delete and start', () => {
    const text = encodePreset(PRESET);
    actionWire(presetAdd(PRESET, []), [{ piid: 42, value: text }], 2, 38);
    actionWire(
      presetModify({ ...PRESET, id: 7 }, []),
      [{ piid: 42, value: text.replace('"id":-1', '"id":7') }],
      2,
      40,
    );
    actionWire(presetDelete(7), [{ piid: 43, value: 7 }], 2, 39);
    actionWire(presetStart(7), [{ piid: 43, value: 7 }], 2, 42);
  });
});

describe('refusals before anything is sent', () => {
  it('refuses empty, duplicate and non positive room ids', () => {
    expect(() => startRooms([])).toThrow(VacuumCommandError);
    expect(() => startRooms([3, 3])).toThrow(VacuumCommandError);
    expect(() => startRooms([0])).toThrow(VacuumCommandError);
    expect(() => startRooms([1.5])).toThrow(VacuumCommandError);
  });

  it('refuses no zones, too many zones and zones that are not 8 numbers', () => {
    expect(() => startZones([])).toThrow(VacuumCommandError);
    expect(() => startZones(Array.from({ length: ZONES_MAX + 1 }, () => ZONE))).toThrow(
      VacuumCommandError,
    );
    expect(() => startZones([[1, 2, 3, 4]])).toThrow(VacuumCommandError);
    expect(() => startZones([[...ZONE.slice(0, 7), Number.NaN]])).toThrow(VacuumCommandError);
  });

  it('refuses run option values the catalog does not list', () => {
    expect(() => startHouse({ suction: 9 })).toThrow(VacuumCommandError);
    expect(() => startHouse({ sweepMopType: 2 })).toThrow(VacuumCommandError);
  });

  it('refuses a bad alert code, room id and too many restrictions', () => {
    expect(() => closeAlert(0)).toThrow(VacuumCommandError);
    expect(() => roomFloor(0, 'wood-floor')).toThrow(VacuumCommandError);
    const walls = Array.from({ length: 11 }, () => ({ points: [1, 2, 3, 4] }));
    expect(() => setRestrictions([], walls)).toThrow(VacuumCommandError);
  });

  it('plugin-derived: refuses a sixth preset and a name another preset uses', () => {
    const labels = Array.from({ length: PRESETS_MAX }, (_, id) => ({
      id: id + 1,
      name: `P${String(id)}`,
      source: 0,
    }));
    expect(() => presetAdd(PRESET, labels)).toThrow(VacuumCommandError);
    expect(() => presetAdd(PRESET, [{ id: 1, name: 'Kitchen', source: 0 }])).toThrow(
      VacuumCommandError,
    );
    expect(() =>
      presetModify({ ...PRESET, id: 2 }, [{ id: 1, name: 'Kitchen', source: 0 }]),
    ).toThrow(VacuumCommandError);
  });
});

describe('state expectations', () => {
  const everything = [
    startHouse(),
    startRooms([3]),
    startZones([ZONE]),
    pauseCleaning(),
    resumeCleaning(),
    goToDock(),
    stopCleaning(),
    findRobot(),
    closeAlert(100051),
    stationStart('dry'),
    roomFloor(3, 'marble'),
    presetStart(7),
  ];

  it('gives every command the wake plus settle budget and a summary', () => {
    for (const command of everything) {
      expect(command.expect.budget).toEqual({ wakeMs: 3000, settleMs: 5000 });
      expect(command.expect.summary).not.toBe('');
    }
    expect(COMMAND_BUDGET).toEqual({ wakeMs: 3000, settleMs: 5000 });
  });

  it('is not met by an empty state', () => {
    for (const command of everything.filter((entry) => entry.id !== 'close-alert')) {
      expect(command.expect.met(pushed({}))).toBe(false);
    }
  });

  it('meets the whole house once sweep type and config say house', () => {
    const state = { '2.5': 1, '2.40': config({ clean_mode: 1 }) };
    expect(startHouse().expect.met(pushed(state))).toBe(true);
    expect(startHouse().expect.met(pushed({ ...state, '2.5': 3 }))).toBe(false);
    expect(startHouse().expect.met(pushed({ ...state, '2.40': config({ clean_mode: 0 }) }))).toBe(
      false,
    );
  });

  it('meets rooms when 2.5 becomes 3 and 2.40 rooms equal the ids in order', () => {
    const state = { '2.5': 3, '2.40': config({ rooms: [3, 4], clean_mode: 3 }) };
    expect(startRooms([3, 4]).expect.met(pushed(state))).toBe(true);
    expect(startRooms([4, 3]).expect.met(pushed(state))).toBe(false);
    expect(startRooms([3]).expect.met(pushed(state))).toBe(false);
    expect(startRooms([3, 4]).expect.met(pushed({ ...state, '2.40': 'not json' }))).toBe(false);
    expect(startRooms([3, 4]).expect.met(pushed({ ...state, '2.40': 7 }))).toBe(false);
  });

  it('meets zones when 2.5 becomes 2 and 2.40 zones equal the corners', () => {
    const state = { '2.5': 2, '2.40': config({ zones: [ZONE], clean_mode: 2 }) };
    expect(startZones([ZONE]).expect.met(pushed(state))).toBe(true);
    expect(startZones([[1, 2, 3, 4, 5, 6, 7, 8]]).expect.met(pushed(state))).toBe(false);
  });

  it('meets pause, resume and dock by the status the robot showed live', () => {
    expect(pauseCleaning().expect.met(pushed({ '2.2': 5 }))).toBe(true);
    expect(pauseCleaning().expect.met(pushed({ '2.2': 4 }))).toBe(false);
    expect(resumeCleaning().expect.met(pushed({ '2.2': 4 }))).toBe(true);
    expect(goToDock().expect.met(pushed({ '2.2': 6 }))).toBe(true);
    expect(goToDock().expect.met(pushed({ '2.2': 2 }))).toBe(false);
  });

  it('meets stop when the running config is cleared and find robot when awake', () => {
    expect(stopCleaning().expect.met(pushed({ '2.40': config({ clean_mode: 0 }) }))).toBe(true);
    expect(stopCleaning().expect.met(pushed({ '2.40': config({ clean_mode: 1 }) }))).toBe(false);
    expect(findRobot().expect.met(pushed({ '2.25': false }))).toBe(true);
    expect(findRobot().expect.met(pushed({ '2.25': true }))).toBe(false);
  });

  it('meets close alert when the fault list no longer holds the code', () => {
    const fault = (codes: number[]): string => JSON.stringify({ ts: 1, fault: codes });
    expect(closeAlert(100051).expect.met(pushed({ '2.66': fault([]) }))).toBe(true);
    expect(closeAlert(100051).expect.met(pushed({ '2.66': fault([100051]) }))).toBe(false);
    expect(closeAlert(100051).expect.met(pushed({}))).toBe(false);
  });

  it('meets station actions by the working mode of 2.18', () => {
    const mode = (value: number): string => JSON.stringify({ mode: value, progress: 0 });
    expect(stationStart('dust-collection').expect.met(pushed({ '2.18': mode(2) }))).toBe(true);
    expect(stationStart('roller-wash').expect.met(pushed({ '2.18': mode(3) }))).toBe(true);
    expect(stationStart('dry').expect.met(pushed({ '2.18': mode(1) }))).toBe(true);
    expect(stationStart('dry').expect.met(pushed({ '2.18': mode(0) }))).toBe(false);
    expect(stationStop('dry').expect.met(pushed({ '2.18': mode(0) }))).toBe(true);
    expect(stationStop('roller-wash').expect.met(pushed({ '2.18': mode(3) }))).toBe(false);
  });

  it('meets room attribute changes from the room_attrs push of 2.16', () => {
    const attrs = (entry: Record<string, JsonValue>): string =>
      JSON.stringify({ room_attrs: [{ id: 3, room_name: 'Room4', ...entry }] });
    expect(roomFloor(3, 'wood-floor').expect.met(pushed({ '2.16': attrs({}) }))).toBe(false);
    expect(roomFloor(3, 'wood-floor').expect.met(pushed({ '2.16': attrs({ floor: 4010 }) }))).toBe(
      true,
    );
    expect(roomVisibility(3, true).expect.met(pushed({ '2.16': attrs({ notshow: 1 }) }))).toBe(
      true,
    );
    expect(roomVisibility(3, false).expect.met(pushed({ '2.16': attrs({}) }))).toBe(true);
    expect(roomVisibility(3, true).expect.met(pushed({ '2.16': attrs({}) }))).toBe(false);
  });

  it('meets restrictions when both lists read back as written', () => {
    const command = setRestrictions([{ corners: ZONE, kind: 'no-mop' }], []);
    const areas =
      '{"forbidden_regions":[{"id":0,"fb_point":[-500,300,-500,-300,500,-300,500,300],"fb_attr":1}]}';
    const walls = '{"restricted_walls":[]}';
    expect(command.expect.met(pushed({ '2.13': areas, '2.14': walls }))).toBe(true);
    expect(command.expect.met(pushed({ '2.13': '{"forbidden_regions":[]}', '2.14': walls }))).toBe(
      false,
    );
    expect(command.expect.met(pushed({ '2.13': 'broken', '2.14': walls }))).toBe(false);
  });

  it('plugin-derived: meets preset changes from the 2.42 labels and the start by 2.5', () => {
    const labels = (entries: { id: number; name: string }[]): string =>
      JSON.stringify({ user_labels: entries.map((entry) => ({ ...entry, source: 0 })) });
    const kitchen = { id: 7, name: 'Kitchen' };
    expect(presetAdd(PRESET, []).expect.met(pushed({ '2.42': labels([kitchen]) }))).toBe(true);
    expect(presetAdd(PRESET, []).expect.met(pushed({ '2.42': labels([]) }))).toBe(false);
    expect(
      presetModify({ ...PRESET, id: 7 }, []).expect.met(pushed({ '2.42': labels([kitchen]) })),
    ).toBe(true);
    expect(presetDelete(7).expect.met(pushed({ '2.42': labels([]) }))).toBe(true);
    expect(presetDelete(7).expect.met(pushed({ '2.42': labels([kitchen]) }))).toBe(false);
    expect(presetStart(7).expect.met(pushed({ '2.5': 7 }))).toBe(true);
  });
});

describe('catalog agreement', () => {
  it('uses status and sweep type values that the catalog names the same way', () => {
    expect(vacuumStatus(4)?.spec).toBe('Sweeping');
    expect(vacuumStatus(5)?.spec).toBe('Paused');
    expect(vacuumStatus(6)?.spec).toBe('Go Charging');
    const types = vacuumProperty('vacuum', 'sweep-type').values;
    expect(types.filter((entry) => [1, 2, 3, 7].includes(entry.value)).map((e) => e.spec)).toEqual([
      'Global',
      'Zone',
      'Area',
      'Custom Area',
    ]);
  });

  it('marks preset writers destructive and the starts safe-physical', () => {
    expect(presetAdd(PRESET, []).safety).toBe('destructive');
    expect(presetDelete(1).safety).toBe('destructive');
    expect(startRooms([3]).safety).toBe('safe-physical');
    expect(setRestrictions([], []).safety).toBe('safe-physical');
  });
});
