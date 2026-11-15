import type { PlannerCollectionRow, PlannerItemRow, ProfileRow } from '@smarteverything/domain';
import type { PlannerItemInput } from '../../store/repositories/planner-items';
import type { Store } from '../../store/store';
import { allDayEvent } from '../feeds/all-day-event';

export type BirthdayStore = Pick<Store, 'write' | 'profiles' | 'plannerItems'>;

export const BIRTHDAY_UID_PREFIX = 'birthday:';

const YEARLY = 'FREQ=YEARLY';

const LAST_DAY_OF_FEBRUARY = 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1';

export function birthdayUid(profileId: string): string {
  return `${BIRTHDAY_UID_PREFIX}${profileId}`;
}

export function birthdayTitle(name: string): string {
  return name === 'Me' ? 'My birthday' : `${name}’s birthday`;
}

export function birthdayRule(birthDate: string): string {
  return birthDate.endsWith('-02-29') ? LAST_DAY_OF_FEBRUARY : YEARLY;
}

function wanted(
  collection: PlannerCollectionRow,
  profile: ProfileRow & { readonly birth_date: string },
  position: number,
): PlannerItemInput {
  return allDayEvent({
    profileId: collection.profile_id,
    collectionId: collection.id,
    position,
    uid: birthdayUid(profile.id),
    title: birthdayTitle(profile.name),
    date: profile.birth_date,
    rrule: birthdayRule(profile.birth_date),
  });
}

function sameAs(row: PlannerItemRow, input: PlannerItemInput): boolean {
  return (
    row.title === input.title && row.start_local === input.start_local && row.rrule === input.rrule
  );
}

function hasBirthDate(profile: ProfileRow): profile is ProfileRow & { birth_date: string } {
  return profile.birth_date !== null;
}

export function reconcileBirthdays(store: BirthdayStore, collection: PlannerCollectionRow): void {
  store.write(() => {
    const { plannerItems } = store;
    const rows = plannerItems.inCollection(collection.id);
    const generated = new Map(
      rows
        .filter((row) => row.created_by === 'feed' && row.ical_uid !== null)
        .map((row) => [row.ical_uid, row]),
    );
    let position = rows.reduce((highest, row) => Math.max(highest, row.position + 1), 0);
    const kept = new Set<string>();
    for (const profile of store.profiles.list().filter(hasBirthDate)) {
      const uid = birthdayUid(profile.id);
      const existing = generated.get(uid);
      const input = wanted(collection, profile, existing?.position ?? position);
      if (existing === undefined) {
        plannerItems.insert(input);
        position += 1;
      } else if (!sameAs(existing, input)) {
        plannerItems.update(existing.id, existing.profile_id, {
          title: input.title,
          start_local: input.start_local,
          end_local: input.end_local,
          rrule: input.rrule,
          start: input.start,
          end: input.end,
          series_end: input.series_end,
        });
      }
      kept.add(uid);
    }
    for (const [uid, row] of generated) {
      if (uid !== null && !kept.has(uid)) plannerItems.purge(row.id, row.profile_id);
    }
  });
}
