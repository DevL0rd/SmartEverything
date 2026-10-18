import type { BodyReadingRow, ProfileRow } from '@smarteverything/domain';
import type { WeighedReading } from '../../../store/people';
import { weighInsOf, type WeighIn } from './weigh-ins';

export interface Person {
  readonly profile: ProfileRow;
  readonly weighIns: readonly WeighIn[];
}

export interface ScaleReadings {
  readonly people: readonly Person[];
  readonly pending: readonly WeighedReading[];
}

export function scaleReadingsOf(
  readings: readonly BodyReadingRow[],
  profiles: readonly ProfileRow[],
  deviceId: string,
): ScaleReadings {
  const mine = readings.filter(
    (reading): reading is WeighedReading =>
      reading.weight_kg !== null && reading.device_id === deviceId,
  );
  return {
    people: profiles
      .map((profile) => ({
        profile,
        weighIns: weighInsOf(
          mine.filter(
            (reading) =>
              reading.profile_id === profile.id &&
              reading.attribution !== 'pending' &&
              reading.attribution !== 'ignored',
          ),
        ),
      }))
      .filter((person) => person.weighIns.length > 0),
    pending: mine.filter((reading) => reading.attribution === 'pending'),
  };
}

export function pickPerson(
  people: readonly Person[],
  wanted: string | null,
  active: string | null,
): Person | null {
  const named = (id: string | null): Person | undefined =>
    people.find((person) => person.profile.id === id);
  const latestAt = (person: Person): number => person.weighIns.at(-1)?.at ?? 0;
  return (
    named(wanted) ??
    named(active) ??
    [...people].sort((left, right) => latestAt(right) - latestAt(left))[0] ??
    null
  );
}
