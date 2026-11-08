import { SPEAK_OR_PUSH, SWITCH_DEVICES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { outputsOf, simulate } from './support';

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

describe('switch devices', () => {
  it('reports what was sent and what was skipped', () => {
    const skipped = [{ device: { device: 'b' }, reason: 'offline' }];
    const run = simulate(
      SWITCH_DEVICES.program,
      { devices: { target: 'diffusers' }, on: true },
      { effects: { 'device.set': () => ({ ok: true, sent: [{ device: 'a' }], skipped }) } },
    );
    expect(run.effects[0]?.params).toMatchObject({ control: 'power', to: true });
    expect(outputsOf(run)).toEqual({ sent: [{ device: 'a' }], skipped });
  });
});
