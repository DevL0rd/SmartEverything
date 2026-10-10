import { readFileSync } from 'node:fs';
import { CommandRefusedError, DEVICE_CAPABILITY } from '@smarteverything/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MIOT_SPEC,
  MISS_MOTOR_PATH,
  MOTOR_METHOD,
  MOTOR_MODELS,
  MOTOR_OPERATIONS,
  NO_MOTOR,
  PTZ_DIRECTIONS,
  cameraFeatures,
  cloudRpc,
  describePtz,
  hasMotor,
  missUnreachable,
  parsePositions,
  positionsReading,
  presetWrite,
  ptzCapabilities,
  ptzPlan,
  ptzStep,
  type MiotService,
  type MiotSpec,
  type PresetSlots,
  type PtzPlan,
} from '../src';

function fixture(name: string): MiotSpec {
  return MIOT_SPEC.parse(
    JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8')),
  );
}

function service(
  iid: number,
  type: string,
  parts: Partial<Pick<MiotService, 'properties' | 'actions'>> = {},
): MiotService {
  return {
    iid,
    type,
    description: '',
    properties: parts.properties ?? [],
    actions: parts.actions ?? [],
    events: [],
  };
}

function camera(...services: MiotService[]): MiotSpec {
  return { type: 'urn:miot-spec-v2:device:camera:0:x:1', description: '', services };
}

function action(iid: number, name: string, namespace = 'miot-spec-v2'): MiotService['actions'][0] {
  return { iid, type: `urn:${namespace}:action:${name}:0:x:1`, description: '', in: [], out: [] };
}

function property(
  iid: number,
  name: string,
  range?: [number, number, number],
): MiotService['properties'][0] {
  return {
    iid,
    type: `urn:miot-spec-v2:property:${name}:0:x:1`,
    description: '',
    format: name === 'fav-area' ? 'string' : 'uint8',
    access: ['read', 'write', 'notify'],
    ...(range === undefined ? {} : { 'value-range': range }),
  };
}

const FAV_AREA = 'urn:miot-spec-v2:service:camera-fav-area:0:x:1';
const SLOTS: PresetSlots = {
  list: { siid: 10, piid: 1 },
  active: { siid: 10, piid: 2 },
  min: 0,
  max: 64,
};
const NOTHING: PtzPlan = {
  moves: { kind: 'none', reason: NO_MOTOR },
  calibrate: null,
  presets: null,
  cruise: false,
};
const FULL: PtzPlan = {
  moves: { kind: 'miio' },
  calibrate: { siid: 2, aiid: 1 },
  presets: SLOTS,
  cruise: true,
};
const MISS: PtzPlan = { ...FULL, moves: { kind: 'miss' } };

describe('the pan and tilt plan', () => {
  it('moves a MISS camera with calibrate, saved positions and cruise through its P2P session', () => {
    expect(ptzPlan(fixture('xiaomi-091ac1'), 'xiaomi.camera.091ac1')).toStrictEqual({
      moves: { kind: 'miss' },
      calibrate: { siid: 2, aiid: 1 },
      presets: SLOTS,
      cruise: true,
    });
  });

  it('moves the legacy chuangmi cameras python-miio lists through set_motor', () => {
    expect([...MOTOR_MODELS]).toStrictEqual([
      'chuangmi.camera.ipc009',
      'chuangmi.camera.ipc013',
      'chuangmi.camera.ipc019',
      'chuangmi.camera.021a04',
      'chuangmi.camera.038a2',
    ]);
    expect(ptzPlan(fixture('chuangmi-ipc019'), 'chuangmi.camera.ipc019')).toStrictEqual({
      moves: { kind: 'miio' },
      calibrate: null,
      presets: null,
      cruise: false,
    });
    expect(ptzPlan(fixture('chuangmi-ipc019'), 'chuangmi.camera.ipc021').moves).toStrictEqual({
      kind: 'none',
      reason: 'the camera has no pan and tilt motor',
    });
  });

  it('moves over MISS any camera whose spec shows one pan and tilt mechanism', () => {
    const calibrate = service(2, 'urn:miot-spec-v2:service:camera-control:0:x:1', {
      actions: [action(1, 'ptz-calibrate')],
    });
    const presets = service(9, FAV_AREA, {
      properties: [property(1, 'fav-area'), property(2, 'active-fav-area', [0, 64, 1])],
    });
    const cruise = service(11, 'urn:miot-spec-v2:service:cruise:0:x:1');
    for (const one of [calibrate, presets, cruise]) {
      expect(ptzPlan(camera(one), 'xiaomi.camera.x').moves).toStrictEqual({ kind: 'miss' });
    }
    expect(ptzPlan(camera(calibrate), 'chuangmi.camera.ipc013').moves).toStrictEqual({
      kind: 'miio',
    });
    expect(ptzPlan(camera(), 'xiaomi.camera.x').moves.kind).toBe('none');
  });

  it('drops MISS moves, and only those, when the hub cannot reach the camera session', () => {
    expect(missUnreachable(MISS, 'no stream')).toStrictEqual({
      ...MISS,
      moves: { kind: 'none', reason: 'no stream' },
    });
    expect(missUnreachable(FULL, 'no stream')).toBe(FULL);
    expect(missUnreachable(NOTHING, 'no stream')).toBe(NOTHING);
  });

  it('takes the first standard ptz-calibrate action of any camera-control service', () => {
    const spec = camera(
      service(2, 'urn:miot-spec-v2:service:camera-control:0:x:1', {
        actions: [action(1, 'restart-device'), action(4, 'ptz-calibrate', 'isa-spec')],
      }),
      service(5, 'urn:miot-spec-v2:service:speaker:0:x:1', {
        actions: [action(1, 'ptz-calibrate')],
      }),
      service(7, 'urn:miot-spec-v2:service:camera-control:0:x:1', {
        actions: [action(3, 'ptz-calibrate'), action(4, 'ptz-calibrate')],
      }),
    );
    expect(ptzPlan(spec, 'm').calibrate).toStrictEqual({ siid: 7, aiid: 3 });
  });

  it('needs the saved list, the active slot and its range to offer saved positions', () => {
    const list = property(1, 'fav-area');
    const active = property(2, 'active-fav-area', [1, 6, 1]);
    expect(
      ptzPlan(camera(service(9, FAV_AREA, { properties: [list, active] })), 'm').presets,
    ).toStrictEqual({
      list: { siid: 9, piid: 1 },
      active: { siid: 9, piid: 2 },
      min: 1,
      max: 6,
    });
    for (const properties of [[list], [active], [list, property(2, 'active-fav-area')]]) {
      expect(ptzPlan(camera(service(9, FAV_AREA, { properties })), 'm').presets).toBeNull();
    }
    const vendor = service(9, 'urn:chuangmi-spec:service:camera-fav-area:0:x:1', {
      properties: [list, active],
    });
    expect(ptzPlan(camera(vendor), 'm').presets).toBeNull();
  });

  it('counts a camera as motorised when any pan and tilt mechanism exists', () => {
    expect(hasMotor(NOTHING)).toBe(false);
    expect(hasMotor({ ...NOTHING, moves: { kind: 'miio' } })).toBe(true);
    expect(hasMotor({ ...NOTHING, moves: { kind: 'miss' } })).toBe(true);
    expect(hasMotor({ ...NOTHING, cruise: true })).toBe(true);
    expect(hasMotor({ ...NOTHING, calibrate: { siid: 1, aiid: 1 } })).toBe(true);
    expect(hasMotor({ ...NOTHING, presets: SLOTS })).toBe(true);
    expect(cameraFeatures(fixture('chuangmi-ipc019'), 'chuangmi.camera.ipc019').physicalPtz).toBe(
      true,
    );
    expect(cameraFeatures(fixture('chuangmi-ipc019'), 'chuangmi.camera.ipc021').physicalPtz).toBe(
      false,
    );
    expect(
      cameraFeatures(
        camera(
          service(9, FAV_AREA, {
            properties: [property(1, 'fav-area'), property(2, 'active-fav-area', [0, 64, 1])],
          }),
        ),
        'm',
      ).physicalPtz,
    ).toBe(true);
  });
});

describe('saved camera positions', () => {
  it('are read from the fav-area JSON list with their names or slot numbers', () => {
    const raw = JSON.stringify([
      { idx: 1, pos: '[69,66]', name: ' Door ' },
      { idx: 2, pos: '[10,10]' },
      { idx: 3, name: 'Door' },
      { idx: 4, name: '' },
      { idx: 'x' },
    ]);
    expect(parsePositions(raw, SLOTS)).toStrictEqual({
      positions: [
        { index: 1, label: 'Door' },
        { index: 2, label: 'Position 2' },
        { index: 3, label: 'Door (3)' },
        { index: 4, label: 'Position 4' },
      ],
      malformed: ['{"idx":"x"} is not a saved position with idx 0 to 64'],
    });
  });

  it('keep only slots the active-fav-area range accepts', () => {
    const slots = { ...SLOTS, min: 1, max: 6 };
    const raw = JSON.stringify([0, 1, 6, 7].map((idx) => ({ idx })));
    expect(parsePositions(raw, slots)).toStrictEqual({
      positions: [
        { index: 1, label: 'Position 1' },
        { index: 6, label: 'Position 6' },
      ],
      malformed: [
        '{"idx":0} is not a saved position with idx 1 to 6',
        '{"idx":7} is not a saved position with idx 1 to 6',
      ],
    });
  });

  it('are empty for an empty value and unreadable for anything but a JSON list', () => {
    expect(parsePositions(' ', SLOTS)).toStrictEqual({ positions: [], malformed: [] });
    expect(parsePositions('[]', SLOTS)).toStrictEqual({ positions: [], malformed: [] });
    expect(parsePositions(3, SLOTS)).toStrictEqual({
      positions: [],
      malformed: ['fav-area is 3, expected JSON text'],
    });
    expect(parsePositions('{"idx":1}', SLOTS)).toStrictEqual({
      positions: [],
      malformed: ['fav-area is {"idx":1}, expected a JSON list'],
    });
    expect(parsePositions('[', SLOTS).malformed).toStrictEqual([
      expect.stringMatching(/^fav-area is not JSON \(SyntaxError: .+\)$/),
    ]);
  });

  it('always carry distinct labels for distinct slots', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ idx: fc.integer({ min: 0, max: 64 }), name: fc.constantFrom('', 'A', 'B') }),
        ),
        (entries) => {
          const unique = entries.filter(
            (entry, index) => entries.findIndex((other) => other.idx === entry.idx) === index,
          );
          const { positions, malformed } = parsePositions(JSON.stringify(unique), SLOTS);
          expect(malformed).toStrictEqual([]);
          expect(new Set(positions.map(({ label }) => label)).size).toBe(unique.length);
        },
      ),
    );
  });

  it('come only from a successful reading of the fav-area property', () => {
    const raw = JSON.stringify([{ idx: 2 }]);
    const expected = { positions: [{ index: 2, label: 'Position 2' }], malformed: [] };
    expect(positionsReading(FULL, { siid: 10, piid: 1, ok: true, value: raw })).toStrictEqual(
      expected,
    );
    expect(positionsReading(NOTHING, { siid: 10, piid: 1, ok: true, value: raw })).toBeNull();
    expect(positionsReading(FULL, { siid: 10, piid: 1, ok: false, code: -4004 })).toBeNull();
    expect(positionsReading(FULL, { siid: 11, piid: 1, ok: true, value: raw })).toBeNull();
    expect(positionsReading(FULL, { siid: 10, piid: 2, ok: true, value: raw })).toBeNull();
  });
});

describe('pan and tilt capabilities', () => {
  const door = [{ index: 1, label: 'Door' }];

  it('offer directions only with a motor command and saved positions only when some exist', () => {
    expect(ptzCapabilities(NOTHING, door)).toStrictEqual([]);
    expect(ptzCapabilities({ ...NOTHING, presets: SLOTS }, [])).toStrictEqual([]);
    expect(ptzCapabilities({ ...NOTHING, calibrate: { siid: 2, aiid: 1 } }, [])).toStrictEqual([]);
    expect(ptzCapabilities(MISS, []).map(({ key }) => key)).toStrictEqual(['ptz']);
    const capabilities = ptzCapabilities(FULL, door);
    expect(capabilities).toStrictEqual([
      {
        key: 'ptz',
        label: 'Pan and tilt',
        access: 'write',
        value: { kind: 'action', arguments: ['direction'] },
      },
      {
        key: 'ptz_preset',
        label: 'Camera position',
        access: 'write',
        value: { kind: 'enum', options: ['Door'] },
      },
    ]);
    for (const capability of capabilities) {
      expect(DEVICE_CAPABILITY.safeParse(capability).success).toBe(true);
    }
  });

  it('turn each direction into its set_motor operation and home into ptz-calibrate', () => {
    expect(MOTOR_METHOD).toBe('set_motor');
    expect(PTZ_DIRECTIONS).toStrictEqual(['up', 'down', 'left', 'right', 'home']);
    const operations = Object.fromEntries(
      ['left', 'right', 'up', 'down'].map((direction) => [
        direction,
        ptzStep(FULL, 'm', { direction }),
      ]),
    );
    expect(operations).toStrictEqual({
      left: { kind: 'miio', method: 'set_motor', params: { operation: 1 } },
      right: { kind: 'miio', method: 'set_motor', params: { operation: 2 } },
      up: { kind: 'miio', method: 'set_motor', params: { operation: 3 } },
      down: { kind: 'miio', method: 'set_motor', params: { operation: 4 } },
    });
    expect(ptzStep(FULL, 'm', { direction: 'home' })).toStrictEqual({
      kind: 'action',
      action: { siid: 2, aiid: 1 },
    });
  });

  it('turn every direction and home into a MISS motor operation on a MISS camera', () => {
    expect(MOTOR_OPERATIONS).toStrictEqual({ left: 1, right: 2, up: 3, down: 4, home: 5 });
    for (const direction of PTZ_DIRECTIONS) {
      expect(ptzStep(MISS, 'm', { direction })).toStrictEqual({
        kind: 'motor',
        operation: MOTOR_OPERATIONS[direction],
      });
    }
    expect(ptzStep({ ...MISS, calibrate: null }, 'm', { direction: 'home' })).toStrictEqual({
      kind: 'motor',
      operation: 5,
    });
  });

  it('refuse unknown directions, home without calibrate and moves without a motor command', () => {
    expect(() => ptzStep(FULL, 'm', { direction: 'spin' })).toThrow(
      new CommandRefusedError('ptz', 'the direction must be one of up, down, left, right, home'),
    );
    expect(() => ptzStep(FULL, 'm', null)).toThrow(CommandRefusedError);
    expect(() => ptzStep({ ...FULL, calibrate: null }, 'cam.x', { direction: 'home' })).toThrow(
      new CommandRefusedError('ptz', 'cam.x has no MIoT ptz-calibrate action to return home'),
    );
    expect(() =>
      ptzStep({ ...FULL, moves: { kind: 'none', reason: 'no stream' } }, 'cam.y', {
        direction: 'up',
      }),
    ).toThrow(new CommandRefusedError('ptz', 'cam.y cannot move: no stream'));
    expect(
      ptzStep({ ...NOTHING, calibrate: { siid: 2, aiid: 1 } }, 'cam.z', { direction: 'home' }),
    ).toStrictEqual({ kind: 'action', action: { siid: 2, aiid: 1 } });
  });

  it('go to a saved position by writing its slot to active-fav-area', () => {
    expect(presetWrite(FULL, door, 'Door')).toStrictEqual({ siid: 10, piid: 2, value: 1 });
    expect(() => presetWrite(FULL, door, 'Garden')).toThrow(
      new CommandRefusedError('ptz_preset', 'no saved position is named "Garden"'),
    );
    expect(() => presetWrite(NOTHING, door, 'Door')).toThrow(
      new CommandRefusedError('ptz_preset', 'the camera has no MIoT camera-fav-area service'),
    );
  });

  it('name the mechanism for every part in the device details', () => {
    expect(describePtz(FULL)).toBe(
      'moves: miIO set_motor; home: MIoT action 2.1 ptz-calibrate; presets: MIoT property 10.2 active-fav-area',
    );
    expect(describePtz(NOTHING)).toBe(
      'moves: none: the camera has no pan and tilt motor; home: none; presets: none',
    );
    expect(MISS_MOTOR_PATH).toBe('/api/xiaomi/motor');
    expect(describePtz(MISS)).toBe(
      'moves: MISS command 0x112 through go2rtc /api/xiaomi/motor; ' +
        'home: MISS command 0x112 through go2rtc /api/xiaomi/motor operation 5; ' +
        'presets: MIoT property 10.2 active-fav-area',
    );
  });

  it('send miIO commands through the cloud RPC path of the device', () => {
    expect(cloudRpc('lumi.1/2', 'set_motor', { operation: 1 })).toStrictEqual({
      path: '/home/rpc/lumi.1%2F2',
      data: { method: 'set_motor', params: { operation: 1 } },
    });
  });
});
