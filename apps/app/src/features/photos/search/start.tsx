import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { FlatChoice } from '../../../components/flat-choice';
import { Text } from '../../../components/text';
import type { SearchInput } from './query';
import type { RecentSearch } from './recent';
import type { TryChip } from './try-chips';

export interface SearchStartProps {
  readonly chips: readonly TryChip[];
  readonly recent: readonly RecentSearch[];
  readonly onApply: (search: SearchInput) => void;
  readonly onClearRecent: () => void;
}

export function hasStart(chips: readonly TryChip[], recent: readonly RecentSearch[]): boolean {
  return chips.length > 0 || recent.length > 0;
}

function RecentRow({
  recent,
  onApply,
  onClearRecent,
}: Pick<SearchStartProps, 'recent' | 'onApply' | 'onClearRecent'>): ReactNode {
  if (recent.length === 0) return null;
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="variant">
          Recent searches
        </Text>
        <Button label="Clear recent searches" variant="text" onPress={onClearRecent} />
      </View>
      <View accessibilityLabel="Recent searches" className="flex-row flex-wrap gap-2">
        {recent.map((entry) => (
          <FlatChoice
            key={entry.key}
            label={entry.title}
            spoken={`Search again for ${entry.title}`}
            icon="history"
            role="button"
            active={false}
            onPress={() => {
              onApply(entry);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function TryRow({ chips, onApply }: Pick<SearchStartProps, 'chips' | 'onApply'>): ReactNode {
  if (chips.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        Try
      </Text>
      <View accessibilityLabel="Try a search" className="flex-row flex-wrap gap-2">
        {chips.map((chip) => (
          <FlatChoice
            key={chip.label}
            label={chip.label}
            icon="sparkles"
            role="button"
            active={false}
            onPress={() => {
              onApply({ tokens: chip.tokens, text: '' });
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function SearchStart({
  chips,
  recent,
  onApply,
  onClearRecent,
}: SearchStartProps): ReactNode {
  return (
    <View className="gap-section-gap">
      <RecentRow recent={recent} onApply={onApply} onClearRecent={onClearRecent} />
      <TryRow chips={chips} onApply={onApply} />
    </View>
  );
}
