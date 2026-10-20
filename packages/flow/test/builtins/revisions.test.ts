import type { BuiltinFunction } from '@smarteverything/domain';
import { BUILTIN_FUNCTIONS, PRESS_CYCLE_BRIGHTNESS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { classifyInterfaceChange } from '../../src/functions/compat';
import { interfaceHash, interfaceOf } from '../../src/functions/interface-hash';

interface Released {
  readonly revision: number;
  readonly hash: string;
}

const RELEASED: Readonly<Record<string, Released>> = {
  'builtin.press_cycle_brightness': {
    revision: 1,
    hash: 'e9f5ebcb4c2ef46e2613b3feecd15077e966b80de57a24f920dbc29ca8dfd518',
  },
  'builtin.long_press_reset': {
    revision: 1,
    hash: 'a78d2ab92efc790f17ae4d4871558523b23d2d8776698cd7314035e8325917e4',
  },
  'builtin.presence_lights': {
    revision: 1,
    hash: '29c9e7a9903425c583116990fc5bda60e4c5583f9ee6d3daf2ee33a891c47c7d',
  },
  'builtin.speak_or_push': {
    revision: 1,
    hash: 'df40676be440735c77259f1e0db6c77b43c34ebce569c7052b874374c73ec71e',
  },
  'builtin.appliance_notice': {
    revision: 1,
    hash: '28e7a2a1329b8852bce318c43bbcad97ed3b737d403eb2ba2403e4c9c1322cb3',
  },
  'builtin.timed_devices': {
    revision: 1,
    hash: '1ed883b007e88db0a9616fc6b40f5e325660c8a7bd19be135b333e7f10bb0698',
  },
  'builtin.average_in_room': {
    revision: 1,
    hash: '323693b11e95972033808e12f14bf3896ad996d2a4f79820ec4f991ec249b7d5',
  },
  'builtin.weather_look': {
    revision: 2,
    hash: '9a0040ff961094234be4c66233ee6bb8d99e772118e5f223c60b0c6fbd2f5904',
  },
  'builtin.lights_off_after': {
    revision: 1,
    hash: 'cb3060e6007bedf61a7aa1a114cac1a03c931a603ebc0506eab71da7e8900a71',
  },
  'builtin.doorbell_flash': {
    revision: 1,
    hash: 'dd12057f00f2baf4094af25642842f4c57877d9a11ac66cf56c669c8bce5b9cc',
  },
  'builtin.wake_up_light': {
    revision: 1,
    hash: '739089bd73330def13e1e0efb92a55b709646e18a14216a47bd243cdec5dd383',
  },
  'builtin.leave_home_check': {
    revision: 1,
    hash: '1ac23e9b08f6730c0b3adee7060d8b9a0562a2c518e7d836750d95be2d5aec5f',
  },
  'builtin.ask_then_act': {
    revision: 1,
    hash: '76dab44b9cd62f30e5d1ed37e8a81eeabb0c97e8e19b41aaf83537436d122d96',
  },
  'builtin.camera_check': {
    revision: 1,
    hash: '180b9c2602bc2a093d50af4838f83d9148836ab1492b3807f22f4627e21748b3',
  },
};

function unbumped(entry: BuiltinFunction, released: Released | undefined): string | undefined {
  if (released === undefined) return `${entry.id} has no released revision recorded`;
  if (interfaceHash(interfaceOf(entry.program)) === released.hash) return undefined;
  return entry.revision > released.revision
    ? undefined
    : `${entry.id} changed its interface at revision ${String(entry.revision)}; bump the revision and record the new hash`;
}

describe('built-in revisions', () => {
  it('record a released interface for every built-in and no extra ones', () => {
    expect(Object.keys(RELEASED).sort()).toEqual(BUILTIN_FUNCTIONS.map((entry) => entry.id).sort());
  });

  it.each(BUILTIN_FUNCTIONS)('$id keeps its released interface or bumps its revision', (entry) => {
    expect(unbumped(entry, RELEASED[entry.id])).toBeUndefined();
  });

  it('catches a breaking interface change that kept its revision', () => {
    const [first, ...others] = PRESS_CYCLE_BRIGHTNESS.program.inputs;
    const changed: BuiltinFunction = {
      ...PRESS_CYCLE_BRIGHTNESS,
      program: { ...PRESS_CYCLE_BRIGHTNESS.program, inputs: others },
    };
    expect(first).toBeDefined();
    const released = RELEASED[PRESS_CYCLE_BRIGHTNESS.id];
    expect(unbumped(changed, released)).toContain('bump the revision');
    expect(
      classifyInterfaceChange(
        interfaceOf(PRESS_CYCLE_BRIGHTNESS.program),
        interfaceOf(changed.program),
      ).result,
    ).toBe('breaking');
    expect(unbumped({ ...changed, revision: 2 }, released)).toBeUndefined();
  });
});
