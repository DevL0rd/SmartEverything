import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  alarmInput,
  alarms,
  report,
  saves,
  settle,
  startWatchHarness,
  stopWatchHarness,
  w,
} from '../support/watch-harness';

beforeEach(startWatchHarness);

afterEach(stopWatchHarness);

describe('alarm sync', () => {
  it('saves and deletes through the bridge and keeps the watch alarm id', async () => {
    const alarm = w.test.store.plannerAlarms.insert(alarmInput());
    await settle();
    expect(saves()).toEqual([
      {
        type: 'save_alarm',
        alarm: {
          id: null,
          time: '07:00',
          days: ['mon', 'tue', 'wed', 'thu', 'fri'],
          enabled: true,
          smart: false,
        },
      },
    ]);
    expect(alarms()[0]?.watch).toMatchObject([{ alarmId: 1, state: 'synced', detail: null }]);
    w.test.store.plannerAlarms.remove(alarm.id, w.owner.profileId);
    await settle();
    expect(w.sent.at(-1)).toEqual({ type: 'delete_alarm', id: 1 });
    expect(w.watchAlarms).toEqual([]);
    expect(alarms()).toEqual([]);
    expect(saves()).toHaveLength(1);
  });

  it('keeps an alarm waiting until the phone near the watch answers', async () => {
    w.answer = {
      ok: false,
      reason: 'unanswered',
      detail: 'The phone did not w.answer within 25 s.',
    };
    w.test.store.plannerAlarms.insert(alarmInput());
    await settle();
    expect(alarms()[0]?.watch).toMatchObject([
      { state: 'pending', detail: 'Saves when the phone is near the watch.' },
    ]);
  });

  it('keeps the reason of a failed save and does not retry on its own', async () => {
    w.answer = { ok: false, reason: 'refused', detail: 'The watch is not connected.' };
    w.test.store.plannerAlarms.insert(alarmInput());
    await settle();
    expect(alarms()[0]?.watch).toMatchObject([
      { state: 'failed', detail: 'The watch is not connected.', alarmId: null },
    ]);
    w.watchAlarms = [{ id: 7, time: '23:00', enabled: true, days: [], smart: false }];
    report();
    await settle();
    expect(saves()).toHaveLength(1);
    w.answer = { ok: true, detail: 'Done' };
    w.sync.connected(w.watchId);
    await settle();
    expect(saves()).toHaveLength(2);
    expect(alarms()[0]?.watch).toMatchObject([{ state: 'synced', alarmId: 8 }]);
  });

  it('puts a ring-once-on-a-date alarm off the watch with the reason in words', async () => {
    w.test.store.plannerAlarms.insert(alarmInput({ days: [], once_on: '2026-11-09' }));
    w.test.store.plannerAlarms.insert(alarmInput({ time: '08:00', skip_on: '2026-11-09' }));
    await settle();
    expect(w.sent).toEqual([]);
    expect(alarms().flatMap((alarm) => alarm.watch)).toMatchObject([
      {
        state: 'not_on_watch',
        detail: 'Rings once on a date, and the watch only repeats on weekdays.',
      },
      {
        state: 'not_on_watch',
        detail: 'The next ring is skipped, and the watch cannot skip a single ring.',
      },
    ]);
  });

  it('keeps an alarm with a dismiss challenge off the watch and takes it back when the challenge goes', async () => {
    const saved = w.test.store.plannerAlarms.insert(
      alarmInput({ challenge: { kind: 'maths', difficulty: 'easy', count: 3 } }),
    );
    await settle();
    expect(w.sent).toEqual([]);
    expect(alarms()[0]?.watch).toMatchObject([
      { state: 'not_on_watch', detail: 'Has a dismiss challenge' },
    ]);
    w.test.store.plannerAlarms.update(saved.id, w.owner.profileId, { challenge: { kind: 'none' } });
    await settle();
    expect(saves()).toHaveLength(1);
    expect(alarms()[0]?.watch).toMatchObject([{ state: 'synced' }]);
  });

  it('withdraws a synced alarm from the watch when a challenge is added', async () => {
    const saved = w.test.store.plannerAlarms.insert(alarmInput());
    await settle();
    expect(w.watchAlarms).toHaveLength(1);
    w.test.store.plannerAlarms.update(saved.id, w.owner.profileId, {
      challenge: { kind: 'qr', code: 'bathroom-mirror' },
    });
    await settle();
    expect(w.watchAlarms).toEqual([]);
    expect(alarms()[0]?.watch).toMatchObject([
      { state: 'not_on_watch', detail: 'Has a dismiss challenge' },
    ]);
  });
});

describe('reconnect and watch-made alarms', () => {
  it('imports a watch-only alarm with source watch and never deletes the watch alarms', async () => {
    w.watchAlarms = [
      { id: 4, time: '06:15', enabled: true, days: ['sat', 'sun'], smart: false },
      { id: 9, time: '23:00', enabled: false, days: [], smart: false },
    ];
    report();
    w.sync.connected(w.watchId);
    await settle();
    const imported = alarms();
    expect(imported).toHaveLength(2);
    expect(imported.find((alarm) => alarm.time === '06:15')).toMatchObject({
      source: 'watch',
      label: null,
      days: [6, 0],
      enabled: true,
      targets: [{ kind: 'device', deviceId: w.watchId }],
      watch: [{ alarmId: 4, state: 'synced' }],
    });
    expect(w.sent).toEqual([]);
    expect(w.watchAlarms).toHaveLength(2);
  });

  it('sends only the diff on reconnect', async () => {
    w.test.store.plannerAlarms.insert(alarmInput());
    const second = w.test.store.plannerAlarms.insert(alarmInput({ time: '09:30' }));
    await settle();
    w.answer = { ok: false, reason: 'unreachable', detail: 'No phone could be reached.' };
    w.test.store.plannerAlarms.update(second.id, w.owner.profileId, { time: '10:00' });
    await settle();
    const before = saves().length;
    w.answer = { ok: true, detail: 'Done' };
    w.sync.connected(w.watchId);
    await settle();
    expect(saves()).toHaveLength(before + 1);
    expect(saves().at(-1)).toMatchObject({ alarm: { time: '10:00', id: 2 } });
    expect(
      alarms()
        .flatMap((alarm) => alarm.watch)
        .every((link) => link.state === 'synced'),
    ).toBe(true);
  });

  it('takes an edit made on the watch into the planner without sending', async () => {
    w.test.store.plannerAlarms.insert(alarmInput());
    await settle();
    const before = w.sent.length;
    w.watchAlarms = w.watchAlarms.map((alarm) => ({ ...alarm, time: '06:20', enabled: false }));
    report();
    await settle();
    expect(w.sent).toHaveLength(before);
    expect(alarms()[0]).toMatchObject({ time: '06:20', enabled: false, label: 'Work' });
    expect(alarms()[0]?.watch).toMatchObject([{ alarmId: 1, state: 'synced' }]);
  });
});
