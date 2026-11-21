import type { ScheduleRow } from '@smarteverything/domain';
import type { ConversationAuthority } from '../harness/authority-contract';
import { storeUnit } from '../store/host/unit';
import type { NewSchedule, ScheduleChange } from '../store/repositories/schedules';
import { occurrencesOf } from './timing';

export interface ScheduleCreation {
  readonly schedule: Omit<NewSchedule, 'occurrences'>;
  readonly now: string;
  readonly authority: ConversationAuthority | null;
}

export interface ScheduleUpdate {
  readonly id: string;
  readonly change: ScheduleChange;
  readonly authority: ConversationAuthority | null;
}

function kept(authority: ConversationAuthority | null): ConversationAuthority | undefined {
  return authority ?? undefined;
}

export const CREATE_SCHEDULE_UNIT = storeUnit((store, creation: ScheduleCreation): ScheduleRow => {
  const saved = store.schedules.create({
    ...creation.schedule,
    occurrences: occurrencesOf(
      creation.schedule.timing,
      new Date(creation.now),
      store.settings.read().time_zone,
    ),
  });
  store.harnessRecovery.effects.keep('schedule', saved.id, kept(creation.authority));
  return saved;
});

export const UPDATE_SCHEDULE_UNIT = storeUnit((store, update: ScheduleUpdate): ScheduleRow => {
  store.harnessRecovery.effects.keep('schedule', update.id, kept(update.authority));
  return store.schedules.update(update.id, update.change);
});
