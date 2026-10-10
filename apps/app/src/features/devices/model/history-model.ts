import type {
  DevicePresentation,
  PresentationTier,
  PresentedCapability,
} from '@smarteverything/domain';

export const HISTORY_RANGES = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 d' },
  { value: '30d', label: '30 d' },
] as const;

export type HistoryRangeKey = (typeof HISTORY_RANGES)[number]['value'];

export const RANGE_HOURS: Readonly<Record<HistoryRangeKey, number>> = {
  '24h': 24,
  '7d': 168,
  '30d': 720,
};

const STANDARD_TIERS: ReadonlySet<PresentationTier> = new Set([
  'reading',
  'primary',
  'control',
  'maintenance',
]);

function charted(presented: PresentedCapability, extras: boolean): boolean {
  if (presented.capability.value.kind !== 'number' || presented.role === 'power') {
    return false;
  }
  return STANDARD_TIERS.has(presented.tier) || (extras && presented.tier === 'extra');
}

const FIRST_TIERS: readonly PresentationTier[] = [
  'reading',
  'primary',
  'control',
  'maintenance',
  'extra',
];

export function historyMetrics(
  presentation: DevicePresentation,
  extras: boolean,
): readonly PresentedCapability[] {
  const metrics = presentation.capabilities.filter((presented) => charted(presented, extras));
  return [...metrics].sort(
    (left, right) =>
      FIRST_TIERS.indexOf(left.tier) - FIRST_TIERS.indexOf(right.tier) ||
      metrics.indexOf(left) - metrics.indexOf(right),
  );
}
