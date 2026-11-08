import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SegmentBar, type BarSegment } from '../../../components/charts';
import { bytes } from '../../../format/number';

export interface CacheFacts {
  readonly cacheBytes: number;
  readonly pinnedBytes: number;
  readonly freeBytes: number | null;
}

export const CACHE_WORD = {
  cached: 'Cached',
  pinned: 'Kept offline',
  free: 'Free disk',
} as const;

export function cacheSegmentsOf(facts: CacheFacts): readonly BarSegment[] {
  return [
    { label: CACHE_WORD.cached, value: facts.cacheBytes, colour: 'primary' },
    { label: CACHE_WORD.pinned, value: facts.pinnedBytes, colour: 'viz-4' },
    ...(facts.freeBytes === null
      ? []
      : [{ label: CACHE_WORD.free, value: facts.freeBytes, colour: 'surface-3' } as const]),
  ];
}

export function CacheBar({
  facts,
  name,
  faded = false,
}: {
  readonly facts: CacheFacts;
  readonly name: string;
  readonly faded?: boolean;
}): ReactNode {
  return (
    <View className={faded ? 'opacity-60' : ''}>
      <SegmentBar
        segments={cacheSegmentsOf(facts)}
        label={`${name} cache`}
        size="thin"
        legend
        format={bytes}
      />
    </View>
  );
}
