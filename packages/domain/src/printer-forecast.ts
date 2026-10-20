const DAY_MS = 86_400_000;
const MIN_SAMPLES = 3;
const MIN_SPAN_DAYS = 2;
const FLAT_SLOPE = 0.0001;

export interface SupplySample {
  readonly at: number;
  readonly level: number;
  readonly pages: number | null;
}

export interface SupplyForecast {
  readonly percentPerDay: number;
  readonly percentPer100Pages: number | null;
  readonly daysLeft: number;
  readonly emptyAt: number;
}

function slopeOf(points: readonly (readonly [number, number])[]): number | null {
  const count = points.length;
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / count;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / count;
  const spread = points.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0);
  if (spread === 0) return null;
  return points.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0) / spread;
}

function perPages(samples: readonly SupplySample[]): number | null {
  const paged = samples.flatMap((sample): readonly (readonly [number, number])[] =>
    sample.pages === null ? [] : [[sample.pages, sample.level]],
  );
  if (paged.length < MIN_SAMPLES) return null;
  const slope = slopeOf(paged);
  return slope === null || slope >= -FLAT_SLOPE ? null : -slope * 100;
}

export function forecastSupply(samples: readonly SupplySample[]): SupplyForecast | null {
  const [first] = samples;
  const last = samples.at(-1);
  if (first === undefined || last === undefined || samples.length < MIN_SAMPLES) return null;
  if (last.at - first.at < MIN_SPAN_DAYS * DAY_MS) return null;
  const slope = slopeOf(samples.map((sample) => [(sample.at - first.at) / DAY_MS, sample.level]));
  if (slope === null || slope >= -FLAT_SLOPE) return null;
  const daysLeft = Math.max(0, last.level / -slope);
  return {
    percentPerDay: -slope,
    percentPer100Pages: perPages(samples),
    daysLeft,
    emptyAt: last.at + daysLeft * DAY_MS,
  };
}
