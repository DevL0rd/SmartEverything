import {
  ApiError,
  type PLANNER_ALARM_CHANGES,
  type PlannerAlarmRow,
  type PlannerPreferences,
  type PlannerRingTarget,
} from '@smarteverything/domain';
import { ZodError, type z } from 'zod';
import { pageOf, requireBookable } from '../../planner/booking/pages';
import { respondAsMember } from '../../planner/guests/rsvp';
import { setGuestList } from '../../planner/guests/guest-list';
import { suggestGuests } from '../../planner/guests/suggestions';
import { writes } from '../../planner/sharing/edit-rules';
import { requireSharee, requireShareable } from '../../planner/sharing/shares';
import { resolveItem } from '../../planner/sharing/visibility';
import { storeUnit } from '../../store/host/unit';
import type { PlannerAlarmPatch } from '../../store/repositories/planner-alarms';
import type { Store } from '../../store/store';
import { invalid } from '../invalid';
import type { Refusal } from '../person-access';
import {
  requireAutomation,
  requireChallenge,
  requireTargets,
  sunriseRefusal,
} from './planner-alarm-checks';
import { plannerProfileOf, type PlannerAsk } from './planner-profile';

export type Checked<T> =
  | { readonly kind: 'done'; readonly value: T }
  | { readonly kind: 'refused'; readonly why: Refusal };

function validated<T>(what: string, work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof ZodError) throw invalid(what, cause);
    throw cause;
  }
}

function alarmPatch(changes: z.infer<typeof PLANNER_ALARM_CHANGES>): PlannerAlarmPatch {
  const patch: PlannerAlarmPatch = {};
  for (const [field, value] of Object.entries(changes)) {
    if (value !== undefined) Object.assign(patch, { [field]: value });
  }
  return patch;
}

type AlarmCreate = PlannerAsk<'createPlannerAlarm'> & {
  readonly clock: PlannerPreferences['clock'];
};

function createAlarm(
  store: Store,
  { caller, query, body, clock }: AlarmCreate,
): Checked<PlannerAlarmRow> {
  const profileId = plannerProfileOf({ store }, caller, query.personId);
  const made = body.id === undefined ? undefined : store.plannerAlarms.findAny(body.id);
  if (made !== undefined) {
    if (made.profile_id !== profileId) throw new ApiError('forbidden', 'That alarm id is taken.');
    return { kind: 'done', value: made };
  }
  const targets = body.targets ?? clock.targets;
  requireTargets(store, targets);
  requireAutomation({ store }, caller, body.wake_automation_id);
  const why = sunriseRefusal(store, caller, body.sunrise);
  if (why !== null) return { kind: 'refused', why };
  requireChallenge(store, body.challenge, targets);
  const value = validated('alarm', () =>
    store.plannerAlarms.insert({
      id: body.id,
      profile_id: profileId,
      label: body.label,
      time: body.time,
      days: body.days,
      once_on: body.once_on,
      skip_on: null,
      enabled: body.enabled,
      sound: body.sound ?? clock.sound,
      ramp_seconds: body.ramp_seconds ?? clock.ramp_seconds,
      vibrate: body.vibrate ?? true,
      snooze_minutes: body.snooze_minutes ?? clock.snooze_minutes,
      snooze_limit: body.snooze_limit === undefined ? clock.snooze_limit : body.snooze_limit,
      challenge: body.challenge,
      sunrise: body.sunrise,
      smart_minutes: body.smart_minutes,
      wake_automation_id: body.wake_automation_id,
      wake_lead_minutes: body.wake_lead_minutes,
      targets,
      watch: [],
      source: 'planner',
    }),
  );
  return { kind: 'done', value };
}

function updateAlarm(
  store: Store,
  { caller, query, body, params }: PlannerAsk<'updatePlannerAlarm'>,
): Checked<PlannerAlarmRow> {
  const profileId = plannerProfileOf({ store }, caller, query.personId);
  requireTargets(store, body.targets);
  requireAutomation({ store }, caller, body.wake_automation_id);
  const why = sunriseRefusal(store, caller, body.sunrise);
  if (why !== null) return { kind: 'refused', why };
  if (body.challenge !== undefined || body.targets !== undefined) {
    const alarm = store.plannerAlarms.byId(params.alarmId, profileId);
    requireChallenge(store, body.challenge ?? alarm.challenge, body.targets ?? alarm.targets);
  }
  const value = validated('alarm', () =>
    store.plannerAlarms.update(params.alarmId, profileId, alarmPatch(body)),
  );
  return { kind: 'done', value };
}

export const PLANNER_SHARED_READ_UNITS = {
  plannerTargetsCheck: storeUnit(
    (store, { targets }: { readonly targets: readonly PlannerRingTarget[] }) => {
      requireTargets(store, targets);
    },
  ),
  plannerGuestSuggestions: storeUnit(
    (store, { caller, query }: PlannerAsk<'suggestPlannerGuests'>) =>
      suggestGuests(store, plannerProfileOf({ store }, caller, query.personId), query.text),
  ),
} as const;

export const PLANNER_SHARED_WRITE_UNITS = {
  plannerAlarmCreate: storeUnit(createAlarm),
  plannerAlarmUpdate: storeUnit(updateAlarm),
  plannerBookingCreate: storeUnit(
    (store, { caller, query, body }: PlannerAsk<'createPlannerBookingPage'>) => {
      const profileId = plannerProfileOf({ store }, caller, query.personId);
      requireBookable(store, profileId, body.collection_id);
      return store.plannerBookingPages.insert(profileId, body);
    },
  ),
  plannerBookingUpdate: storeUnit(
    (store, { caller, query, body, params }: PlannerAsk<'updatePlannerBookingPage'>) => {
      const profileId = plannerProfileOf({ store }, caller, query.personId);
      if (body.collection_id !== undefined) requireBookable(store, profileId, body.collection_id);
      return store.plannerBookingPages.update(params.pageId, profileId, body);
    },
  ),
  plannerBookingDelete: storeUnit(
    (store, { caller, query, params }: PlannerAsk<'deletePlannerBookingPage'>): void => {
      const profileId = plannerProfileOf({ store }, caller, query.personId);
      store.plannerBookingPages.remove(pageOf(store, profileId, params.pageId).id, profileId);
    },
  ),
  plannerPreferencesWrite: storeUnit(
    (store, { caller, query, body }: PlannerAsk<'writePlannerPreferences'>) => {
      const profileId = plannerProfileOf({ store }, caller, query.personId);
      requireTargets(store, body.clock.targets);
      if (body.tasks.default_collection_id !== null) {
        store.plannerCollections.byId(body.tasks.default_collection_id, profileId);
      }
      return { profileId, preferences: store.plannerPreferences.put(profileId, body).preferences };
    },
  ),
  plannerShare: storeUnit(
    (store, { caller, query, body, params }: PlannerAsk<'sharePlannerCollection'>) => {
      const profileId = plannerProfileOf({ store }, caller, query.personId);
      const collection = requireShareable(store, profileId, params.collectionId);
      requireSharee(store, collection, params.personId);
      return store.plannerShares.save({
        collection_id: collection.id,
        profile_id: params.personId,
        role: body.role,
      });
    },
  ),
  plannerUnshare: storeUnit(
    (store, { caller, query, params }: PlannerAsk<'unsharePlannerCollection'>): void => {
      const profileId = plannerProfileOf({ store }, caller, query.personId);
      const collection = store.plannerCollections.anyById(params.collectionId);
      if (collection.profile_id !== profileId && params.personId !== profileId) {
        throw new ApiError('forbidden', 'Only the owner or the person shared with can stop this.');
      }
      store.plannerShares.remove(collection.id, params.personId);
    },
  ),
  plannerGuestsSet: storeUnit(
    (store, { caller, query, body, params }: PlannerAsk<'setPlannerGuests'>) => {
      const profileId = plannerProfileOf({ store }, caller, query.personId);
      const { item, role } = resolveItem(store, profileId, params.itemId, 'read');
      if (!writes(role)) throw new ApiError('forbidden', 'You may not change the guests.');
      return setGuestList(store, item, body.guests);
    },
  ),
  plannerRsvp: storeUnit(
    (
      store,
      { caller, query, body, params, at }: PlannerAsk<'respondPlannerInvite'> & { at: string },
    ) => {
      const profileId = plannerProfileOf({ store }, caller, query.personId);
      const { item } = resolveItem(store, profileId, params.itemId, 'rsvp');
      return respondAsMember(store, item, profileId, { ...body, at });
    },
  ),
} as const;
