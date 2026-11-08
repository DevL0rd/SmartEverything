import type { ReactNode } from 'react';
import { View } from 'react-native';
import { categoryName } from '@smarteverything/domain';
import { isIconName, type IconName } from '../../../../components/icon';
import { IconButton } from '../../../../components/icon-button';
import { IconWell } from '../../../../components/icon-well';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { useColour } from '../../../../design/colour';
import { categoryColour } from '../../../../design/node-colours';
import type { PaletteEntry, PaletteSectionId } from './palette-categories';

const FALLBACK_ICON: IconName = 'puzzle';
const REUSABLE_ICON: IconName = 'box';

export function sectionTitle(id: PaletteSectionId): string {
  return id === 'snippets' ? 'Snippets' : categoryName(id);
}

export function entryIcon(entry: PaletteEntry): IconName {
  if (isIconName(entry.icon)) return entry.icon;
  return entry.section === 'reusable' ? REUSABLE_ICON : FALLBACK_ICON;
}

export function rowLabel(entry: PaletteEntry): string {
  return `${entry.name}. ${entry.meaning} ${entry.takes}.`;
}

export interface PaletteRowProps {
  readonly entry: PaletteEntry;
  readonly favourite: boolean;
  readonly onPick: (entry: PaletteEntry) => void;
  readonly onToggleFavourite: (entry: PaletteEntry) => void;
}

function ColourBar({ section }: { readonly section: PaletteSectionId }): ReactNode {
  const bar = { backgroundColor: useColour(categoryColour(sectionTitle(section))) };
  return <View aria-hidden style={bar} className="w-1 self-stretch" />;
}

function RowText({ entry }: { readonly entry: PaletteEntry }): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5 py-2">
      <Text variant="body-strong" numberOfLines={1}>
        {entry.name}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {entry.meaning}
      </Text>
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {entry.takes}
      </Text>
    </View>
  );
}

export function PaletteRow({
  entry,
  favourite,
  onPick,
  onToggleFavourite,
}: PaletteRowProps): ReactNode {
  const favouritable = entry.usageId !== null;
  return (
    <View className="flex-row items-center">
      <Interactive
        label={rowLabel(entry)}
        onPress={() => {
          onPick(entry);
        }}
        className="min-h-touch-min flex-1 flex-row items-center gap-3 pr-2"
        layerClassName="rounded-sm"
      >
        <ColourBar section={entry.section} />
        <IconWell icon={entryIcon(entry)} colour={categoryColour(sectionTitle(entry.section))} />
        <RowText entry={entry} />
      </Interactive>
      {favouritable ? (
        <IconButton
          icon="star"
          label={
            favourite ? `Remove ${entry.name} from favourites` : `Add ${entry.name} to favourites`
          }
          selected={favourite}
          onPress={() => {
            onToggleFavourite(entry);
          }}
        />
      ) : null}
    </View>
  );
}
