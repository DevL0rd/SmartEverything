import {
  LIGHTS_OFF_AFTER,
  LONG_PRESS_RESET,
  PRESENCE_LIGHTS,
  PRESS_CYCLE_BRIGHTNESS,
} from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import type { Outputs } from '../../src/interpret/frames';
import { describe, expect, it } from 'vitest';
import { aggregated, outputsOf, reading, simulate } from './support';

const LIGHTS = { target: 'living' };

function press(step: number, extra: Record<string, JsonValue> = {}): ReturnType<typeof simulate> {
  return simulate(PRESS_CYCLE_BRIGHTNESS.program, { lights: LIGHTS, step, ...extra });
}

function controls(run: ReturnType<typeof simulate>): [unknown, unknown][] {
  return run.effects.map((call) => [call.params['control'], call.params['to']]);
}

describe('press cycles brightness', () => {
  it('goes from off to the first step in warm white', () => {
    const run = press(0);
    expect(controls(run)).toEqual([
      ['brightness', 1],
      ['color_temperature', 2700],
    ]);
    expect(outputsOf(run)).toEqual({ step: 1, level: 1 });
  });

  it('moves through the middle steps with a brightness only', () => {
    const run = press(2);
    expect(controls(run)).toEqual([['brightness', 50]]);
    expect(outputsOf(run)).toEqual({ step: 3, level: 50 });
  });

  it('reaches the last step and then wraps to off at step 0', () => {
    expect(outputsOf(press(4))).toEqual({ step: 5, level: 100 });
    const wrapped = press(5);
    expect(controls(wrapped)).toEqual([['power', false]]);
    expect(wrapped.effects[0]?.params['target']).toEqual(LIGHTS);
    expect(outputsOf(wrapped)).toEqual({ step: 0, level: 0 });
  });

  it('follows its own levels and wraps after the last one', () => {
    const levels = { levels: [10, 20] };
    expect(outputsOf(press(1, levels))).toEqual({ step: 2, level: 20 });
    expect(outputsOf(press(2, levels))).toEqual({ step: 0, level: 0 });
  });

  it('uses the warm colour temperature it was given', () => {
    const run = simulate(PRESS_CYCLE_BRIGHTNESS.program, {
      lights: LIGHTS,
      step: 0,
      warmKelvin: 2200,
    });
    expect(controls(run)[1]).toEqual(['color_temperature', 2200]);
  });
});

describe('long press resets', () => {
  it('turns the lights off and returns step 0', () => {
    const run = simulate(LONG_PRESS_RESET.program, { lights: LIGHTS });
    expect(controls(run)).toEqual([['power', false]]);
    expect(outputsOf(run)).toEqual({ step: 0 });
  });
});

const DARK: Record<string, () => Outputs> = { 'device.get': (): Outputs => reading('dark') };

function presence(
  inputs: Record<string, JsonValue>,
  lampsOn: boolean,
  reads: Record<string, () => Outputs> = DARK,
): ReturnType<typeof simulate> {
  return simulate(
    PRESENCE_LIGHTS.program,
    { lights: LIGHTS, occupied: true, ...inputs },
    { reads: { ...reads, 'device.aggregate': () => aggregated(lampsOn, 1) } },
  );
}

const BRIGHT: Record<string, () => Outputs> = { 'device.get': (): Outputs => reading('bright') };

describe('presence lights', () => {
  it('turns the lights on for someone in a dark room and remembers it did', () => {
    const run = presence({ darkSensor: { device: 'lux' } }, false);
    expect(controls(run)).toEqual([['power', true]]);
    expect(outputsOf(run)).toEqual({ turnedOn: true, autoOn: true });
  });

  it('counts a room without a sensor as dark', () => {
    const run = simulate(
      PRESENCE_LIGHTS.program,
      { lights: LIGHTS, occupied: true },
      { reads: { 'device.aggregate': () => aggregated(false, 1) } },
    );
    expect(outputsOf(run)).toEqual({ turnedOn: true, autoOn: true });
  });

  it.each<[string, Record<string, JsonValue>, boolean, Record<string, () => Outputs>]>([
    ['the room is bright', { darkSensor: { device: 'lux' } }, false, BRIGHT],
    ['the lights are already on', {}, true, DARK],
    ['switching on is not allowed now', { allowed: false }, false, DARK],
  ])('leaves the lights alone when %s', (_name, inputs, lampsOn, reads): void => {
    const run = presence(inputs, lampsOn, reads);
    expect(run.effects).toEqual([]);
    expect(outputsOf(run)).toEqual({ turnedOn: false, autoOn: false });
  });

  it('turns the lights off in an empty room only when presence switched them on', () => {
    const off = presence({ occupied: false, autoOn: true }, true);
    expect(controls(off)).toEqual([['power', false]]);
    expect(outputsOf(off)).toEqual({ turnedOn: false, autoOn: false });
    const manual = presence({ occupied: false, autoOn: false }, true);
    expect(manual.effects).toEqual([]);
  });
});

describe('lights off after no motion', () => {
  const inputs = { lights: LIGHTS, sensor: { device: 'pir' }, after: 600_000 };

  function quiet(motion: boolean[]): ReturnType<typeof simulate> {
    const answers = [...motion];
    return simulate(LIGHTS_OFF_AFTER.program, inputs, {
      reads: { 'device.get': () => reading(answers.shift() ?? false) },
    });
  }

  it('turns the lights off when the room stayed quiet for the whole time', () => {
    const run = quiet([false, false]);
    expect(controls(run)).toEqual([['power', false]]);
    expect(outputsOf(run)).toEqual({ turnedOff: true });
  });

  it('leaves the lights on when motion came back during the wait', () => {
    const run = quiet([false, true]);
    expect(run.effects).toEqual([]);
    expect(outputsOf(run)).toEqual({ turnedOff: false });
  });
});
