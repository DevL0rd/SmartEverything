import { FLASH_THE_LIGHTS, LEAVE_HOME_CHECK, WAKE_UP_LIGHT } from '@smarteverything/domain';
import type { Outputs } from '../../src/interpret/frames';
import { describe, expect, it } from 'vitest';
import { outputsOf, simulate } from './support';

const LIGHTS = { target: 'hall' };
const PEOPLE = [{ person: 'ann' }];

describe('flash the lights', () => {
  it('remembers the lights, flashes them the given number of times and restores them', () => {
    const run = simulate(
      FLASH_THE_LIGHTS.program,
      { lights: LIGHTS, color: { hex: '#ff0000' }, times: 2 },
      { reads: { 'device.snapshot': (): Outputs => ({ snapshot: { hall: { power: true } } }) } },
    );
    expect(run.effects.map((call) => [call.kind, call.params['control']])).toEqual([
      ['device.set', 'color'],
      ['device.set', 'power'],
      ['device.set', 'color'],
      ['device.set', 'power'],
      ['device.restore', undefined],
    ]);
    expect(run.effects[0]?.params['to']).toEqual({ hex: '#ff0000' });
    expect(run.effects[4]?.params['snapshot']).toEqual({ hall: { power: true } });
  });
});

describe('wake-up light', () => {
  it('starts at one percent in warm white and fades to full over the given time', () => {
    const run = simulate(WAKE_UP_LIGHT.program, { lights: LIGHTS, over: 600_000 });
    expect(
      run.effects.map((call) => [call.kind, call.params['control'], call.params['to']]),
    ).toEqual([
      ['device.set', 'power', true],
      ['device.set', 'color_temperature', 2700],
      ['device.set', 'brightness', 1],
      ['device.fade', 'brightness', 100],
    ]);
    expect(run.effects[3]?.params).toMatchObject({ over: 600_000, from: 1 });
  });
});

describe('leave home check', () => {
  const inputs = { people: PEOPLE, lights: LIGHTS, openings: { target: 'doors' } };
  const aggregate = (matching: Outputs[]): Record<string, () => Outputs> => ({
    'device.aggregate': (): Outputs => ({
      value: matching.length > 0,
      count: matching.length,
      matching,
    }),
  });

  it('switches the lights off and names what was left open', () => {
    const run = simulate(LEAVE_HOME_CHECK.program, inputs, {
      reads: aggregate([{ device: 'window' }, { device: 'door' }]),
    });
    expect(run.effects.map((call) => call.kind)).toEqual(['device.set', 'notify.person']);
    expect(run.effects[0]?.params).toMatchObject({ control: 'power', to: false });
    expect(run.effects[1]?.params).toMatchObject({ people: PEOPLE });
    expect(outputsOf(run)['openItems']).toEqual(['window', 'door']);
  });

  it('says nothing when everything is closed', () => {
    const run = simulate(LEAVE_HOME_CHECK.program, inputs, { reads: aggregate([]) });
    expect(run.effects.map((call) => call.kind)).toEqual(['device.set']);
    expect(outputsOf(run)['openItems']).toEqual([]);
  });
});
