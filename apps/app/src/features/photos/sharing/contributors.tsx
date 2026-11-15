import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { SegmentBar, type BarSegment } from '../../../components/charts';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { contributionsOf, nameOf, type Person } from './model';

const PALETTE: readonly BarSegment['colour'][] = [
  'viz-1',
  'viz-2',
  'viz-3',
  'viz-4',
  'viz-5',
  'viz-6',
];

export function contributionSegments(
  items: readonly { readonly addedByProfileId: string | null }[],
  people: readonly Person[],
  me: string | null,
): readonly BarSegment[] {
  return contributionsOf(items).map((entry, index) => ({
    label: nameOf(entry.profileId, people, me),
    value: entry.items,
    colour: PALETTE[index % PALETTE.length] ?? 'viz-1',
  }));
}

export function Contributors({
  items,
  complete,
}: {
  readonly items: readonly DriveItem[];
  readonly complete: boolean;
}): ReactNode {
  const segments = contributionSegments(items, useProfiles(), useActiveProfile()?.id ?? null);
  if (segments.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        {complete ? 'Who added the photos' : 'Who added the photos loaded so far'}
      </Text>
      <SegmentBar segments={segments} label="Photos added by each person" legend format={count} />
    </View>
  );
}
