import { describe, expect, it } from 'vitest';
import type { Place } from '@smarteverything/domain';
import { SimulatedClock as TestClock } from '../../../src/clock/simulated';
import {
  armTimedTriggers,
  compileTriggers,
  signalFire,
  type TriggerProblem,
} from '../../../src/automations/triggers-v3/armers';
import type { TriggerFire } from '../../../src/automations/triggers-v3/payload';
import { node, signal } from './support';

const START = '2026-06-21T00:00:30.000Z';
const MADRID: Place = {
  timeZone: 'UTC',
  location: { latitude: 40, longitude: 0 },
};

function rig(place: Place = MADRID): {
  clock: TestClock;
  fires: TriggerFire[];
  problems: TriggerProblem[];
  deps: Parameters<typeof armTimedTriggers>[1];
} {
  const clock = new TestClock(START);
  const fires: TriggerFire[] = [];
  const problems: TriggerProblem[] = [];
  return {
    clock,
    fires,
    problems,
    deps: {
      clock,
      place: () => place,
      fire: (fire) => fires.push(fire),
      problem: (problem) => problems.push(problem),
    },
  };
}

function firstSunFire(ports: Record<string, string | number>): string {
  const { clock, fires, deps } = rig();
  armTimedTriggers(compileTriggers('auto', [node('trigger.sun', ports)]), deps);
  clock.advanceTo('2026-06-21T23:59:00.000Z');
  const scheduled = fires[0]?.payload['scheduledFor'];
  if (typeof scheduled !== 'string') throw new Error('the sun trigger did not fire');
  return scheduled;
}

describe('sun events', () => {
  it('orders dawn, sunrise, solar noon, golden hour, sunset and dusk across a day', () => {
    const order = ['dawn', 'sunrise', 'solar_noon', 'golden_hour_evening', 'sunset', 'dusk'].map(
      (event) => Date.parse(firstSunFire({ event })),
    );
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(new Set(order).size).toBe(order.length);
  });

  it('crosses a chosen height going up and coming down', () => {
    const rising = Date.parse(firstSunFire({ event: 'elevation_rising', elevation: 20 }));
    const falling = Date.parse(firstSunFire({ event: 'elevation_falling', elevation: 20 }));
    const noon = Date.parse(firstSunFire({ event: 'solar_noon' }));
    expect(rising).toBeLessThan(noon);
    expect(falling).toBeGreaterThan(noon);
  });

  it('refuses a height crossing without a height', () => {
    const { problems, deps } = rig();
    armTimedTriggers(
      compileTriggers('auto', [node('trigger.sun', { event: 'elevation_rising' })]),
      deps,
    );
    expect(problems[0]?.message).toContain('sun height');
  });
});

describe('trigger.schedule', () => {
  it('fires each block with its data and skips excepted dates', () => {
    const { clock, fires, deps } = rig({ timeZone: 'UTC', location: null });
    const blocks = [
      { at: '06:00', slot: 'comfort' },
      { at: '22:00', days: [0, 1, 2, 3, 4, 5, 6], slot: 'night' },
    ];
    armTimedTriggers(
      compileTriggers('auto', [node('trigger.schedule', { blocks, except: ['2026-06-22'] })]),
      deps,
    );
    clock.advanceTo('2026-06-23T07:00:00.000Z');
    expect(fires.map((fire) => [fire.payload['scheduledFor'], fire.payload['slot']])).toEqual([
      ['2026-06-21T06:00:00.000Z', 'comfort'],
      ['2026-06-21T22:00:00.000Z', 'night'],
      ['2026-06-23T06:00:00.000Z', 'comfort'],
    ]);
  });
});

describe('signal backed triggers of the second set', () => {
  it('starts trigger.event on a sent event of that name and passes its data', () => {
    const wanted = node('trigger.event', { name: 'guest_mode_on' });
    const compiled = compileTriggers('auto', [wanted]);
    const sent = signal({
      source: 'automation_event',
      kind: 'sent',
      subject: null,
      field: 'guest_mode_on',
      data: { who: 'ann', automationId: 'other' },
    });
    expect(compiled.signals[0]?.matcher).toMatchObject({
      source: 'automation_event',
      kind: 'sent',
      field: 'guest_mode_on',
    });
    expect(signalFire(compiled, sent, wanted.id)?.payload).toEqual({
      name: 'guest_mode_on',
      payload: { who: 'ann' },
      at: sent.at,
    });
  });

  it('compiles trigger.timer, trigger.hub_started and trigger.webhook to signal matchers', () => {
    const compiled = compileTriggers('auto', [
      node('trigger.timer', { timer: 'laundry' }),
      node('trigger.hub_started', {}),
      node('trigger.webhook', { path: 'k3Jq9Zr2Lm8Xv5Bn7TcWd1', method: 'POST' }),
    ]);
    expect(compiled.problems).toEqual([]);
    expect(compiled.signals.map((entry) => entry.matcher)).toMatchObject([
      { source: 'automation_timer', kind: 'finished', field: 'laundry' },
      { source: 'hub', kind: 'started' },
      {
        source: 'webhook',
        kind: 'received',
        field: 'k3Jq9Zr2Lm8Xv5Bn7TcWd1',
        match: { method: 'POST' },
      },
    ]);
  });

  it('refuses a webhook path that is too short or not made of URL safe characters', () => {
    const compiled = compileTriggers('auto', [
      node('trigger.webhook', { path: 'abc' }),
      node('trigger.webhook', { path: 'has spaces and is long enough!!' }),
    ]);
    expect(compiled.signals).toEqual([]);
    expect(compiled.problems.map((problem) => problem.message)).toEqual([
      'path is the secret of the webhook: use 16 to 128 letters, digits, dashes or underscores',
      'path is the secret of the webhook: use 16 to 128 letters, digits, dashes or underscores',
    ]);
  });

  it('compiles trigger.becomes_true to a watched condition and skips a disabled one', () => {
    const watching = {
      ...node('trigger.becomes_true', {}),
      ports: { condition: { wire: { from: 'hot', port: 'result' } }, hold: { lit: 60_000 } },
    };
    const compiled = compileTriggers('auto', [watching, { ...watching, enabled: false }]);
    expect(compiled.problems).toEqual([]);
    expect(compiled.signals).toEqual([]);
    expect(compiled.conditions).toEqual([
      {
        automationId: 'auto',
        triggerId: watching.id,
        key: watching.key,
        kind: 'trigger.becomes_true',
        condition: { wire: { from: 'hot', port: 'result' } },
        holdMs: 60_000,
      },
    ]);
  });
});
