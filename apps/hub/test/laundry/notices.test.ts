import {
  UNLOAD_PENDING_KEY,
  withLaundryNoticeChange,
  DEFAULT_LAUNDRY_NOTICE,
  type EventRow,
  type JsonValue,
  type LaundryNotices,
  type RowChange,
  type StateRow,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import type { DeviceNotice } from '../../src/extensions/device-notices';
import { LaundryNotifier, eventNoticeOf } from '../../src/laundry/notices';
import { captureLogs, testLogger } from '../support/logs';

const WASHER = '00000000-0000-4000-8000-0000000000a1';
const START = '2026-10-19T10:00:00.000Z';

function event(kind: EventRow['kind'], details: Readonly<Record<string, JsonValue>>): EventRow {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    device_id: WASHER,
    kind,
    occurred_at: START,
    details,
    acknowledged_at: null,
    created_at: START,
  };
}

function inserted(row: EventRow): RowChange {
  return { type: 'change', table: 'events', operation: 'INSERT', record: row, oldRecord: null };
}

function unload(value: boolean, observedAt = START): StateRow {
  return { device_id: WASHER, capability: UNLOAD_PENDING_KEY, value, observed_at: observedAt };
}

function stateChange(record: StateRow | null, oldRecord: StateRow | null): RowChange {
  return { type: 'change', table: 'device_state', operation: 'UPDATE', record, oldRecord };
}

interface Rig {
  readonly clock: SimulatedClock;
  readonly raised: DeviceNotice[];
  readonly notifier: LaundryNotifier;
}

function rig(settings: LaundryNotices = {}, pending: readonly StateRow[] = []): Rig {
  const clock = new SimulatedClock(START);
  const raised: DeviceNotice[] = [];
  const notifier = new LaundryNotifier({
    notices: (): LaundryNotices => settings,
    machineName: (deviceId): string | null =>
      deviceId === WASHER ? 'Washing/Drying Machine' : null,
    pendingUnloads: (): readonly StateRow[] => pending,
    clock,
    raise: (notice): void => {
      raised.push(notice);
    },
    log: testLogger('laundry'),
  });
  return { clock, raised, notifier };
}

describe('laundry notice decisions', () => {
  beforeEach(() => {
    captureLogs();
  });

  it('maps the laundry events to their notices', () => {
    expect(
      eventNoticeOf(event('cycle_finished', { family: 'laundry', outcome: 'completed' })),
    ).toBe('finished');
    expect(eventNoticeOf(event('cycle_finished', { family: 'laundry', outcome: 'stopped' }))).toBe(
      null,
    );
    expect(eventNoticeOf(event('fault', { family: 'laundry', raw: 'E31' }))).toBe('fault');
    expect(eventNoticeOf(event('maintenance', { family: 'laundry', item: 'detergent' }))).toBe(
      'detergent',
    );
    expect(eventNoticeOf(event('maintenance', { family: 'laundry', item: 'softener' }))).toBe(
      'softener',
    );
    expect(eventNoticeOf(event('maintenance', { family: 'laundry', item: 'filter' }))).toBe(
      'filter',
    );
    expect(eventNoticeOf(event('maintenance', { item: 'fragrance' }))).toBe(null);
  });

  it('sends the old notice wording with a tap that opens the machine', () => {
    const { notifier, raised } = rig();
    notifier.changed(
      inserted(event('cycle_finished', { family: 'laundry', outcome: 'completed' })),
    );
    notifier.changed(inserted(event('maintenance', { family: 'laundry', item: 'detergent' })));
    expect(raised).toEqual([
      {
        title: 'Laundry done',
        body: 'Washing/Drying Machine has finished its cycle.',
        data: { kind: 'device_notice', notice: 'finished', deviceId: WASHER },
      },
      {
        title: 'Detergent low',
        body: 'Washing/Drying Machine is low on detergent.',
        data: { kind: 'device_notice', notice: 'detergent', deviceId: WASHER },
      },
    ]);
  });

  it('stays silent for a notice switched off in the machine settings', () => {
    const off = withLaundryNoticeChange(DEFAULT_LAUNDRY_NOTICE, { on: { fault: false } });
    const { notifier, raised } = rig({ [WASHER]: off });
    notifier.changed(inserted(event('fault', { family: 'laundry', raw: 'E31' })));
    notifier.changed(inserted(event('maintenance', { family: 'laundry', item: 'filter' })));
    expect(raised.map((notice) => notice.data.notice)).toEqual(['filter']);
  });

  it('reminds to unload after the default 30 minutes when the door stays shut', () => {
    const { notifier, raised, clock } = rig();
    notifier.changed(stateChange(unload(true), unload(false)));
    clock.advanceTo('2026-10-19T10:29:59.000Z');
    expect(raised).toEqual([]);
    clock.advanceTo('2026-10-19T10:30:00.000Z');
    expect(raised.map((notice) => notice.body)).toEqual([
      'The laundry in Washing/Drying Machine is waiting to be unloaded.',
    ]);
  });

  it('drops the reminder when the laundry is taken out first', () => {
    const { notifier, raised, clock } = rig();
    notifier.changed(stateChange(unload(true), unload(false)));
    notifier.changed(stateChange(unload(false, '2026-10-19T10:10:00.000Z'), unload(true)));
    clock.advanceTo('2026-10-19T11:00:00.000Z');
    expect(raised).toEqual([]);
  });

  it('uses the machine’s own unload delay and does not restart it on a repeated report', () => {
    const later = withLaundryNoticeChange(DEFAULT_LAUNDRY_NOTICE, { unloadMinutes: 60 });
    const { notifier, raised, clock } = rig({ [WASHER]: later });
    notifier.changed(stateChange(unload(true), unload(false)));
    notifier.changed(stateChange(unload(true, '2026-10-19T10:20:00.000Z'), unload(true)));
    clock.advanceTo('2026-10-19T10:59:00.000Z');
    expect(raised).toEqual([]);
    clock.advanceTo('2026-10-19T11:00:00.000Z');
    expect(raised).toHaveLength(1);
  });

  it('resumes a waiting reminder after a restart and skips one already due', () => {
    const waiting = rig({}, [unload(true, '2026-10-19T09:50:00.000Z')]);
    waiting.notifier.start();
    waiting.clock.advanceTo('2026-10-19T10:20:00.000Z');
    expect(waiting.raised).toHaveLength(1);
    const passed = rig({}, [unload(true, '2026-10-19T09:00:00.000Z')]);
    passed.notifier.start();
    passed.clock.advanceTo('2026-10-19T12:00:00.000Z');
    expect(passed.raised).toEqual([]);
  });

  it('keeps notices on for kinds not named in a change', () => {
    const changed = withLaundryNoticeChange(
      { off: ['fault', 'unload'], unloadMinutes: 30 },
      { on: { unload: true, filter: false } },
    );
    expect(changed).toEqual({ off: ['fault', 'filter'], unloadMinutes: 30 });
  });
});
