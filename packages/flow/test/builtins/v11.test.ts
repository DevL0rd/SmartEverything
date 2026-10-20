import {
  ASK_THEN_ACT,
  CAMERA_CHECK,
  DOORBELL_FLASH,
  LEAVE_HOME_CHECK,
  WAKE_UP_LIGHT,
} from '@smarteverything/domain';
import type { Outputs } from '../../src/interpret/frames';
import { describe, expect, it } from 'vitest';
import { outputsOf, simulate } from './support';

const LIGHTS = { target: 'hall' };
const PEOPLE = [{ person: 'ann' }];

function exitOf(run: ReturnType<typeof simulate>): string | undefined {
  return run.outcome.kind === 'done' ? run.outcome.exit : undefined;
}

describe('flash the lights', () => {
  it('remembers the lights, flashes them the given number of times and restores them', () => {
    const run = simulate(
      DOORBELL_FLASH.program,
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

describe('camera check', () => {
  const world = (verdict: boolean): Parameters<typeof simulate>[2] => ({
    effects: {
      'camera.snapshot': (): Outputs => ({ image: 'pic-1', at: '2026-10-19T00:00:00Z' }),
      'ai.vision': (): Outputs => ({ answer: 'A person stands at the door.', tokens: 10, cost: 0 }),
      'ai.decide': (): Outputs => ({ answer: verdict, reason: 'It says so.', tokens: 5, cost: 0 }),
    },
  });
  const inputs = { camera: { camera: 'porch' }, question: 'Is a person at the door?' };

  it('takes a picture, asks the AI about it and leaves by yes', () => {
    const run = simulate(CAMERA_CHECK.program, inputs, world(true));
    expect(run.effects.map((call) => call.kind)).toEqual([
      'camera.snapshot',
      'ai.vision',
      'ai.decide',
    ]);
    expect(run.effects[1]?.params).toMatchObject({ image: 'pic-1' });
    expect(exitOf(run)).toBe('yes');
    expect(outputsOf(run)).toEqual({ answer: 'A person stands at the door.' });
  });

  it('leaves by no when the AI says no', () => {
    expect(exitOf(simulate(CAMERA_CHECK.program, inputs, world(false)))).toBe('no');
  });
});

describe('ask, then act', () => {
  const inputs = { person: { person: 'ann' }, question: 'Lock the door?' };

  it('asks the person with a yes and a no button and leaves by yes', () => {
    const run = simulate(ASK_THEN_ACT.program, inputs, { answer: 'Yes' });
    expect(run.effects.map((call) => call.kind)).toEqual(['notify.ask']);
    expect(run.effects[0]?.params).toEqual({
      person: { person: 'ann' },
      question: 'Lock the door?',
      options: ['Yes', 'No'],
      timeout: 3_600_000,
    });
    expect(exitOf(run)).toBe('yes');
  });

  it('leaves by no when the answer is no', () => {
    expect(exitOf(simulate(ASK_THEN_ACT.program, inputs, { answer: 'No' }))).toBe('no');
  });

  it('leaves by timed out when nobody answers in time', () => {
    expect(exitOf(simulate(ASK_THEN_ACT.program, inputs, { answer: 'timeout' }))).toBe('timedOut');
  });

  it('fails when the question cannot be sent', () => {
    const run = simulate(ASK_THEN_ACT.program, inputs, { unreachable: ['notify.ask'] });
    expect(run.outcome).toMatchObject({ kind: 'failed', error: { class: 'Unreachable' } });
  });
});
