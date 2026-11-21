import type { PadRecord } from '@smarteverything/ble';
import {
  isWorthKeeping,
  type DeviceRow,
  type SessionSample,
  type Starter,
  type TreadmillSession,
  type TreadmillSettings,
} from '@smarteverything/domain';
import { effectiveRow } from '../../server/person-access-units';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { NoteLog, type UnitNote } from '../unit-notes';
import { reconcileRecord, type Reconciled, type RecordFacts } from './backfill';
import { contextOf, figuresOf } from './figures';
import { forgetHealth, moveHealth, saveHealth } from './health';

const HEART_RATE_FRESH_MS = 120_000;

const OWNER_SOURCES: ReadonlySet<string> = new Set(['automation']);

export interface FinishedSession {
  readonly id: string;
  readonly samples: readonly SessionSample[];
  readonly session: TreadmillSession;
}

export interface OrphanClosed {
  readonly session: TreadmillSession;
  readonly kept: boolean;
}

export interface WalkerQuery {
  readonly chosen: string | null;
  readonly holder: string | null;
  readonly now: string;
}

export interface WalkerRead {
  readonly profileId: string | null;
  readonly weightKg: number | null;
  readonly heartRate: number | null;
  readonly name: string | null;
}

export interface ReconcileInput {
  readonly facts: RecordFacts;
  readonly record: PadRecord;
  readonly now: string;
}

export interface ReconcileOutput extends Reconciled {
  readonly created: TreadmillSession | null;
  readonly notes: readonly UnitNote[];
}

export interface StarterQuery {
  readonly commandId: string;
  readonly holder: string | null;
  readonly chosen: string | null;
}

export interface SessionDetailRead {
  readonly session: TreadmillSession;
  readonly samples: SessionSample[];
  readonly weightKg: number | null;
  readonly walkerName: string | null;
}

export interface MaintenanceRead {
  readonly distanceM: number;
  readonly lastSession: TreadmillSession | null;
}

export function weightOf(
  store: Pick<HostStore, 'bodyReadings'>,
  profileId: string | null,
): number | null {
  if (profileId === null) {
    return null;
  }
  return store.bodyReadings
    .ofProfile(profileId)
    .reduce<number | null>((latest, reading) => reading.weight_kg ?? latest, null);
}

function watchHeartRate(
  store: Pick<HostStore, 'devices'>,
  profileId: string | null,
  now: Date,
): number | null {
  if (profileId === null) {
    return null;
  }
  const watch = store.devices
    .list()
    .find(
      (device: DeviceRow) =>
        device.provider === 'local' &&
        device.external_id.startsWith('xiaomi_watch:') &&
        device.details['profileId'] === profileId,
    );
  const rate = watch?.details['heartRate'];
  const reported = watch?.details['reportedAt'];
  const fresh =
    typeof reported === 'string' && now.getTime() - Date.parse(reported) < HEART_RATE_FRESH_MS;
  return typeof rate === 'number' && rate > 0 && fresh ? rate : null;
}

function walkerOf(store: HostStore, query: Omit<WalkerQuery, 'now'>): string | null {
  if (query.chosen !== null) {
    return query.chosen;
  }
  return query.holder === null ? null : store.profiles.activeOf(query.holder).id;
}

export const TREADMILL_WALKER_UNIT = storeUnit((store, query: WalkerQuery): WalkerRead => {
  const profileId = walkerOf(store, query);
  return {
    profileId,
    weightKg: weightOf(store, profileId),
    heartRate: watchHeartRate(store, profileId, new Date(query.now)),
    name: profileId === null ? null : store.profiles.byId(profileId).name,
  };
});

export const TREADMILL_OPEN_UNIT = storeUnit((store, session: TreadmillSession): void => {
  store.treadmillSessions.open(session);
});

export const TREADMILL_FLUSH_UNIT = storeUnit((store, flushed: FinishedSession): void => {
  store.treadmillSessions.appendSamples(flushed.id, flushed.samples);
  store.treadmillSessions.save(flushed.session, false);
});

export const TREADMILL_FINISH_UNIT = storeUnit((store, finished: FinishedSession): boolean => {
  if (!isWorthKeeping(finished.session)) {
    store.treadmillSessions.remove(finished.id);
    return false;
  }
  store.treadmillSessions.appendSamples(finished.id, finished.samples);
  store.treadmillSessions.save(finished.session, true);
  saveHealth(store, finished.session);
  return true;
});

export const TREADMILL_CLOSE_ORPHANS_UNIT = storeUnit((store, _input: null): OrphanClosed[] => {
  const closed: OrphanClosed[] = [];
  for (const id of store.treadmillSessions.openIds()) {
    const session = store.treadmillSessions.byId(id);
    const lastSecond = store.treadmillSessions.lastSampleSecond(id) ?? 0;
    const finished = {
      ...session,
      endedAt: new Date(Date.parse(session.startedAt) + lastSecond * 1000).toISOString(),
    };
    const kept = isWorthKeeping(finished);
    if (kept) {
      store.treadmillSessions.save(finished, true);
      saveHealth(store, finished);
    } else {
      store.treadmillSessions.remove(id);
    }
    closed.push({ session: finished, kept });
  }
  return closed;
});

export const TREADMILL_RECONCILE_UNIT = storeUnit(
  (store, input: ReconcileInput): ReconcileOutput => {
    const log = new NoteLog();
    const now = new Date(input.now);
    const done = reconcileRecord({ store, now: () => now, log }, input.facts, input.record);
    if (done.created !== null) {
      saveHealth(store, done.created);
    }
    return { ...done, notes: log.notes };
  },
);

export const TREADMILL_RECOMPUTE_UNIT = storeUnit(
  (
    store,
    input: {
      readonly deviceId: string;
      readonly settings: TreadmillSettings;
      readonly hasIncline: boolean;
    },
  ): number => {
    let changed = 0;
    for (const session of store.treadmillSessions.finished(input.deviceId, undefined)) {
      const samples = store.treadmillSessions.samples(session.id);
      if (samples.length < 2) {
        continue;
      }
      const context = contextOf(
        input.settings,
        weightOf(store, session.walkerProfileId),
        input.hasIncline,
      );
      const belt = session.kcalSource === 'belt' ? session.kcal : null;
      const updated: TreadmillSession = { ...session, ...figuresOf(samples, context, belt) };
      store.treadmillSessions.save(updated, true);
      saveHealth(store, updated);
      changed += 1;
    }
    return changed;
  },
);

export const TREADMILL_ASSIGN_UNIT = storeUnit(
  (store, input: { readonly session: TreadmillSession; readonly personId: string | null }) => {
    store.treadmillSessions.reassign(input.session.id, input.personId);
    moveHealth(
      store,
      { ...input.session, walkerProfileId: input.personId },
      input.session.walkerProfileId,
    );
  },
);

export const TREADMILL_FORGET_UNIT = storeUnit((store, session: TreadmillSession): void => {
  forgetHealth(store, session);
  store.treadmillSessions.remove(session.id);
});

export const TREADMILL_STARTER_UNIT = storeUnit((store, query: StarterQuery): Starter => {
  const row = store.commands.byId(query.commandId);
  const clientId = row.requested_by;
  const owner =
    clientId === null
      ? OWNER_SOURCES.has(row.source)
      : effectiveRow(store, store.clients.byId(clientId)).role === 'owner';
  const walker = walkerOf(store, query);
  const isWalker =
    clientId !== null && walker !== null && store.profiles.activeOf(clientId).id === walker;
  const onHolder = row.source === 'app' && clientId !== null && clientId === query.holder;
  return { owner, walker: isWalker, remote: !onHolder };
});

export const TREADMILL_SESSION_DETAIL_UNIT = storeUnit(
  (store, sessionId: string): SessionDetailRead => {
    const session = store.treadmillSessions.byId(sessionId);
    return {
      session,
      samples: store.treadmillSessions.samples(session.id),
      weightKg: weightOf(store, session.walkerProfileId),
      walkerName:
        session.walkerProfileId === null ? null : store.profiles.byId(session.walkerProfileId).name,
    };
  },
);

export const TREADMILL_MAINTENANCE_UNIT = storeUnit(
  (
    store,
    input: {
      readonly deviceId: string;
      readonly since: string;
      readonly walker: string | undefined;
    },
  ): MaintenanceRead => ({
    distanceM: store.treadmillSessions.distanceSince(input.deviceId, input.since),
    lastSession:
      store.treadmillSessions.page({
        deviceId: input.deviceId,
        walkerProfileId: input.walker,
        before: undefined,
        limit: 1,
      })[0] ?? null,
  }),
);
