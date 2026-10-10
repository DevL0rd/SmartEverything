import { withUnit } from '../../../format/number';
import { joinParts } from '../../../format/text';
import type { MetricReading } from '../../climate';

export interface HomeSummary {
  readonly facts: string | null;
  readonly offline: number;
}

function factsOf(readings: readonly MetricReading[]): string | null {
  const temperature = readings.find((reading) => reading.metric === 'temperature');
  const air = readings.find((reading) => reading.metric === 'pm25');
  const facts = joinParts([
    temperature === undefined || temperature.stale
      ? null
      : `${withUnit(temperature.value, temperature.unit)} inside`,
    air === undefined || air.stale ? null : air.verdict,
  ]);
  return facts === '' ? null : facts;
}

export function homeSummary(readings: readonly MetricReading[], offline: number): HomeSummary {
  return {
    facts: factsOf(readings),
    offline,
  };
}
