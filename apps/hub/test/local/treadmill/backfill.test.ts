import { bytesToHex, type PadRecord } from '@smarteverything/ble';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fingerprintOf, keepRecords, reconcileRecord } from '../../../src/local/treadmill/backfill';
import { captureLogs, testLogger } from '../../support/logs';
import {
  COUNTDOWN,
  IDLE,
  RUNNING,
  STOPPED,
  statusHex,
  treadmillRig,
  type TreadmillRig,
} from '../../support/treadmill-rig';

let rig: TreadmillRig;

beforeEach(async () => {
  captureLogs();
  rig = await treadmillRig();
});

afterEach(async () => {
  await rig.close();
});

function walkMinute(): void {
  rig.batch(0, [statusHex({ state: IDLE })]);
  rig.batch(1, [statusHex({ state: COUNTDOWN })]);
  for (let second = 2; second <= 62; second += 1) {
    rig.batch(second, [
      statusHex({
        state: RUNNING,
        speed10: 40,
        time: second - 1,
        distance10m: second,
        steps: second * 2,
      }),
    ]);
  }
  rig.batch(63, [statusHex({ state: STOPPED, time: 61, distance10m: 61, steps: 122 })]);
}

function record(values: Partial<PadRecord> = {}): PadRecord {
  return {
    onTime: 1,
    startTime: 2,
    durationS: 61,
    distanceM: 610,
    steps: 122,
    remaining: 3,
    ...values,
  };
}

function reconcile(
  padRecord: PadRecord,
  seen: string | null = null,
): ReturnType<typeof reconcileRecord> {
  return reconcileRecord(
    { store: rig.test.store, now: rig.clock.now, log: testLogger('treadmill') },
    {
      deviceId: rig.row().id,
      walkerProfileId: rig.owner.profile.id,
      zoneOffsetSeconds: 0,
      seen,
    },
    padRecord,
  );
}

describe('the pad’s last record', () => {
  it('recognises the session it already has and changes nothing', () => {
    walkMinute();
    const done = reconcile(record());
    expect(done.created).toBeNull();
    const sessions = rig.test.store.treadmillSessions.finished(rig.row().id, undefined);
    expect(sessions).toHaveLength(1);
    expect(done.view.sessionId).toBe(sessions[0]?.id);
    expect(sessions[0]?.source).toBe('live');
  });

  it('takes the pad’s figures when the pad counted more than the frames did', () => {
    walkMinute();
    reconcile(record({ durationS: 70, distanceM: 700, steps: 150 }));
    const [session] = rig.test.store.treadmillSessions.finished(rig.row().id, undefined);
    expect(session).toMatchObject({
      activeSeconds: 70,
      distanceM: 700,
      steps: 150,
      source: 'pad_summary',
    });
  });

  it('turns a run the hub never saw into a session once, dated by when the record was read', () => {
    const first = reconcile(record({ durationS: 1800, distanceM: 3000, steps: 4000 }));
    expect(first.created).toMatchObject({ source: 'pad_record', activeSeconds: 1800 });
    expect(first.created?.endedAt).toBe(rig.clock.now().toISOString());
    const second = reconcile(
      record({ durationS: 1800, distanceM: 3000, steps: 4000 }),
      first.fingerprint,
    );
    expect(second.created).toBeNull();
    expect(rig.test.store.treadmillSessions.finished(rig.row().id, undefined)).toHaveLength(1);
  });

  it('ignores a record too short to be a session', () => {
    expect(reconcile(record({ durationS: 3, distanceM: 2, steps: 4 })).created).toBeNull();
  });

  it('fingerprints a record and keeps the twenty latest', () => {
    expect(fingerprintOf(record())).toBe('1:2:61:610:122');
    const views = Array.from({ length: 25 }, (_, index) => ({
      at: String(index),
      activeSeconds: 1,
      distanceM: 1,
      steps: 1,
      sessionId: null,
    }));
    const kept = views.reduce<ReturnType<typeof keepRecords>>(
      (before, view) => keepRecords(before, view),
      [],
    );
    expect(kept).toHaveLength(20);
    expect(kept[0]?.at).toBe('24');
  });
});

describe('asking the pad for its record', () => {
  it('wants the record after a session ends and when the link comes up, once each', () => {
    const state = rig.fleet.of(rig.row());
    walkMinute();
    expect(state.takeRecordWish()).toBe(true);
    expect(state.takeRecordWish()).toBe(false);
  });

  it('keeps the records a frame carries for the diagnostics and records view', () => {
    walkMinute();
    const body = new Array<number>(20).fill(0);
    body[0] = 0xf8;
    body[1] = 0xa7;
    body[10] = 61;
    body[13] = 61;
    body[16] = 122;
    body[17] = 3;
    body[18] = body.slice(1, 18).reduce((sum, byte) => sum + byte, 0) & 0xff;
    body[19] = 0xfd;
    rig.batch(70, [bytesToHex(Uint8Array.from(body))]);
    const state = rig.fleet.of(rig.row());
    expect(state.padRecordsRemaining).toBe(3);
    expect(state.padRecords[0]).toMatchObject({ distanceM: 610, steps: 122 });
    expect(rig.observed.some((values) => 'padRecordSeen' in values)).toBe(true);
  });
});
