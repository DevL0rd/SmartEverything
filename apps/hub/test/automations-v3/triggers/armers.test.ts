import { describe, expect, it } from 'vitest';
import type { Place } from '@smarteverything/domain';
import { SimulatedClock as TestClock } from '../../../src/clock/simulated';
import {
  armTimedTriggers,
  compileTriggers,
  signalFire,
  watchedOf,
  type TriggerProblem,
} from '../../../src/automations/triggers-v3/armers';
import type { TriggerFire } from '../../../src/automations/triggers-v3/payload';
import { node, signal } from './support';

const START = '2026-10-19T08:00:30.000Z';
const UTC: Place = { timeZone: 'UTC', location: null };

function rig(place: Place | null = UTC): {
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

describe('timed triggers', () => {
  it('fires a time of day on the chosen weekdays and schedules the next day', () => {
    const { clock, fires, deps } = rig();
    const trigger = node('trigger.time', { at: '09:30', days: [1, 2] });
    armTimedTriggers(compileTriggers('auto', [trigger]), deps);
    clock.advanceTo('2026-10-21T12:00:00.000Z');
    expect(fires.map((fire) => fire.payload['scheduledFor'])).toEqual([
      '2026-10-19T09:30:00.000Z',
      '2026-10-20T09:30:00.000Z',
    ]);
    expect(fires[0]).toMatchObject({
      automationId: 'auto',
      triggerId: trigger.id,
      key: trigger.key,
    });
    expect(fires[0]?.payload['at']).toBe('2026-10-19T09:30:00.000Z');
  });

  it('treats an empty weekday list as every day', () => {
    const { clock, fires, deps } = rig();
    armTimedTriggers(
      compileTriggers('auto', [node('trigger.time', { at: '09:00', days: [] })]),
      deps,
    );
    clock.advanceTo('2026-10-21T09:30:00.000Z');
    expect(fires).toHaveLength(3);
  });

  it('counts interval ticks and drifts nothing', () => {
    const { clock, fires, deps } = rig();
    armTimedTriggers(compileTriggers('auto', [node('trigger.interval', { every: 600_000 })]), deps);
    clock.advanceTo('2026-10-19T08:35:00.000Z');
    expect(fires.map((fire) => fire.payload['tick'])).toEqual([1, 2, 3]);
    expect(fires.map((fire) => fire.payload['scheduledFor'])).toEqual([
      '2026-10-19T08:10:30.000Z',
      '2026-10-19T08:20:30.000Z',
      '2026-10-19T08:30:30.000Z',
    ]);
  });

  it('starts an aligned interval on round clock times', () => {
    const { clock, fires, deps } = rig();
    const aligned = node('trigger.interval', { every: 900_000, alignToClock: true });
    armTimedTriggers(compileTriggers('auto', [aligned]), deps);
    clock.advanceTo('2026-10-19T08:46:00.000Z');
    expect(fires.map((fire) => fire.payload['scheduledFor'])).toEqual([
      '2026-10-19T08:15:00.000Z',
      '2026-10-19T08:30:00.000Z',
      '2026-10-19T08:45:00.000Z',
    ]);
  });

  it('wraps an aligned interval to local midnight', () => {
    const { clock, fires, deps } = rig();
    clock.jumpTo('2026-10-19T23:50:00.000Z');
    armTimedTriggers(
      compileTriggers('auto', [node('trigger.interval', { every: 3_600_000, alignToClock: true })]),
      deps,
    );
    clock.advanceTo('2026-10-20T01:30:00.000Z');
    expect(fires.map((fire) => fire.payload['scheduledFor'])).toEqual([
      '2026-10-20T00:00:00.000Z',
      '2026-10-20T01:00:00.000Z',
    ]);
  });

  it('fires a sun trigger with its event and reports a missing home location', () => {
    const located = rig({ timeZone: 'UTC', location: { latitude: 59.3, longitude: 18.07 } });
    armTimedTriggers(
      compileTriggers('auto', [node('trigger.sun', { event: 'sunset', offset: -1_800_000 })]),
      located.deps,
    );
    located.clock.advanceTo('2026-10-19T23:59:00.000Z');
    expect(located.fires).toHaveLength(1);
    expect(located.fires[0]?.payload['event']).toBe('sunset');

    const bare = rig();
    armTimedTriggers(
      compileTriggers('auto', [node('trigger.sun', { event: 'sunrise' })]),
      bare.deps,
    );
    expect(bare.problems[0]?.message).toContain('latitude and longitude');
    expect(bare.clock.pending()).toEqual([]);
  });

  it('reports a missing place instead of staying silent', () => {
    const { deps, problems } = rig(null);
    armTimedTriggers(compileTriggers('auto', [node('trigger.time', { at: '09:00' })]), deps);
    expect(problems.map((problem) => problem.message)).toEqual(['The home has no time zone yet']);
  });

  it('stops everything on cancel', () => {
    const { clock, fires, deps } = rig();
    const cancel = armTimedTriggers(
      compileTriggers('auto', [node('trigger.interval', { every: 60_000 })]),
      deps,
    );
    clock.advanceTo('2026-10-19T08:03:00.000Z');
    cancel();
    clock.advanceTo('2026-10-19T09:00:00.000Z');
    expect(fires).toHaveLength(2);
  });
});

describe('compileTriggers', () => {
  it('skips disabled triggers and reports bad or wired ports', () => {
    const bad = node('trigger.interval', { every: 30_000 });
    const dynamic = {
      ...node('trigger.time', {}),
      ports: { at: { wire: { from: 'trigger', port: 'at' } } },
    };
    const off = node('trigger.time', { at: '09:00' }, { enabled: false });
    const compiled = compileTriggers('auto', [bad, dynamic, off]);
    expect(compiled.timed).toEqual([]);
    expect(compiled.problems.map((problem) => problem.triggerId)).toEqual([bad.id, dynamic.id]);
    expect(compiled.problems[1]?.message).toContain('fixed value');
  });

  it('rejects an interval that is not whole minutes', () => {
    const compiled = compileTriggers('auto', [node('trigger.interval', { every: 90_000 })]);
    expect(compiled.problems[0]?.message).toContain('whole number of minutes');
  });
});

describe('signal triggers', () => {
  it('compiles device-flavoured kinds to matchers keyed by the node id', () => {
    const device = node('trigger.device', { device: 'lamp', control: 'power' });
    const button = node('trigger.button', { device: 'remote', press: 'long_press' });
    const compiled = compileTriggers('auto', [device, button]);
    const watched = watchedOf(compiled, (matcher) => matcher.kind === 'button');
    expect(watched.automationId).toBe('auto');
    expect(watched.triggers.map((trigger) => trigger.triggerId)).toEqual([device.id, button.id]);
    expect(watched.triggers.map((trigger) => trigger.pulse)).toEqual([false, true]);
    expect(watched.triggers[0]?.matcher).toMatchObject({
      source: 'device',
      kind: 'state',
      subject: 'lamp',
      field: 'power',
    });
  });

  it('reports a device trigger that names nothing', () => {
    const compiled = compileTriggers('auto', [node('trigger.device', {})]);
    expect(compiled.signals).toEqual([]);
    expect(compiled.problems[0]?.message).toContain('Set one of');
  });

  it('builds the typed payload of the trigger that matches the signal', () => {
    const other = node('trigger.device', { device: 'fan' });
    const lamp = node('trigger.device', { device: 'lamp', control: 'power' });
    const compiled = compileTriggers('auto', [other, lamp]);
    const fire = signalFire(
      compiled,
      signal({ data: { cause: 'physical', roomId: 'hall' } }),
      lamp.id,
    );
    expect(fire).toMatchObject({ triggerId: lamp.id, key: lamp.key, kind: 'trigger.device' });
    expect(fire?.payload).toEqual({
      device: 'lamp',
      control: 'power',
      value: true,
      previous: false,
      cause: 'physical',
      room: 'hall',
      at: '2026-10-19T08:00:00.000Z',
    });
    expect(signalFire(compiled, signal({ subject: 'toaster' }), 'missing')).toBeNull();
  });

  it('reports the trigger whose watch fired, not the first one that matches', () => {
    const any = node('trigger.device', { device: 'lamp', control: 'power' });
    const held = node('trigger.device', { device: 'lamp', control: 'power', value: true });
    const compiled = compileTriggers('auto', [any, held]);
    const fire = signalFire(compiled, signal({}), held.id);
    expect(fire).toMatchObject({ triggerId: held.id, key: held.key });
  });

  it('maps presence, device health and camera payloads', () => {
    const presenceNode = node('trigger.presence', { event: 'left' });
    const presence = compileTriggers('auto', [presenceNode]);
    expect(
      signalFire(
        presence,
        signal({
          source: 'plugin_router',
          kind: 'person_left',
          subject: null,
          field: null,
          data: { person_id: 'ann' },
        }),
        presenceNode.id,
      )?.payload,
    ).toMatchObject({ person: 'ann', place: 'home', event: 'left' });
    const healthNode = node('trigger.device_health', { device: 'lamp' });
    const health = compileTriggers('auto', [healthNode]);
    expect(
      signalFire(
        health,
        signal({ kind: 'online', field: null, value: false, previous: true }),
        healthNode.id,
      )?.payload,
    ).toMatchObject({ device: 'lamp', event: 'offline' });
    const cameraNode = node('trigger.camera', { detection: 'person' });
    const camera = compileTriggers('auto', [cameraNode]);
    const seen = signalFire(
      camera,
      signal({
        source: 'event',
        kind: 'person',
        subject: 'door',
        field: null,
        data: { detection: 'person', confidence: 0.9 },
      }),
      cameraNode.id,
    );
    expect(seen?.payload).toMatchObject({ camera: 'door', confidence: 0.9 });
  });

  it('maps computer, phone, health and chat payloads', () => {
    const computerNode = node('trigger.computer', { kind: 'app_focus' });
    expect(
      signalFire(
        compileTriggers('auto', [computerNode]),
        signal({
          source: 'event',
          kind: 'app_focused',
          subject: 'desk',
          field: null,
          data: { app: 'Steam', title: 'Library' },
        }),
        computerNode.id,
      )?.payload,
    ).toMatchObject({ computer: 'desk', kind: 'app_focus', app: 'Steam', title: 'Library' });
    const phoneNode = node('trigger.phone', { kind: 'context_changed' });
    expect(
      signalFire(
        compileTriggers('auto', [phoneNode]),
        signal({
          source: 'event',
          kind: 'phone_context_changed',
          subject: 'pixel',
          field: null,
          data: { to: 'driving' },
        }),
        phoneNode.id,
      )?.payload,
    ).toMatchObject({ phone: 'pixel', kind: 'context_changed', data: { to: 'driving' } });
    const healthNode = node('trigger.health', {});
    expect(
      signalFire(
        compileTriggers('auto', [healthNode]),
        signal({
          source: 'health',
          kind: 'sleep_ended',
          subject: 'ann',
          field: null,
          value: '2026-10-19T06:00:00.000Z',
          profileId: 'ann',
          data: { minutes: 420 },
        }),
        healthNode.id,
      )?.payload,
    ).toMatchObject({ kind: 'sleep_ended', person: 'ann', data: { minutes: 420 } });
    const chatNode = node('trigger.chat', { outcome: 'answered' });
    expect(
      signalFire(
        compileTriggers('auto', [chatNode]),
        signal({
          source: 'assistant',
          kind: 'reply_finished',
          subject: 'chat-1',
          field: null,
          value: 'answered',
          profileId: 'ann',
          data: { outcome: 'answered', messageId: 'm1' },
        }),
        chatNode.id,
      )?.payload,
    ).toMatchObject({ chat: 'chat-1', outcome: 'answered', messageId: 'm1', person: 'ann' });
  });

  it('watches the v1.1 signal triggers and keeps the problem free list empty', () => {
    const compiled = compileTriggers('auto', [
      node('trigger.computer', { app: 'Steam' }),
      node('trigger.phone', {}),
      node('trigger.health', {}),
      node('trigger.chat', {}),
    ]);
    expect(compiled.problems).toEqual([]);
    expect(compiled.signals).toHaveLength(4);
    expect(compiled.timed).toHaveLength(0);
  });
});
