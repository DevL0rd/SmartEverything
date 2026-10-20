import { describe, expect, it } from 'vitest';
import type { WaitResume } from '@smarteverything/flow/interpret/waits';
import { keysOfChange } from '../../../src/automations/waits/condition-feed';
import { forecastOf } from '../world/forecast';
import { DEVICE, Rig, START, conditionWait, eventWait, signalOf, stateChange } from './support';

function collector(): { resumes: WaitResume[]; resume: (resume: WaitResume) => void } {
  const resumes: WaitResume[] = [];
  return {
    resumes,
    resume: (resume): void => {
      resumes.push(resume);
    },
  };
}

describe('condition waits', () => {
  it('resumes only waiters whose dependency key changed, without polling', () => {
    const rig = new Rig();
    const power = collector();
    const dimmer = collector();
    rig.index.watch(conditionWait(['device:power']), power.resume);
    rig.index.watch(conditionWait(['device:brightness']), dimmer.resume);
    rig.feed.emit(stateChange('power', 0, 1));
    expect(power.resumes).toEqual([{ kind: 'evaluate' }]);
    expect(dimmer.resumes).toEqual([]);
    expect(rig.feed.subscriptions).toBe(1);
    expect(rig.clock.pending()).toEqual([]);
  });

  it('watches bare dependency keys for a condition trigger and releases them', () => {
    const rig = new Rig();
    const seen: string[] = [];
    const cancel = rig.index.watchKeys(['device:power'], () => seen.push('changed'));
    rig.feed.emit(stateChange('brightness', 1, 2));
    expect(seen).toEqual([]);
    rig.feed.emit(stateChange('power', 0, 1));
    expect(seen).toEqual(['changed']);
    cancel();
    rig.feed.emit(stateChange('power', 1, 0));
    expect(seen).toEqual(['changed']);
    expect(rig.index.listeners).toBe(0);
  });

  it('wakes a coarse device dependency on any capability and ignores unchanged values', () => {
    const rig = new Rig();
    const any = collector();
    rig.index.watch(conditionWait(['device']), any.resume);
    rig.feed.emit(stateChange('power', 1, 1));
    expect(any.resumes).toEqual([]);
    rig.feed.emit(stateChange('brightness', 10, 20));
    expect(any.resumes).toHaveLength(1);
  });

  it('wakes a waiter once per change however many of its keys the change touches', () => {
    const rig = new Rig();
    const both = collector();
    rig.index.watch(conditionWait(['device', 'device:power']), both.resume);
    rig.feed.emit(stateChange('power', 0, 1));
    expect(both.resumes).toHaveLength(1);
  });

  it('wakes a waiter that holds the condition on a change so the hold can be cancelled', () => {
    const rig = new Rig();
    const held = collector();
    rig.index.watch(conditionWait(['device:power'], Date.parse(START) + 5000), held.resume);
    rig.feed.emit(stateChange('power', 1, 0));
    expect(held.resumes).toEqual([{ kind: 'evaluate' }]);
  });

  it('arms one shared minute boundary timer for clock waiters and re-arms it each minute', () => {
    const rig = new Rig();
    const first = collector();
    const second = collector();
    rig.index.watch(conditionWait(['clock:now']), first.resume);
    rig.index.watch(conditionWait(['clock:now', 'device:power']), second.resume);
    expect(rig.clock.pending()).toEqual(['2026-10-18T12:01:00.000Z']);
    rig.clock.advanceTo('2026-10-18T12:01:00.000Z');
    expect(first.resumes).toHaveLength(1);
    expect(second.resumes).toHaveLength(1);
    expect(rig.clock.pending()).toEqual(['2026-10-18T12:02:00.000Z']);
  });

  it('leaves zero listeners and timers after every waiter is cancelled', () => {
    const rig = new Rig();
    const cancels = [
      rig.index.watch(conditionWait(['clock:now']), () => undefined),
      rig.index.watch(conditionWait(['device:power']), () => undefined),
      rig.index.watch(conditionWait([]), () => undefined),
    ];
    expect(rig.index.listeners).toBe(1);
    expect(rig.index.timers).toBe(1);
    for (const cancel of cancels) cancel();
    expect(rig.index.waiting).toBe(0);
    expect(rig.index.listeners).toBe(0);
    expect(rig.index.timers).toBe(0);
    expect(rig.feed.count).toBe(0);
    expect(rig.clock.pending()).toEqual([]);
  });

  it('does not wake a waiter cancelled by the resume of another', () => {
    const rig = new Rig();
    const later = collector();
    let cancelLater = (): void => undefined;
    rig.index.watch(conditionWait(['device:power']), () => {
      cancelLater();
    });
    cancelLater = rig.index.watch(conditionWait(['device:power']), later.resume);
    rig.feed.emit(stateChange('power', 0, 1));
    expect(later.resumes).toEqual([]);
  });
});

describe('dependency keys of a change', () => {
  it('names the weather metrics that moved and nothing when none moved', () => {
    const forecast = forecastOf();
    const warmer = {
      ...forecast,
      now: { ...forecast.now, temperatureC: forecast.now.temperatureC + 3 },
    };
    const row = (value: typeof forecast): Parameters<typeof keysOfChange>[0] => ({
      type: 'change',
      seq: 1,
      table: 'weather',
      operation: 'UPDATE',
      record: {
        id: 'home',
        forecast: value,
        fetched_at: null,
        next_fetch_at: null,
        error: null,
        air_error: null,
        failed_at: null,
        updated_at: START,
      },
      oldRecord: {
        id: 'home',
        forecast,
        fetched_at: null,
        next_fetch_at: null,
        error: null,
        air_error: null,
        failed_at: null,
        updated_at: START,
      },
    });
    expect(keysOfChange(row(warmer))).toEqual(['weather', 'weather:temperature']);
    expect(keysOfChange(row(forecast))).toEqual([]);
  });

  it('names the group dependency for a room change', () => {
    expect(
      keysOfChange({
        type: 'change',
        seq: 1,
        table: 'rooms',
        operation: 'UPDATE',
        record: { id: DEVICE, name: 'Den', position: 1 },
        oldRecord: null,
      }),
    ).toEqual(['group']);
  });
});

describe('event waits', () => {
  const matcher = { source: 'device', kind: 'door_opened' };
  const parkedAt = Date.parse(START);

  it('resumes with the matching signal that arrives after parking, through the (source, kind) index', () => {
    const rig = new Rig();
    const door = collector();
    rig.index.watch(eventWait(matcher, parkedAt), door.resume);
    rig.signals.emit(signalOf('window_opened', '2026-10-18T12:00:40.000Z'));
    rig.signals.emit(signalOf('door_opened', '2026-10-18T12:00:10.000Z'));
    expect(door.resumes).toEqual([]);
    const arriving = signalOf('door_opened', '2026-10-18T12:00:40.000Z');
    rig.signals.emit(arriving);
    expect(door.resumes).toEqual([{ kind: 'signal', signal: arriving }]);
  });

  it('applies the matcher fields', () => {
    const rig = new Rig();
    const strict = collector();
    rig.index.watch(eventWait({ ...matcher, match: { room: 'den' } }, parkedAt), strict.resume);
    rig.signals.emit(signalOf('door_opened', '2026-10-18T12:00:40.000Z', { room: 'kitchen' }));
    expect(strict.resumes).toEqual([]);
    rig.signals.emit(signalOf('door_opened', '2026-10-18T12:00:41.000Z', { room: 'den' }));
    expect(strict.resumes).toHaveLength(1);
  });

  it('leaves zero listeners after cancel and stops resuming', () => {
    const rig = new Rig();
    const door = collector();
    const cancel = rig.index.watch(eventWait(matcher, parkedAt), door.resume);
    const other = rig.index.watch(
      eventWait({ source: 'device', kind: 'x' }, parkedAt),
      () => undefined,
    );
    expect(rig.signals.count).toBe(1);
    cancel();
    rig.signals.emit(signalOf('door_opened', '2026-10-18T12:00:40.000Z'));
    expect(door.resumes).toEqual([]);
    other();
    expect(rig.signals.count).toBe(0);
    expect(rig.index.waiting).toBe(0);
    expect(rig.index.listeners).toBe(0);
    expect(rig.clock.pending()).toEqual([]);
  });
});

describe('other waits', () => {
  it('registers nothing for waits the runner times itself', () => {
    const rig = new Rig();
    const cancel = rig.index.watch(
      { kind: 'duration', nodePath: 'a', durable: false, dueAt: 1 },
      () => undefined,
    );
    cancel();
    expect(rig.index.listeners).toBe(0);
    expect(rig.clock.pending()).toEqual([]);
  });
});
