import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import type { SearchInput } from './query';
import type { RecentSearch } from './recent';
import type { TryChip } from './try-chips';

export interface SearchStartProps {
  readonly chips: readonly TryChip[];
  readonly recent: readonly RecentSearch[];
  readonly onApply: (search: SearchInput) => void;
  readonly onForget: (key: string) => void;
}

function TryRow({ chips, onApply }: Pick<SearchStartProps, 'chips' | 'onApply'>): ReactNode {
  if (chips.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="caption" tone="variant">
        Try
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {chips.map((chip) => (
          <Button
            key={chip.label}
            label={chip.label}
            variant="tonal"
            onPress={() => {
              onApply({ tokens: chip.tokens, text: '' });
            }}
          />
        ))}
      </View>
    </View>
  );
}

function RecentRow({
  entry,
  onApply,
  onForget,
}: {
  readonly entry: RecentSearch;
  readonly onApply: (search: SearchInput) => void;
  readonly onForget: (key: string) => void;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View className={cn('flex-row items-center gap-1', pointer ? 'min-h-9' : 'min-h-touch-min')}>
      <Interactive
        role="button"
        label={`Search again for ${entry.title}`}
        onPress={() => {
          onApply(entry);
        }}
        className="min-h-touch-min flex-1 flex-row items-center gap-3 rounded-sm px-1"
        layerClassName="rounded-sm"
      >
        <Icon name="history" size={pointer ? 16 : 20} tone="variant" />
        <Text variant={pointer ? 'footnote' : 'body'} className="flex-1" numberOfLines={1}>
          {entry.title}
        </Text>
      </Interactive>
      <IconButton
        icon="close"
        label={`Forget ${entry.title}`}
        tone="faint"
        onPress={() => {
          onForget(entry.key);
        }}
      />
    </View>
  );
}

export function SearchStart({ chips, recent, onApply, onForget }: SearchStartProps): ReactNode {
  return (
    <View className="gap-section-gap">
      <TryRow chips={chips} onApply={onApply} />
      {recent.length === 0 ? null : (
        <View className="gap-1">
          <Text variant="caption" tone="variant">
            Recent
          </Text>
          {recent.map((entry) => (
            <RecentRow key={entry.key} entry={entry} onApply={onApply} onForget={onForget} />
          ))}
        </View>
      )}
    </View>
  );
}
