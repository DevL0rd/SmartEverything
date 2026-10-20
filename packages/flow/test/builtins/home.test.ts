import {
  APPLIANCE_NOTICE,
  AVERAGE_IN_ROOM,
  SPEAK_OR_PUSH,
  TIMED_DEVICES,
  WEATHER_LOOK,
} from '@smarteverything/domain';
import type { Outputs } from '../../src/interpret/frames';
import { describe, expect, it } from 'vitest';
import { aggregated, outputsOf, simulate } from './support';

const PEOPLE = [{ person: 'ann' }];

describe('say it, or push it', () => {
  const inputs = { speaker: { target: 'kitchen' }, people: PEOPLE, text: 'The baby is crying' };

  it('speaks on the speaker and sends no push', () => {
    const run = simulate(SPEAK_OR_PUSH.program, inputs, {
      effects: { 'notify.speak': () => ({ ok: true, spokenOn: ['kitchen'] }) },
    });
    expect(run.effects.map((call) => call.kind)).toEqual(['notify.speak']);
    expect(outputsOf(run)).toEqual({ spoken: true });
  });

  it('falls back to a push when the speaker is unreachable', () => {
    const run = simulate(SPEAK_OR_PUSH.program, inputs, { unreachable: ['notify.speak'] });
    expect(run.effects.map((call) => call.kind)).toEqual(['notify.speak', 'notify.person']);
    expect(run.effects[1]?.params).toMatchObject({ people: PEOPLE, body: 'The baby is crying' });
    expect(outputsOf(run)).toEqual({ spoken: false });
  });
});

describe('appliance notice', () => {
  const inputs = { device: { device: 'washer' }, people: PEOPLE, message: 'The cycle is done' };
  const clock = { reads: { 'date.now': (): Outputs => ({ at: '2026-10-18T12:00:00.000Z' }) } };

  it('writes only to the feed by default, naming the device and the time', () => {
    const run = simulate(APPLIANCE_NOTICE.program, inputs, clock);
    expect(run.effects.map((call) => call.kind)).toEqual(['notify.feed']);
    const message = run.effects[0]?.params['message'];
    expect(typeof message === 'string' ? message : '').toContain('washer: The cycle is done');
  });

  it('sends a push to the people when asked to', () => {
    const run = simulate(APPLIANCE_NOTICE.program, { ...inputs, sendPush: true }, clock);
    expect(run.effects.map((call) => call.kind)).toEqual(['notify.person']);
    expect(run.effects[0]?.params).toMatchObject({ people: PEOPLE, title: 'washer' });
  });
});

describe('switch devices', () => {
  it('reports what was sent and what was skipped', () => {
    const skipped = [{ device: { device: 'b' }, reason: 'offline' }];
    const run = simulate(
      TIMED_DEVICES.program,
      { devices: { target: 'diffusers' }, on: true },
      { effects: { 'device.set': () => ({ ok: true, sent: [{ device: 'a' }], skipped }) } },
    );
    expect(run.effects[0]?.params).toMatchObject({ control: 'power', to: true });
    expect(outputsOf(run)).toEqual({ sent: [{ device: 'a' }], skipped });
  });
});

describe('average in a room', () => {
  const read = (value: number, count: number): { reads: Record<string, () => Outputs> } => ({
    reads: { 'device.aggregate': () => aggregated(value, count) },
  });

  it('gives the average and how many devices reported', () => {
    const run = simulate(
      AVERAGE_IN_ROOM.program,
      { devices: { target: 'bedroom' } },
      read(21.5, 3),
    );
    expect(run.reads[0]?.params).toMatchObject({ control: 'temperature', fn: 'average' });
    expect(outputsOf(run)).toEqual({ average: 21.5, count: 3 });
  });

  it('gives only the count when no device reports', () => {
    const run = simulate(AVERAGE_IN_ROOM.program, { devices: { target: 'bedroom' } }, read(0, 0));
    expect(outputsOf(run)).toEqual({ count: 0 });
  });
});

describe('weather look', () => {
  const inputs = { kinds: ['rain', 'storm'], look: { scene: 'ocean' } };

  function look(kind: string): ReturnType<typeof simulate> {
    return simulate(WEATHER_LOOK.program, inputs, {
      reads: { 'weather.read': () => ({ kind }) },
      effects: { 'scene.run': () => ({ ok: true, skipped: [] }) },
    });
  }

  it('runs the scene when the weather is one of the chosen kinds', () => {
    const run = look('rain');
    expect(run.effects.map((call) => call.kind)).toEqual(['scene.run']);
    expect(outputsOf(run)).toEqual({ applied: true });
  });

  it('does nothing for any other weather', () => {
    const run = look('clear');
    expect(run.effects).toEqual([]);
    expect(outputsOf(run)).toEqual({ applied: false });
  });
});
