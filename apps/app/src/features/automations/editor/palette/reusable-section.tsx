import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { NEW_REUSABLE_KEY } from './palette-categories';
import { PaletteRow, type PaletteRowProps } from './palette-row';
import type { RankedEntry } from './palette-search';

export interface ReusableSectionProps {
  readonly rows: readonly RankedEntry[];
  readonly favourites: readonly string[];
  readonly onPick: PaletteRowProps['onPick'];
  readonly onToggleFavourite: PaletteRowProps['onToggleFavourite'];
}

function NewReusableRow({ onPress }: { readonly onPress: () => void }): ReactNode {
  return (
    <Interactive
      label="New Custom Node. Build your own step or value once and use it in any automation."
      onPress={onPress}
      className="min-h-touch-min flex-row items-center gap-3 rounded-sm bg-primary-container px-3 py-2"
      layerClassName="rounded-sm"
    >
      <Icon name="plus" size={24} tone="onPrimaryContainer" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" tone="onPrimaryContainer" numberOfLines={1}>
          New Custom Node
        </Text>
        <Text variant="footnote" tone="onPrimaryContainer" numberOfLines={2}>
          Build your own step or value once and use it in any automation.
        </Text>
      </View>
    </Interactive>
  );
}

export function ReusableSection({
  rows,
  favourites,
  onPick,
  onToggleFavourite,
}: ReusableSectionProps): ReactNode {
  return (
    <View className="gap-1">
      {rows.map(({ entry, reason }) =>
        entry.key === NEW_REUSABLE_KEY ? (
          <NewReusableRow
            key={entry.key}
            onPress={() => {
              onPick(entry);
            }}
          />
        ) : (
          <PaletteRow
            key={entry.key}
            entry={entry}
            reason={reason}
            favourite={entry.usageId !== null && favourites.includes(entry.usageId)}
            onPick={onPick}
            onToggleFavourite={onToggleFavourite}
          />
        ),
      )}
    </View>
  );
}
