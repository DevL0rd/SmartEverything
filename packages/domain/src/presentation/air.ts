export const AIR_BANDS = ['good', 'fair', 'moderate', 'poor', 'bad', 'severe'] as const;

export type AirBand = (typeof AIR_BANDS)[number];

export const AIR_BAND_LABELS: Readonly<Record<AirBand, string>> = {
  good: 'Good air',
  fair: 'Fair air',
  moderate: 'Moderate air',
  poor: 'Poor air',
  bad: 'Bad air',
  severe: 'Severe pollution',
};

const PM25_UPPER_BOUNDS: readonly (readonly [number, AirBand])[] = [
  [12, 'good'],
  [35.4, 'fair'],
  [55.4, 'moderate'],
  [150.4, 'poor'],
  [250.4, 'bad'],
];

export function airBand(pm25: number): AirBand {
  const found = PM25_UPPER_BOUNDS.find(([upper]) => pm25 <= upper);
  return found === undefined ? 'severe' : found[1];
}
