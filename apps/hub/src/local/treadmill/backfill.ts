import type { PadRecord } from '@smarteverything/ble';
import { isWorthKeeping, type TreadmillSession } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import type { PadRecordView } from './fleet';

const SEARCH_HOURS = 24;

const KEPT_RECORDS = 20;

const TIME_TOLERANCE_SECONDS = 60;

const RATIO_TOLERANCE = 0.1;

const DISTANCE_TOLERANCE_M = 100;

const PAD_ADDED_SECONDS = 5;

export interface Reconciled {
  readonly view: PadRecordView;
  readonly fingerprint: string;
}

export interface BackfillDeps {
  readonly store: Pick<Store, 'treadmillSessions' | 'write'>;
  readonly now: () => Date;
  readonly log: Logger;
}

export function fingerprintOf(record: PadRecord): string {
  return [record.onTime, record.startTime, record.durationS, record.distanceM, record.steps].join(
    ':',
  );
}

function near(left: number, right: number, floor: number): boolean {
  return Math.abs(left - right) <= Math.max(floor, Math.max(left, right) * RATIO_TOLERANCE);
}

function matches(session: TreadmillSession, record: PadRecord): boolean {
  return (
    near(session.activeSeconds, record.durationS, TIME_TOLERANCE_SECONDS) &&
    near(session.distanceM, record.distanceM, DISTANCE_TOLERANCE_M)
  );
}

function corrected(session: TreadmillSession, record: PadRecord): TreadmillSession {
  const longer =
    record.durationS > session.activeSeconds + PAD_ADDED_SECONDS ||
    record.distanceM > session.distanceM;
  if (!longer) {
    return session;
  }
  const hours = record.durationS / 3600;
  return {
    ...session,
    activeSeconds: Math.max(record.durationS, session.activeSeconds),
    distanceM: Math.max(record.distanceM, session.distanceM),
    steps: Math.max(record.steps, session.steps ?? 0),
    avgKmh: hours > 0 ? record.distanceM / 1000 / hours : session.avgKmh,
    source: 'pad_summary',
  };
}

function fromRecord(facts: RecordFacts, record: PadRecord, endedAt: Date): TreadmillSession {
  const hours = record.durationS / 3600;
  return {
    id: randomUUID(),
    deviceId: facts.deviceId,
    walkerProfileId: facts.walkerProfileId,
    startedAt: new Date(endedAt.getTime() - record.durationS * 1000).toISOString(),
    endedAt: endedAt.toISOString(),
    zoneOffsetSeconds: facts.zoneOffsetSeconds,
    activeSeconds: record.durationS,
    pausedSeconds: 0,
    distanceM: record.distanceM,
    steps: record.steps,
    kcal: null,
    kcalNet: null,
    avgKmh: hours > 0 ? record.distanceM / 1000 / hours : 0,
    maxKmh: 0,
    mode: null,
    kind: 'walk',
    zones: { walk: 0, jog: 0, run: 0 },
    splits: [],
    source: 'pad_record',
    climbM: null,
    inclineAvg: null,
    inclineMax: null,
    inclineSeconds: {},
    kcalSource: null,
    kcalEstimate: null,
    heartRateSource: null,
  };
}

export interface RecordFacts {
  readonly deviceId: string;
  readonly walkerProfileId: string | null;
  readonly zoneOffsetSeconds: number;
  readonly seen: string | null;
}

export function reconcileRecord(
  deps: BackfillDeps,
  facts: RecordFacts,
  record: PadRecord,
): Reconciled & { readonly created: TreadmillSession | null } {
  const fingerprint = fingerprintOf(record);
  const now = deps.now();
  const since = new Date(now.getTime() - SEARCH_HOURS * 3_600_000).toISOString();
  const own = deps.store.treadmillSessions
    .page({ deviceId: facts.deviceId, walkerProfileId: undefined, before: undefined, limit: 30 })
    .filter((session) => session.endedAt >= since);
  const found = own.find((session) => matches(session, record));
  const view = (sessionId: string | null): PadRecordView => ({
    at: now.toISOString(),
    activeSeconds: record.durationS,
    distanceM: record.distanceM,
    steps: record.steps,
    sessionId,
  });
  if (found !== undefined) {
    const patched = corrected(found, record);
    if (patched !== found) {
      deps.store.treadmillSessions.save(patched, true);
      deps.log.info('treadmill.session_corrected_from_pad', { session: found.id });
    }
    return { view: view(found.id), fingerprint, created: null };
  }
  if (facts.seen === fingerprint || !isWorthKeeping({ activeSeconds: record.durationS })) {
    return { view: view(null), fingerprint, created: null };
  }
  const created = fromRecord(facts, record, now);
  deps.store.treadmillSessions.add(created);
  deps.log.info('treadmill.session_from_pad_record', { session: created.id });
  return { view: view(created.id), fingerprint, created };
}

export function keepRecords(
  before: readonly PadRecordView[],
  added: PadRecordView,
): PadRecordView[] {
  return [added, ...before].slice(0, KEPT_RECORDS);
}
