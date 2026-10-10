import {
  ATTRIBUTION_RULES,
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
import type { Logger } from '@smarteverything/logging';
import type { ReadingOwner, ScaleMeasurement } from '../store/repositories/body-readings';
import type { Store } from '../store/store';
import { healthRecordsOf, recordIdsOf } from './reading-records';

const DAY_MS = 86_400_000;

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

export interface ScaleReadingsOptions {
  readonly store: Store;
  readonly log: Logger;
  readonly now: () => Date;
}

export class ScaleReadings {
  constructor(private readonly options: ScaleReadingsOptions) {}

  record(measurement: ScaleMeasurement): BodyReadingRow {
    const { store } = this.options;
    return store.write(() => {
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
    });
  }

  assign(readingId: string, profileId: string | null): BodyReadingRow {
    const { store } = this.options;
    return store.write(() => {
      const reading = store.bodyReadings.byId(readingId);
      if (profileId === null) {
        return this.own(reading, null, 'ignored');
      }
      store.profiles.byId(profileId);
      if (reading.scale_user !== null) {
        store.profiles.learnScaleUser(profileId, reading.scale_user);
      }
      return this.own(reading, profileId, 'person');
    });
  }

  recomputeOutdated(): number {
    const outdated = new Set(
      this.options.store.profiles
        .list()
        .filter((profile) =>
          this.options.store.bodyReadings
            .ofProfile(profile.id)
            .some((reading) => stale(reading, fitnessReady(profile))),
        )
        .map((profile) => profile.id),
    );
    return [...outdated].reduce((total, profileId) => total + this.recomputeFor(profileId), 0);
  }

  recomputeFor(profileId: string): number {
    const { store } = this.options;
    return store.write(() => {
      const readings = store.bodyReadings.ofProfile(profileId);
      for (const reading of readings) {
        this.own(reading, profileId, reading.attribution);
      }
      this.options.log.info('scale.recomputed', { profileId, readings: readings.length });
      return readings.length;
    });
  }

  private attribute(reading: BodyReadingRow, weightKg: number): BodyReadingRow {
    const { store, now } = this.options;
    const since = new Date(now().getTime() - ATTRIBUTION_RULES.lookbackDays * DAY_MS);
    const weights = store.bodyReadings.lastWeights(since.toISOString());
    const candidates = store.profiles.list().map((profile) => ({
      profileId: profile.id,
      scaleUser: profile.scale_user,
      lastWeightKg: weights.get(profile.id) ?? null,
    }));
    const result = attributeReading({ weightKg, scaleUser: reading.scale_user }, candidates);
    this.options.log.info('scale.attributed', {
      readingId: reading.id,
      attribution: result.attribution,
      candidates: candidates.length,
    });
    return this.own(reading, result.profileId, result.attribution);
  }

  private ownerOf(
    reading: BodyReadingRow,
    profileId: string | null,
    attribution: Attribution,
  ): ReadingOwner {
    const profile = profileId === null ? null : this.options.store.profiles.byId(profileId);
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
    const { store } = this.options;
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
