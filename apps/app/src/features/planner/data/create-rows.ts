import type {
  API_ENDPOINTS as E,
  PlannerAlarmRow,
  PlannerCollectionRow,
  PlannerPreferences,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { StoreState } from '../../../store/state';
import { profileIn, type PlannerPerson } from './person';

export type CollectionCreate = z.output<(typeof E)['createPlannerCollection']['body']>;
export type AlarmCreateBody = z.output<(typeof E)['createPlannerAlarm']['body']>;

function nextCollectionPosition(state: StoreState, ownerId: string): number {
  return state.tables.planner_collections.rows.reduce(
    (highest, row) => (row.profile_id === ownerId ? Math.max(highest, row.position + 1) : highest),
    0,
  );
}

export function predictedCollection(
  state: StoreState,
  person: PlannerPerson,
  body: CollectionCreate,
  at: Date,
): PlannerCollectionRow | null {
  const { id, ...fields } = body;
  const ownerId = profileIn(state, person);
  if (id === undefined || ownerId === null) return null;
  const now = at.toISOString();
  return {
    ...fields,
    id,
    profile_id: ownerId,
    position: body.position ?? nextCollectionPosition(state, ownerId),
    audience: 'personal',
    source: 'local',
    google: null,
    feed: null,
    created_at: now,
    updated_at: now,
  };
}

type HubDefaulted = 'sound' | 'ramp_seconds' | 'vibrate' | 'snooze_minutes' | 'snooze_limit';

export type AlarmDefaults = Pick<PlannerAlarmRow, HubDefaulted | 'targets'>;

export function alarmDefaultsOf(clock: PlannerPreferences['clock']): AlarmDefaults {
  return {
    sound: clock.sound,
    ramp_seconds: clock.ramp_seconds,
    vibrate: true,
    snooze_minutes: clock.snooze_minutes,
    snooze_limit: clock.snooze_limit,
    targets: clock.targets,
  };
}

type CompleteAlarm = AlarmCreateBody & {
  readonly [K in HubDefaulted | 'targets']: Exclude<AlarmCreateBody[K], undefined>;
} & { readonly id: string };

function complete(body: AlarmCreateBody): body is CompleteAlarm {
  return (
    body.id !== undefined &&
    body.sound !== undefined &&
    body.ramp_seconds !== undefined &&
    body.vibrate !== undefined &&
    body.snooze_minutes !== undefined &&
    body.snooze_limit !== undefined &&
    body.targets !== undefined
  );
}

export function predictedAlarm(
  state: StoreState,
  person: PlannerPerson,
  body: AlarmCreateBody,
  at: Date,
): PlannerAlarmRow | null {
  const ownerId = profileIn(state, person);
  if (ownerId === null || !complete(body)) return null;
  const now = at.toISOString();
  return {
    ...body,
    profile_id: ownerId,
    skip_on: null,
    watch: [],
    source: 'planner',
    created_at: now,
    updated_at: now,
  };
}
