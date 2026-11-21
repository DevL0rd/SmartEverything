import {
  COMPOSITION_FORMULA,
  attributeReading,
  bmiOf,
  bodyComposition,
  bodyFactsOf,
  fitnessReady,
  impedancePair,
  type Attribution,
  type BodyReadingRow,
} from '@smarteverything/domain';
import type { ReadingOwner, ScaleMeasurement } from '../store/repositories/body-readings';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';
import { healthRecordsOf, recordIdsOf } from './reading-records';

function measuredChange(before: BodyReadingRow, after: BodyReadingRow): boolean {
  return (
    before.weight_kg !== after.weight_kg ||
    before.heart_rate !== after.heart_rate ||
    before.impedance_low !== after.impedance_low ||
    before.impedance_high !== after.impedance_high
  );
}

function stale(reading: BodyReadingRow, ready: boolean): boolean {
  if (reading.composition !== null) {
    return reading.composition.formula !== COMPOSITION_FORMULA;
  }
  return ready && reading.weight_kg !== null && reading.impedance_low !== null;
}

export interface ScaleNote {
  readonly event: 'scale.attributed' | 'scale.slot_learned' | 'scale.recomputed';
  readonly fields: Readonly<Record<string, string | number | null>>;
}

export interface ScaleOutcome<T> {
  readonly value: T;
  readonly notes: readonly ScaleNote[];
}

class ScaleWork {
  readonly notes: ScaleNote[] = [];

  constructor(private readonly store: Store) {}

  record(measurement: ScaleMeasurement): BodyReadingRow {
    const { store } = this;
    const { before, after } = store.bodyReadings.merge(measurement);
    const weight = after.weight_kg;
    if (weight === null) {
      return after;
    }
    if (before?.weight_kg === null || before === undefined) {
      return this.attribute(after, weight);
    }
    if (after.profile_id === null || !measuredChange(before, after)) {
      return after;
    }
    return this.own(after, after.profile_id, after.attribution);
  }

  assign(readingId: string, profileId: string | null): BodyReadingRow {
    const { store } = this;
    const reading = store.bodyReadings.byId(readingId);
    if (profileId === null) {
      return this.own(reading, null, 'ignored');
    }
    store.profiles.byId(profileId);
    if (reading.scale_user !== null) {
      store.profiles.learnScaleUser(profileId, reading.scale_user);
    }
    return this.own(reading, profileId, 'person');
  }

  outdated(): string[] {
    const { store } = this;
    return store.profiles
      .list()
      .filter((profile) =>
        store.bodyReadings
          .ofProfile(profile.id)
          .some((reading) => stale(reading, fitnessReady(profile))),
      )
      .map((profile) => profile.id);
  }

  recomputeFor(profileId: string): number {
    const readings = this.store.bodyReadings.ofProfile(profileId);
    for (const reading of readings) {
      this.own(reading, profileId, reading.attribution);
    }
    this.notes.push({
      event: 'scale.recomputed',
      fields: { profileId, readings: readings.length },
    });
    return readings.length;
  }

  private attribute(reading: BodyReadingRow, weightKg: number): BodyReadingRow {
    const { store } = this;
    const candidates = store.profiles.list().map((profile) => ({
      profileId: profile.id,
      scaleUser: profile.scale_user,
      weighIns: store.bodyReadings
        .ofProfile(profile.id)
        .flatMap((owned) =>
          owned.weight_kg === null
            ? []
            : [{ weightKg: owned.weight_kg, confirmed: owned.attribution === 'person' }],
        ),
    }));
    const result = attributeReading({ scaleUser: reading.scale_user, weightKg }, candidates);
    this.notes.push({
      event: 'scale.attributed',
      fields: {
        readingId: reading.id,
        attribution: result.attribution,
        candidates: candidates.length,
      },
    });
    if (result.profileId !== null) {
      this.linkFreeSlot(result.profileId, reading.scale_user);
    }
    return this.own(reading, result.profileId, result.attribution);
  }

  private linkFreeSlot(profileId: string, scaleUser: number | null): void {
    const profiles = this.store.profiles;
    if (scaleUser === null || profiles.byId(profileId).scale_user !== null) {
      return;
    }
    if (profiles.list().every((profile) => profile.scale_user !== scaleUser)) {
      profiles.learnScaleUser(profileId, scaleUser);
      this.notes.push({ event: 'scale.slot_learned', fields: { profileId, scaleUser } });
    }
  }

  private ownerOf(
    reading: BodyReadingRow,
    profileId: string | null,
    attribution: Attribution,
  ): ReadingOwner {
    const profile = profileId === null ? null : this.store.profiles.byId(profileId);
    const facts = profile === null ? null : bodyFactsOf(profile, new Date(reading.measured_at));
    const weight = reading.weight_kg;
    const impedance = impedancePair([reading.impedance_low, reading.impedance_high]);
    return {
      profileId,
      attribution,
      bmi: facts === null || weight === null ? null : bmiOf(weight, facts.heightCm),
      composition:
        facts === null || weight === null || impedance === null
          ? null
          : bodyComposition({
              ...facts,
              weightKg: weight,
              impedanceLow: impedance.low,
              impedanceHigh: impedance.high,
            }),
    };
  }

  private own(
    reading: BodyReadingRow,
    profileId: string | null,
    attribution: Attribution,
  ): BodyReadingRow {
    const { store } = this;
    const { after } = store.bodyReadings.own(
      reading.id,
      this.ownerOf(reading, profileId, attribution),
    );
    const counted = attribution !== 'pending' && attribution !== 'ignored';
    store.health.replaceOwn({
      profileId: counted ? profileId : null,
      previous: reading.profile_id,
      records:
        counted && profileId !== null
          ? healthRecordsOf(after, {
              timeZone: store.settings.read().time_zone,
              heightCm: store.profiles.byId(profileId).height_cm,
            })
          : [],
      removed: recordIdsOf(reading.id),
    });
    return after;
  }
}

function worked<I, T>(
  run: (work: ScaleWork, input: I) => T,
): (store: Store, input: I) => ScaleOutcome<T> {
  return (store, input) => {
    const work = new ScaleWork(store);
    const value = run(work, input);
    return { value, notes: work.notes };
  };
}

export const SCALE_RECORD_UNIT = storeUnit(
  worked((work, measurement: ScaleMeasurement) => work.record(measurement)),
);

export const SCALE_ASSIGN_UNIT = storeUnit(
  worked(
    (
      work,
      { readingId, profileId }: { readonly readingId: string; readonly profileId: string | null },
    ) => work.assign(readingId, profileId),
  ),
);

export const SCALE_OUTDATED_UNIT = storeUnit((store, _input: null): string[] =>
  new ScaleWork(store).outdated(),
);

export const SCALE_RECOMPUTE_UNIT = storeUnit(
  worked((work, profileId: string) => work.recomputeFor(profileId)),
);
