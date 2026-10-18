export const OUTLIER_RULES = {
  fractionFromMedian: 0.08,
  recentCount: 5,
} as const;

export interface WeighIn {
  readonly weightKg: number;
  readonly confirmed: boolean;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const half = sorted.length / 2;
  const middle = sorted.slice(Math.ceil(half) - 1, Math.floor(half) + 1);
  return middle.reduce((sum, value) => sum + value, 0) / middle.length;
}

export function isOutlier(weightKg: number, acceptedKg: readonly number[]): boolean {
  const recent = acceptedKg.slice(-OUTLIER_RULES.recentCount);
  if (recent.length === 0) {
    return false;
  }
  const median = medianOf(recent);
  return Math.abs(weightKg - median) > median * OUTLIER_RULES.fractionFromMedian;
}

export function outlierFlags(weighIns: readonly WeighIn[]): readonly boolean[] {
  const accepted: number[] = [];
  return weighIns.map((weighIn) => {
    const outlier = !weighIn.confirmed && isOutlier(weighIn.weightKg, accepted);
    if (!outlier) {
      accepted.push(weighIn.weightKg);
    }
    return outlier;
  });
}

export function acceptedWeights(weighIns: readonly WeighIn[]): readonly number[] {
  const flags = outlierFlags(weighIns);
  return weighIns.filter((_, index) => flags[index] === false).map((weighIn) => weighIn.weightKg);
}
