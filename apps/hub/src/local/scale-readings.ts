import type { BodyReadingRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ScaleMeasurement } from '../store/repositories/body-readings';
import type { Store } from '../store/store';
import type { ScaleOutcome } from './scale-units';

export interface ScaleReadingsOptions {
  readonly store: Pick<Store, 'host'>;
  readonly log: Logger;
}

export class ScaleReadings {
  constructor(private readonly options: ScaleReadingsOptions) {}

  async record(measurement: ScaleMeasurement): Promise<BodyReadingRow> {
    return this.noted(await this.options.store.host.write('scaleRecord', measurement));
  }

  async assign(readingId: string, profileId: string | null): Promise<BodyReadingRow> {
    return this.noted(await this.options.store.host.write('scaleAssign', { readingId, profileId }));
  }

  async recomputeOutdated(): Promise<number> {
    const outdated = await this.options.store.host.read('scaleOutdated', null);
    let total = 0;
    for (const profileId of outdated) total += await this.recomputeFor(profileId);
    return total;
  }

  async recomputeFor(profileId: string): Promise<number> {
    return this.noted(await this.options.store.host.write('scaleRecompute', profileId));
  }

  private noted<T>(outcome: ScaleOutcome<T>): T {
    for (const note of outcome.notes) this.options.log.info(note.event, note.fields);
    return outcome.value;
  }
}
