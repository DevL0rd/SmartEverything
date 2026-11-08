import {
  CommandRefusedError,
  EMPTY_IR_REMOTE_STATE,
  type IrApplianceKeyRow,
  type IrRemoteState,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { IrEncoders, LEARNED_KEYS_ENCODER } from '../../src/infrared/encoders';

const AT = '2026-10-25T09:00:00.000Z';

function key(button: string): IrApplianceKeyRow {
  return {
    id: `00000000-0000-4000-8000-${String(button.length).padStart(12, '0')}`,
    appliance_id: '00000000-0000-4000-8000-000000000001',
    button,
    format: 'pulses',
    code: `code-${button}`,
    created_at: AT,
  };
}

const DISCRETE = ['Power', 'Temp up', 'Temp down', 'Mode', 'Speed'].map(key);
const ON: IrRemoteState = { ...EMPTY_IR_REMOTE_STATE, on: true, temp: 24, mode: 'Cool', speed: 2 };

function pressed(
  keys: readonly IrApplianceKeyRow[],
  from: IrRemoteState,
  goal: Parameters<typeof LEARNED_KEYS_ENCODER.frames>[2],
): string[] {
  return LEARNED_KEYS_ENCODER.frames(keys, from, goal).map((frame) => frame.key);
}

describe('the learned keys encoder', () => {
  it('steps the temperature with the up and down buttons from the assumed one', () => {
    expect(pressed(DISCRETE, ON, { temp: 21 })).toStrictEqual([
      'Temp down',
      'Temp down',
      'Temp down',
    ]);
    expect(pressed(DISCRETE, ON, { temp: 25 })).toStrictEqual(['Temp up']);
    expect(pressed(DISCRETE, ON, { temp: 24 })).toStrictEqual([]);
  });

  it('cycles the mode button forward to the wanted mode', () => {
    expect(pressed(DISCRETE, ON, { mode: 'Dry' })).toStrictEqual(['Mode', 'Mode']);
    expect(pressed(DISCRETE, { ...ON, mode: 'Auto' }, { mode: 'Cool' })).toStrictEqual(['Mode']);
  });

  it('uses a mode’s own button when the remote has one', () => {
    const keys = [...DISCRETE, key('Heat')];
    expect(pressed(keys, ON, { mode: 'Heat' })).toStrictEqual(['Heat']);
  });

  it('cycles the fan speed, or steps it when it has up and down buttons', () => {
    expect(pressed(DISCRETE, ON, { speed: 1 })).toStrictEqual(['Speed', 'Speed', 'Speed', 'Speed']);
    const stepped = [...DISCRETE, key('Fan up'), key('Fan down')];
    expect(pressed(stepped, ON, { speed: 4 })).toStrictEqual(['Fan up', 'Fan up']);
  });

  it('turns it on first and off last, around the other changes', () => {
    const off = { ...ON, on: false };
    expect(pressed(DISCRETE, off, { on: true, temp: 23 })).toStrictEqual(['Power', 'Temp down']);
    expect(pressed(DISCRETE, ON, { on: false, temp: 25 })).toStrictEqual(['Temp up', 'Power']);
    expect(pressed(DISCRETE, ON, { on: true })).toStrictEqual([]);
  });

  it('sends each button’s own learned code', () => {
    expect(LEARNED_KEYS_ENCODER.frames(DISCRETE, ON, { temp: 25 })).toStrictEqual([
      { key: 'Temp up', format: 'pulses', code: 'code-Temp up' },
    ]);
  });

  it('refuses when a value it counts from is unknown, a button is missing or the appliance is off', () => {
    const refuse = (
      keys: readonly IrApplianceKeyRow[],
      from: IrRemoteState,
      goal: object,
    ): void => {
      expect(() => LEARNED_KEYS_ENCODER.frames(keys, from, goal)).toThrow(CommandRefusedError);
    };
    refuse(DISCRETE, { ...ON, temp: null }, { temp: 22 });
    refuse(DISCRETE, { ...ON, on: null }, { on: true });
    refuse(DISCRETE, { ...ON, mode: null }, { mode: 'Heat' });
    refuse([key('Power')], ON, { temp: 22 });
    refuse(DISCRETE, { ...ON, on: false }, { temp: 22 });
  });
});

describe('the encoder registry', () => {
  it('finds an installed encoder and names one that is missing', () => {
    const encoders = new IrEncoders([LEARNED_KEYS_ENCODER]);
    expect(encoders.of('learned')).toBe(LEARNED_KEYS_ENCODER);
    expect(() => encoders.of('library:1109')).toThrow('No IR encoder named library:1109');
  });
});
