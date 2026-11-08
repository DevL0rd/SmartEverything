import { LIGHTS_OFF_AFTER } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { outputsOf, reading, simulate } from './support';

const LIGHTS = { target: 'living' };

function controls(run: ReturnType<typeof simulate>): [unknown, unknown][] {
  return run.effects.map((call) => [call.params['control'], call.params['to']]);
}

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
